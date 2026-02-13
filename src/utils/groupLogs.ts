import type { ParsedLogEvent } from "../types";

function getTimestampRange(logs: ParsedLogEvent[]): {
  firstTimestamp: number;
  lastTimestamp: number;
} {
  if (logs.length === 0) {
    return { firstTimestamp: 0, lastTimestamp: 0 };
  }
  let first = logs[0].timestamp;
  let last = logs[0].timestamp;
  for (let i = 1; i < logs.length; i++) {
    const ts = logs[i].timestamp;
    if (ts < first) {
      first = ts;
    }
    if (ts > last) {
      last = ts;
    }
  }
  return { firstTimestamp: first, lastTimestamp: last };
}

export interface LogGroupSectionMetadata {
  logCount: number;
  hasError: boolean;
  firstTimestamp: number;
  lastTimestamp: number;
  // Invocation-specific (undefined for stream groups)
  requestId?: string;
  duration?: number;
  billedDuration?: number;
  memoryUsed?: number;
  memoryAllocated?: number;
  inProgress?: boolean;
  // Init-specific (cold start groups)
  initDuration?: number;
}

export interface LogGroupSection {
  id: string;
  label: string;
  logs: ParsedLogEvent[];
  collapsed: boolean;
  metadata: LogGroupSectionMetadata;
}

export function groupLogsByStream(logs: ParsedLogEvent[]): LogGroupSection[] {
  const streamMap = new Map<string, ParsedLogEvent[]>();

  for (const log of logs) {
    const streamName = log.log_stream_name ?? "(unknown stream)";
    const existing = streamMap.get(streamName);
    if (existing) {
      existing.push(log);
    } else {
      streamMap.set(streamName, [log]);
    }
  }

  const groups: LogGroupSection[] = [];
  for (const [streamName, streamLogs] of streamMap) {
    const hasError = streamLogs.some((l) => l.level === "error");
    const { firstTimestamp, lastTimestamp } = getTimestampRange(streamLogs);
    groups.push({
      id: streamName,
      label: streamName,
      logs: streamLogs,
      collapsed: false,
      metadata: {
        logCount: streamLogs.length,
        hasError,
        firstTimestamp,
        lastTimestamp,
      },
    });
  }

  // Sort by start time (oldest first) for chronological ordering
  groups.sort((a, b) => a.metadata.firstTimestamp - b.metadata.firstTimestamp);

  return groups;
}

// Lambda system log patterns
const START_PATTERN = /^START RequestId: ([\w-]+)/;
const END_PATTERN = /^END RequestId: ([\w-]+)/;
const REPORT_PATTERN =
  /^REPORT RequestId: ([\w-]+)\tDuration: ([\d.]+) ms\tBilled Duration: (\d+) ms\tMemory Size: (\d+) MB\tMax Memory Used: (\d+) MB/;
const INIT_REPORT_PATTERN = /^INIT_REPORT Init Duration: ([\d.]+) ms/;

function isInitLog(message: string): boolean {
  if (message.match(INIT_REPORT_PATTERN)) {
    return true;
  } else if (message.startsWith("EXTENSION")) {
    return true;
  } else if (message.startsWith("[AWS")) {
    return true;
  } else {
    return false;
  }
}

function parseReportLine(message: string): {
  requestId: string;
  duration: number;
  billedDuration: number;
  memoryAllocated: number;
  memoryUsed: number;
} | null {
  const match = message.match(REPORT_PATTERN);
  if (match) {
    return {
      requestId: match[1],
      duration: parseFloat(match[2]),
      billedDuration: parseInt(match[3], 10),
      memoryAllocated: parseInt(match[4], 10),
      memoryUsed: parseInt(match[5], 10),
    };
  } else {
    return null;
  }
}

export function groupLogsByInvocation(
  logs: ParsedLogEvent[],
): LogGroupSection[] {
  const invocations = new Map<string, ParsedLogEvent[]>();
  const orphanLogs: ParsedLogEvent[] = [];
  const reportData = new Map<string, ReturnType<typeof parseReportLine>>();
  const completedIds = new Set<string>();
  const initGroups: { logs: ParsedLogEvent[]; initDuration?: number }[] = [];

  // Track which request ID is "current" per stream
  const activeRequestByStream = new Map<string, string>();
  // Track pending init logs per stream (before a START arrives)
  const pendingInitByStream = new Map<string, ParsedLogEvent[]>();

  function flushPendingInit(stream: string) {
    const pending = pendingInitByStream.get(stream);
    if (pending && pending.length > 0) {
      const hasInitMarker = pending.some((l) => isInitLog(l.message));
      if (hasInitMarker) {
        // Parse INIT_REPORT duration if present
        let initDuration: number | undefined;
        for (const l of pending) {
          const match = l.message.match(INIT_REPORT_PATTERN);
          if (match) {
            initDuration = parseFloat(match[1]);
            break;
          }
        }
        initGroups.push({ logs: [...pending], initDuration });
      } else {
        // No init markers — treat as regular orphan logs
        for (const l of pending) {
          orphanLogs.push(l);
        }
      }
      pending.length = 0;
    }
  }

  for (const log of logs) {
    const stream = log.log_stream_name ?? "";
    const startMatch = log.message.match(START_PATTERN);
    if (startMatch) {
      // Flush any pending init logs for this stream before starting invocation
      flushPendingInit(stream);
      const requestId = startMatch[1];
      activeRequestByStream.set(stream, requestId);
      if (!invocations.has(requestId)) {
        invocations.set(requestId, []);
      }
      invocations.get(requestId)!.push(log);
    } else {
      const endMatch = log.message.match(END_PATTERN);
      if (endMatch) {
        const requestId = endMatch[1];
        completedIds.add(requestId);
        if (invocations.has(requestId)) {
          invocations.get(requestId)!.push(log);
        }
        // Clear active request so subsequent logs go to pending init
        activeRequestByStream.delete(stream);
      } else {
        const report = parseReportLine(log.message);
        if (report) {
          completedIds.add(report.requestId);
          reportData.set(report.requestId, report);
          if (invocations.has(report.requestId)) {
            invocations.get(report.requestId)!.push(log);
          }
          // Clear active request so subsequent logs go to pending init
          activeRequestByStream.delete(stream);
        } else {
          // Regular log line — assign to active invocation or collect as pending init
          const activeRequestId = activeRequestByStream.get(stream);
          if (activeRequestId && invocations.has(activeRequestId)) {
            invocations.get(activeRequestId)!.push(log);
          } else {
            // No active invocation — accumulate as potential init log
            const pending = pendingInitByStream.get(stream);
            if (pending) {
              pending.push(log);
            } else {
              pendingInitByStream.set(stream, [log]);
            }
          }
        }
      }
    }
  }

  // Flush any remaining pending init logs (e.g., init at end of log window without a START)
  for (const stream of pendingInitByStream.keys()) {
    flushPendingInit(stream);
  }

  const groups: LogGroupSection[] = [];

  for (const [requestId, invocationLogs] of invocations) {
    const report = reportData.get(requestId);
    const hasError = invocationLogs.some((l) => l.level === "error");
    const { firstTimestamp, lastTimestamp } = getTimestampRange(invocationLogs);
    const isComplete = completedIds.has(requestId);

    groups.push({
      id: requestId,
      label: requestId,
      logs: invocationLogs,
      collapsed: false,
      metadata: {
        logCount: invocationLogs.length,
        hasError,
        firstTimestamp,
        lastTimestamp,
        requestId,
        duration: report?.duration,
        billedDuration: report?.billedDuration,
        memoryUsed: report?.memoryUsed,
        memoryAllocated: report?.memoryAllocated,
        inProgress: !isComplete,
      },
    });
  }

  // Add init groups (cold starts)
  for (const initGroup of initGroups) {
    const { firstTimestamp, lastTimestamp } = getTimestampRange(initGroup.logs);
    groups.push({
      id: `init-${firstTimestamp}`,
      label: "Init",
      logs: initGroup.logs,
      collapsed: false,
      metadata: {
        logCount: initGroup.logs.length,
        hasError: initGroup.logs.some((l) => l.level === "error"),
        firstTimestamp,
        lastTimestamp,
        initDuration: initGroup.initDuration,
      },
    });
  }

  // Add remaining orphan logs as a separate group
  if (orphanLogs.length > 0) {
    const { firstTimestamp, lastTimestamp } = getTimestampRange(orphanLogs);
    groups.push({
      id: "ungrouped",
      label: "Ungrouped logs",
      logs: orphanLogs,
      collapsed: false,
      metadata: {
        logCount: orphanLogs.length,
        hasError: orphanLogs.some((l) => l.level === "error"),
        firstTimestamp,
        lastTimestamp,
      },
    });
  }

  // Sort by start time (oldest first) for chronological ordering
  groups.sort((a, b) => a.metadata.firstTimestamp - b.metadata.firstTimestamp);

  return groups;
}
