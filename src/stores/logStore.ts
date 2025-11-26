import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { LogEvent, LogGroup, ParsedLogEvent, LogLevel } from "../types";
import {
  useSettingsStore,
  LOG_LEVEL_JSON_FIELDS,
  getSortedLogLevels,
} from "./settingsStore";

interface AwsConnectionInfo {
  profile: string | null;
  region: string | null;
}

interface LogStore {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  awsInfo: AwsConnectionInfo | null;

  // Log groups
  logGroups: LogGroup[];
  selectedLogGroup: string | null;

  // Logs
  logs: ParsedLogEvent[];
  isLoading: boolean;
  error: string | null;

  // Filtering
  filterText: string;
  disabledLevels: Set<LogLevel>; // Track disabled levels instead of enabled (empty = all enabled)
  filteredLogs: ParsedLogEvent[];

  // Expanded log detail
  expandedLogIndex: number | null;

  // Time range
  timeRange: { start: number; end: number | null } | null;

  // Live tail
  isTailing: boolean;
  tailInterval: ReturnType<typeof setInterval> | null;

  // Actions
  initializeAws: () => Promise<void>;
  loadLogGroups: () => Promise<void>;
  selectLogGroup: (name: string) => void;
  fetchLogs: (startTime?: number, endTime?: number) => Promise<void>;
  setFilterText: (text: string) => void;
  toggleLevel: (level: LogLevel) => void;
  setExpandedLogIndex: (index: number | null) => void;
  setTimeRange: (range: { start: number; end: number | null } | null) => void;
  startTail: () => void;
  stopTail: () => void;
  clearLogs: () => void;
}

function parseLogLevel(
  message: string,
  parsedJson: Record<string, unknown> | null,
): LogLevel {
  const { logLevels } = useSettingsStore.getState();
  const sortedLevels = getSortedLogLevels(logLevels);

  // Priority 1: Check JSON level fields for keyword matches
  if (parsedJson) {
    for (const field of LOG_LEVEL_JSON_FIELDS) {
      const fieldValue = parsedJson[field];
      if (typeof fieldValue === "string") {
        const valueLower = fieldValue.toLowerCase();
        for (const level of sortedLevels) {
          if (level.keywords.some((k) => k.toLowerCase() === valueLower)) {
            return level.id;
          }
        }
      }
    }
  }

  // Priority 2: Check for keyword in message (surrounded by whitespace or at boundaries)
  for (const level of sortedLevels) {
    for (const keyword of level.keywords) {
      const keywordLower = keyword.toLowerCase();
      // Match keyword surrounded by non-word characters or at string boundaries
      const regex = new RegExp(
        `(?:^|[\\s\\t\\[\\]():])${keywordLower}(?:[\\s\\t\\[\\]():]|$)`,
        "i",
      );
      if (regex.test(message)) {
        return level.id;
      }
    }
  }

  // Priority 3: No match found
  return "unknown";
}

function tryParseJson(message: string): Record<string, unknown> | null {
  try {
    const trimmed = message.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function parseLogEvent(event: LogEvent): ParsedLogEvent {
  const parsedJson = tryParseJson(event.message);
  return {
    ...event,
    level: parseLogLevel(event.message, parsedJson),
    parsedJson,
    formattedTime: formatTimestamp(event.timestamp),
  };
}

function filterLogs(
  logs: ParsedLogEvent[],
  filterText: string,
  disabledLevels: Set<LogLevel>,
): ParsedLogEvent[] {
  let filtered = logs;

  // Filter by enabled levels (exclude disabled ones)
  if (disabledLevels.size > 0) {
    filtered = filtered.filter((log) => !disabledLevels.has(log.level));
  }

  // Filter by text
  if (filterText.trim()) {
    const lowerFilter = filterText.toLowerCase();

    // Check for field:value syntax
    const fieldMatch = filterText.match(/^(\w+(?:\.\w+)*):(.+)$/);
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      const lowerValue = value.toLowerCase();

      filtered = filtered.filter((log) => {
        if (log.parsedJson) {
          const fieldValue = getNestedValue(log.parsedJson, field);
          if (fieldValue !== undefined) {
            return String(fieldValue).toLowerCase().includes(lowerValue);
          }
        }
        return false;
      });
    } else {
      // Simple text search
      filtered = filtered.filter((log) =>
        log.message.toLowerCase().includes(lowerFilter),
      );
    }
  }

  return filtered;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (
      current &&
      typeof current === "object" &&
      key in (current as Record<string, unknown>)
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const useLogStore = create<LogStore>((set, get) => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  awsInfo: null,
  logGroups: [],
  selectedLogGroup: null,
  logs: [],
  isLoading: false,
  error: null,
  filterText: "",
  disabledLevels: new Set(),
  filteredLogs: [],
  expandedLogIndex: null,
  timeRange: null,
  isTailing: false,
  tailInterval: null,

  initializeAws: async () => {
    set({ isConnecting: true, connectionError: null });
    try {
      const awsInfo = await invoke<AwsConnectionInfo>("init_aws_client");
      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null,
        awsInfo,
      });
      await get().loadLogGroups();
    } catch (error) {
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: error instanceof Error ? error.message : String(error),
        awsInfo: null,
      });
    }
  },

  loadLogGroups: async () => {
    try {
      const groups = await invoke<LogGroup[]>("list_log_groups");
      set({ logGroups: groups });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  selectLogGroup: (name: string) => {
    const { stopTail } = get();
    stopTail();
    set({ selectedLogGroup: name, logs: [], filteredLogs: [], error: null });
  },

  fetchLogs: async (startTime?: number, endTime?: number) => {
    const { selectedLogGroup, filterText, disabledLevels } = get();
    if (!selectedLogGroup) return;

    set({ isLoading: true, error: null, expandedLogIndex: null });

    try {
      // Default to last 30 minutes if no time range specified
      const now = Date.now();
      const defaultStart = startTime ?? now - 30 * 60 * 1000;

      const rawLogs = await invoke<LogEvent[]>("fetch_logs", {
        logGroupName: selectedLogGroup,
        startTime: defaultStart,
        endTime: endTime ?? null,
        filterPattern: null,
        limit: 1000,
      });

      const parsedLogs = rawLogs.map(parseLogEvent);
      const filtered = filterLogs(parsedLogs, filterText, disabledLevels);

      set({ logs: parsedLogs, filteredLogs: filtered, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  setFilterText: (text: string) => {
    const { logs, disabledLevels } = get();
    const filtered = filterLogs(logs, text, disabledLevels);
    set({ filterText: text, filteredLogs: filtered, expandedLogIndex: null });
  },

  toggleLevel: (level: LogLevel) => {
    const { logs, filterText, disabledLevels } = get();
    const newDisabled = new Set(disabledLevels);
    if (newDisabled.has(level)) {
      newDisabled.delete(level);
    } else {
      newDisabled.add(level);
    }
    const filtered = filterLogs(logs, filterText, newDisabled);
    set({
      disabledLevels: newDisabled,
      filteredLogs: filtered,
      expandedLogIndex: null,
    });
  },

  setExpandedLogIndex: (index: number | null) => {
    set({ expandedLogIndex: index });
  },

  setTimeRange: (range: { start: number; end: number | null } | null) => {
    set({ timeRange: range });
    if (range) {
      get().fetchLogs(range.start, range.end ?? undefined);
    }
  },

  startTail: () => {
    const { isTailing, fetchLogs, selectedLogGroup } = get();
    if (isTailing || !selectedLogGroup) return;

    // Initial fetch
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    fetchLogs(thirtyMinutesAgo);

    // Set up polling
    const interval = setInterval(async () => {
      const { logs, filterText, disabledLevels } = get();
      const lastTimestamp =
        logs.length > 0
          ? logs[logs.length - 1].timestamp
          : Date.now() - 30 * 60 * 1000;

      try {
        const newLogs = await invoke<LogEvent[]>("fetch_logs", {
          logGroupName: get().selectedLogGroup,
          startTime: lastTimestamp + 1,
          endTime: null,
          filterPattern: null,
          limit: 100,
        });

        if (newLogs.length > 0) {
          const parsedNew = newLogs.map(parseLogEvent);
          const allLogs = [...get().logs, ...parsedNew];

          // Keep max 50000 logs in memory
          const trimmedLogs = allLogs.slice(-50000);
          const filtered = filterLogs(trimmedLogs, filterText, disabledLevels);

          set({ logs: trimmedLogs, filteredLogs: filtered });
        }
      } catch (error) {
        console.error("Tail fetch error:", error);
      }
    }, 2000);

    set({ isTailing: true, tailInterval: interval });
  },

  stopTail: () => {
    const { tailInterval } = get();
    if (tailInterval) {
      clearInterval(tailInterval);
    }
    set({ isTailing: false, tailInterval: null });
  },

  clearLogs: () => {
    set({ logs: [], filteredLogs: [] });
  },
}));
