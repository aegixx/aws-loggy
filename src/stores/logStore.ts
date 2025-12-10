import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { LogEvent, LogGroup, ParsedLogEvent, LogLevel } from "../types";
import {
  useSettingsStore,
  LOG_LEVEL_JSON_FIELDS,
  getSortedLogLevels,
} from "./settingsStore";

// Module-level variables to track tail state (survives HMR)
let tailIntervalId: ReturnType<typeof setInterval> | null = null;
let tailStartTimestamp: number | null = null;

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
  loadingProgress: number; // Number of logs fetched so far during loading
  loadingSizeBytes: number; // Size of logs fetched so far during loading
  totalSizeBytes: number; // Total size of all loaded logs
  error: string | null;

  // Filtering
  filterText: string;
  disabledLevels: Set<LogLevel>; // Track disabled levels instead of enabled (empty = all enabled)
  filteredLogs: ParsedLogEvent[];

  // Expanded log detail
  expandedLogIndex: number | null;

  // Selected row for keyboard navigation
  selectedLogIndex: number | null;

  // Time range
  timeRange: { start: number; end: number | null } | null;

  // Live tail
  isTailing: boolean;

  // Actions
  initializeAws: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  loadLogGroups: () => Promise<void>;
  selectLogGroup: (name: string) => void;
  fetchLogs: (startTime?: number, endTime?: number) => Promise<void>;
  setFilterText: (text: string) => void;
  toggleLevel: (level: LogLevel) => void;
  setExpandedLogIndex: (index: number | null) => void;
  setSelectedLogIndex: (index: number | null) => void;
  setTimeRange: (range: { start: number; end: number | null } | null) => void;
  startTail: () => void;
  stopTail: () => void;
  clearLogs: () => void;
  resetFilters: () => void;
  resetState: () => void;
  setLoadingProgress: (count: number, sizeBytes: number) => void;
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
  loadingProgress: 0,
  loadingSizeBytes: 0,
  totalSizeBytes: 0,
  error: null,
  filterText: "",
  disabledLevels: new Set(),
  filteredLogs: [],
  expandedLogIndex: null,
  selectedLogIndex: null,
  timeRange: null,
  isTailing: false,

  initializeAws: async () => {
    set({ isConnecting: true, connectionError: null });
    try {
      // Get the saved profile from settings
      const { awsProfile } = useSettingsStore.getState();
      const awsInfo = await invoke<AwsConnectionInfo>("init_aws_client", {
        profile: awsProfile,
      });
      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null,
        awsInfo,
      });
      await get().loadLogGroups();

      // Auto-select last used log group if available
      const { lastSelectedLogGroup } = useSettingsStore.getState();
      const { logGroups, selectLogGroup } = get();
      if (
        lastSelectedLogGroup &&
        logGroups.some((g) => g.name === lastSelectedLogGroup)
      ) {
        selectLogGroup(lastSelectedLogGroup);
      }
    } catch (error) {
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: error instanceof Error ? error.message : String(error),
        awsInfo: null,
      });
    }
  },

  refreshConnection: async () => {
    const { selectedLogGroup, timeRange, fetchLogs } = get();
    set({ isConnecting: true, connectionError: null });
    try {
      // Get the saved profile from settings
      const { awsProfile } = useSettingsStore.getState();
      // Use reconnect_aws to clear and reinitialize with fresh credentials
      const awsInfo = await invoke<AwsConnectionInfo>("reconnect_aws", {
        profile: awsProfile,
      });
      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null,
        awsInfo,
      });
      await get().loadLogGroups();
      // Re-fetch logs if a log group was selected
      if (selectedLogGroup) {
        await fetchLogs(timeRange?.start, timeRange?.end ?? undefined);
      }
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
    console.log("[User Activity] Select log group:", name);
    const { stopTail, fetchLogs, timeRange } = get();
    const { getDefaultDisabledLevels, setLastSelectedLogGroup } =
      useSettingsStore.getState();
    stopTail();
    set({
      selectedLogGroup: name,
      logs: [],
      filteredLogs: [],
      error: null,
      disabledLevels: getDefaultDisabledLevels(),
    });

    // Persist selection to settings
    setLastSelectedLogGroup(name);

    // Automatically fetch logs with existing time range/filters
    if (name) {
      fetchLogs(timeRange?.start, timeRange?.end ?? undefined);
    }
  },

  fetchLogs: async (startTime?: number, endTime?: number) => {
    const { selectedLogGroup, filterText, disabledLevels } = get();
    if (!selectedLogGroup) return;

    set({
      isLoading: true,
      loadingProgress: 0,
      loadingSizeBytes: 0,
      error: null,
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
    });

    try {
      // Default to last 15 minutes if no time range specified
      const now = Date.now();
      const defaultStart = startTime ?? now - 15 * 60 * 1000;

      // Use current time as end if not specified, to get logs "up to now"
      const effectiveEnd = endTime ?? Date.now();

      // Get cache limits from settings
      const { cacheLimits } = useSettingsStore.getState();

      const rawLogs = await invoke<LogEvent[]>("fetch_logs", {
        logGroupName: selectedLogGroup,
        startTime: defaultStart,
        endTime: effectiveEnd,
        filterPattern: null,
        maxCount: cacheLimits.maxLogCount,
        maxSizeMb: cacheLimits.maxSizeMb,
      });

      const parsedLogs = rawLogs.map(parseLogEvent);
      const filtered = filterLogs(parsedLogs, filterText, disabledLevels);

      // Calculate total size of loaded logs
      const totalSize = rawLogs.reduce(
        (sum, log) => sum + log.message.length,
        0,
      );

      set({
        logs: parsedLogs,
        filteredLogs: filtered,
        isLoading: false,
        totalSizeBytes: totalSize,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  setFilterText: (text: string) => {
    console.log("[User Activity] Set filter text:", text || "(empty)");
    const { logs, disabledLevels } = get();
    const filtered = filterLogs(logs, text, disabledLevels);
    set({
      filterText: text,
      filteredLogs: filtered,
      expandedLogIndex: null,
      selectedLogIndex: null,
    });
  },

  toggleLevel: (level: LogLevel) => {
    const { logs, filterText, disabledLevels } = get();
    const newDisabled = new Set(disabledLevels);
    if (newDisabled.has(level)) {
      newDisabled.delete(level);
      console.log("[User Activity] Enable level:", level);
    } else {
      newDisabled.add(level);
      console.log("[User Activity] Disable level:", level);
    }
    const filtered = filterLogs(logs, filterText, newDisabled);
    set({
      disabledLevels: newDisabled,
      filteredLogs: filtered,
      expandedLogIndex: null,
      selectedLogIndex: null,
    });
  },

  setExpandedLogIndex: (index: number | null) => {
    console.log(
      "[User Activity]",
      index !== null ? `Expand log at index ${index}` : "Collapse log",
    );
    set({ expandedLogIndex: index });
  },

  setSelectedLogIndex: (index: number | null) => {
    set({ selectedLogIndex: index });
  },

  setTimeRange: (range: { start: number; end: number | null } | null) => {
    if (range) {
      const startDate = new Date(range.start).toISOString();
      const endDate = range.end ? new Date(range.end).toISOString() : "now";
      console.log("[User Activity] Set time range:", startDate, "to", endDate);
    } else {
      console.log("[User Activity] Clear time range");
    }
    set({ timeRange: range });
    if (range) {
      get().fetchLogs(range.start, range.end ?? undefined);
    }
  },

  startTail: () => {
    const { isTailing, selectedLogGroup } = get();
    if (!selectedLogGroup) return;

    // If already tailing, don't start another interval
    if (isTailing) return;

    // Defensive: clear any orphaned interval (survives HMR)
    if (tailIntervalId) {
      clearInterval(tailIntervalId);
      tailIntervalId = null;
    }

    console.log("[User Activity] Start live tail");

    // Track when tail started - used to filter out older logs
    tailStartTimestamp = Date.now();

    // Clear existing logs - live tail starts fresh from now
    set({
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
    });

    // Set up polling with module-level variable (survives HMR)
    tailIntervalId = setInterval(async () => {
      const { logs, filterText, disabledLevels } = get();
      // If logs exist, fetch from last timestamp; otherwise look back 30s to account for CloudWatch delivery latency
      const lastTimestamp =
        logs.length > 0 ? logs[logs.length - 1].timestamp : Date.now() - 30000;

      console.log("[Backend Activity] Polling from timestamp:", lastTimestamp);

      try {
        const newLogs = await invoke<LogEvent[]>("fetch_logs", {
          logGroupName: get().selectedLogGroup,
          startTime: lastTimestamp + 1,
          endTime: null,
          filterPattern: null,
          limit: 100,
        });

        if (newLogs.length > 0) {
          // Filter out logs older than when the tail started (handles lookback window)
          const filteredByTime = tailStartTimestamp
            ? newLogs.filter((log) => log.timestamp >= tailStartTimestamp!)
            : newLogs;

          if (filteredByTime.length === 0) {
            return;
          }

          // Once we've received logs past our start timestamp, we've caught up - disable filter for performance
          if (tailStartTimestamp) {
            console.log(
              "[Backend Activity] Caught up to tail start, disabling time filter",
            );
            tailStartTimestamp = null;
          }

          console.log(
            "[Backend Activity] Fetched",
            filteredByTime.length,
            "new logs",
          );
          const parsedNew = filteredByTime.map(parseLogEvent);
          const allLogs = [...get().logs, ...parsedNew];

          // Keep max 50000 logs in memory
          const trimmedLogs = allLogs.slice(-50000);
          const filtered = filterLogs(trimmedLogs, filterText, disabledLevels);

          set({ logs: trimmedLogs, filteredLogs: filtered });
        }
      } catch (error) {
        console.error("[Backend Activity] Tail fetch error:", error);
      }
    }, 2000);

    set({ isTailing: true });
  },

  stopTail: () => {
    if (tailIntervalId) {
      console.log("[User Activity] Stop live tail");
      clearInterval(tailIntervalId);
      tailIntervalId = null;
    }
    tailStartTimestamp = null;
    set({ isTailing: false });
  },

  clearLogs: () => {
    console.log("[User Activity] Clear logs");
    const { selectedLogGroup, fetchLogs, timeRange, isTailing } = get();

    // If tailing, reset the tail start timestamp so we only show logs from now
    if (isTailing) {
      tailStartTimestamp = Date.now();
    }

    // Clear logs but keep current filters
    set({
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
    });

    // If tailing, don't re-fetch - the tail will pick up new logs from now
    // If not tailing, re-fetch with current time range
    if (selectedLogGroup && !isTailing) {
      fetchLogs(timeRange?.start, timeRange?.end ?? undefined);
    }
  },

  resetFilters: () => {
    console.log("[User Activity] Reset filters to defaults");
    const { selectedLogGroup, fetchLogs } = get();
    const { getDefaultDisabledLevels } = useSettingsStore.getState();

    // Reset all filters to defaults and clear logs
    set({
      logs: [],
      filteredLogs: [],
      filterText: "",
      disabledLevels: getDefaultDisabledLevels(),
      timeRange: null,
      expandedLogIndex: null,
      selectedLogIndex: null,
    });

    // Trigger a fresh query with default time range
    if (selectedLogGroup) {
      fetchLogs();
    }
  },

  resetState: () => {
    const { stopTail } = get();
    const { getDefaultDisabledLevels, setLastSelectedLogGroup } =
      useSettingsStore.getState();

    // Stop any active tail
    stopTail();

    // Clear persisted log group selection
    setLastSelectedLogGroup(null);

    // Reset all state to initial values
    set({
      selectedLogGroup: null,
      logs: [],
      filteredLogs: [],
      filterText: "",
      disabledLevels: getDefaultDisabledLevels(),
      timeRange: null,
      expandedLogIndex: null,
      selectedLogIndex: null,
      error: null,
      isLoading: false,
      loadingProgress: 0,
      loadingSizeBytes: 0,
      totalSizeBytes: 0,
    });
  },

  setLoadingProgress: (count: number, sizeBytes: number) => {
    set({ loadingProgress: count, loadingSizeBytes: sizeBytes });
  },
}));
