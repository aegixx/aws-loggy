import { describe, it, expect } from "vitest";
import { computeDisplayItems, type DisplayItem } from "../hooks/useLogGroups";
import type { ParsedLogEvent } from "../types";
import type { LogGroupSection } from "../utils/groupLogs";

function createMockLog(
  message: string,
  overrides: Partial<ParsedLogEvent> = {},
): ParsedLogEvent {
  return {
    timestamp: Date.now(),
    message,
    log_stream_name: "test-stream",
    event_id: `event-${Math.random()}`,
    level: "info",
    parsedJson: null,
    formattedTime: "Jan 01, 00:00:00",
    ...overrides,
  };
}

describe("computeDisplayItems", () => {
  it("should return flat log items when mode is none", () => {
    const logs = [createMockLog("msg1"), createMockLog("msg2")];
    const items = computeDisplayItems(logs, "none", new Set(), []);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("log");
    expect(items[1].type).toBe("log");
  });

  it("should preserve logIndex for flat log items", () => {
    const logs = [createMockLog("msg1"), createMockLog("msg2")];
    const items = computeDisplayItems(logs, "none", new Set(), []);
    const logItems = items.filter(
      (i): i is DisplayItem & { type: "log" } => i.type === "log",
    );
    expect(logItems[0].logIndex).toBe(0);
    expect(logItems[1].logIndex).toBe(1);
  });

  it("should interleave headers and logs when groups are provided", () => {
    const log1 = createMockLog("msg1", {
      log_stream_name: "stream-a",
      timestamp: 1000,
    });
    const log2 = createMockLog("msg2", {
      log_stream_name: "stream-b",
      timestamp: 2000,
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-b",
        label: "stream-b",
        logs: [log2],
        collapsed: false,
        metadata: {
          logCount: 1,
          hasError: false,
          firstTimestamp: 2000,
          lastTimestamp: 2000,
        },
      },
      {
        id: "stream-a",
        label: "stream-a",
        logs: [log1],
        collapsed: false,
        metadata: {
          logCount: 1,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 1000,
        },
      },
    ];
    const items = computeDisplayItems(
      [log1, log2],
      "stream",
      new Set(),
      groups,
    );
    expect(items).toHaveLength(4); // 2 headers + 2 logs
    expect(items[0].type).toBe("header");
    expect(items[1].type).toBe("log");
    expect(items[2].type).toBe("header");
    expect(items[3].type).toBe("log");
  });

  it("should hide logs when group is collapsed", () => {
    const log1 = createMockLog("msg1", {
      log_stream_name: "stream-a",
      timestamp: 1000,
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-a",
        label: "stream-a",
        logs: [log1],
        collapsed: false,
        metadata: {
          logCount: 1,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 1000,
        },
      },
    ];
    const collapsed = new Set(["stream-a"]);
    const items = computeDisplayItems([log1], "stream", collapsed, groups);
    expect(items).toHaveLength(1); // header only
    expect(items[0].type).toBe("header");
  });

  it("should map logIndex correctly for grouped logs", () => {
    const log1 = createMockLog("msg1", {
      log_stream_name: "stream-a",
      timestamp: 1000,
    });
    const log2 = createMockLog("msg2", {
      log_stream_name: "stream-a",
      timestamp: 2000,
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-a",
        label: "stream-a",
        logs: [log1, log2],
        collapsed: false,
        metadata: {
          logCount: 2,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 2000,
        },
      },
    ];
    const items = computeDisplayItems(
      [log1, log2],
      "stream",
      new Set(),
      groups,
    );
    const logItems = items.filter(
      (i): i is DisplayItem & { type: "log" } => i.type === "log",
    );
    expect(logItems[0].logIndex).toBe(0);
    expect(logItems[1].logIndex).toBe(1);
  });

  it("should return empty array for empty logs in none mode", () => {
    const items = computeDisplayItems([], "none", new Set(), []);
    expect(items).toHaveLength(0);
  });

  it("should return empty array for empty groups in grouped mode", () => {
    const items = computeDisplayItems([], "stream", new Set(), []);
    expect(items).toHaveLength(0);
  });

  it("should handle multiple collapsed and expanded groups", () => {
    const log1 = createMockLog("msg1", {
      log_stream_name: "stream-a",
      timestamp: 1000,
    });
    const log2 = createMockLog("msg2", {
      log_stream_name: "stream-b",
      timestamp: 2000,
    });
    const log3 = createMockLog("msg3", {
      log_stream_name: "stream-b",
      timestamp: 3000,
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-b",
        label: "stream-b",
        logs: [log2, log3],
        collapsed: false,
        metadata: {
          logCount: 2,
          hasError: false,
          firstTimestamp: 2000,
          lastTimestamp: 3000,
        },
      },
      {
        id: "stream-a",
        label: "stream-a",
        logs: [log1],
        collapsed: false,
        metadata: {
          logCount: 1,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 1000,
        },
      },
    ];
    // Collapse stream-b, leave stream-a expanded
    const collapsed = new Set(["stream-b"]);
    const items = computeDisplayItems(
      [log1, log2, log3],
      "stream",
      collapsed,
      groups,
    );
    // stream-b header only (collapsed) + stream-a header + 1 log
    expect(items).toHaveLength(3);
    expect(items[0].type).toBe("header");
    expect(items[1].type).toBe("header");
    expect(items[2].type).toBe("log");
  });

  it("should hide level-filtered logs but keep group headers", () => {
    const systemLog = createMockLog("START RequestId: abc-123", {
      log_stream_name: "stream-a",
      timestamp: 1000,
      level: "system",
    });
    const infoLog = createMockLog("Processing event...", {
      log_stream_name: "stream-a",
      timestamp: 1001,
      level: "info",
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-a",
        label: "stream-a",
        logs: [systemLog, infoLog],
        collapsed: false,
        metadata: {
          logCount: 2,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 1001,
        },
      },
    ];
    const disabledLevels = new Set(["system"]);
    // filteredLogs only has the info log (system is filtered out)
    const items = computeDisplayItems(
      [infoLog],
      "stream",
      new Set(),
      groups,
      disabledLevels,
    );
    // Header + 1 info log (system log hidden by level filter)
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("header");
    expect(items[1].type).toBe("log");
  });

  it("should hide group when all logs are level-filtered", () => {
    const systemLog1 = createMockLog("START RequestId: abc-123", {
      log_stream_name: "stream-a",
      timestamp: 1000,
      level: "system",
    });
    const systemLog2 = createMockLog("END RequestId: abc-123", {
      log_stream_name: "stream-a",
      timestamp: 1001,
      level: "system",
    });
    const groups: LogGroupSection[] = [
      {
        id: "stream-a",
        label: "stream-a",
        logs: [systemLog1, systemLog2],
        collapsed: false,
        metadata: {
          logCount: 2,
          hasError: false,
          firstTimestamp: 1000,
          lastTimestamp: 1001,
        },
      },
    ];
    const disabledLevels = new Set(["system"]);
    // filteredLogs is empty (all system logs filtered out)
    const items = computeDisplayItems(
      [],
      "stream",
      new Set(),
      groups,
      disabledLevels,
    );
    // Group hidden entirely — no visible logs
    expect(items).toHaveLength(0);
  });
});
