import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { LogEvent, LogGroup, ParsedLogEvent, LogLevel } from "../types";
import {
  useSettingsStore,
  LOG_LEVEL_JSON_FIELDS,
  getSortedLogLevels,
} from "./settingsStore";
import { TailPoller } from "./TailPoller";

// Request ID for cancelling stale fetch requests
let currentFetchId = 0;

// Cache for compiled keyword regex patterns (avoids recompiling on every log)
const keywordRegexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  const key = keyword.toLowerCase();
  let regex = keywordRegexCache.get(key);
  if (!regex) {
    regex = new RegExp(
      `(?:^|[\\s\\t\\[\\]():])${key}(?:[\\s\\t\\[\\]():]|$)`,
      "i",
    );
    keywordRegexCache.set(key, regex);
  }
  return regex;
}

// Cache for filtered results (memoization to avoid redundant filtering)
interface FilterCache {
  logs: ParsedLogEvent[];
  filterText: string;
  disabledLevels: Set<LogLevel>;
  result: ParsedLogEvent[];
}

let filterCache: FilterCache | null = null;

function getFilteredLogs(
  logs: ParsedLogEvent[],
  filterText: string,
  disabledLevels: Set<LogLevel>,
): ParsedLogEvent[] {
  // Check if we can use cached result
  if (
    filterCache &&
    filterCache.logs === logs &&
    filterCache.filterText === filterText &&
    filterCache.disabledLevels === disabledLevels
  ) {
    return filterCache.result;
  }

  // Compute new result
  const result = filterLogs(logs, filterText, disabledLevels);

  // Update cache
  filterCache = { logs, filterText, disabledLevels, result };

  return result;
}

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

  // Multi-selection for drag-select and copy
  selectedLogIndices: Set<number>;

  // Time range
  timeRange: { start: number; end: number | null } | null;

  // Live tail
  isTailing: boolean;
  tailPoller: TailPoller | null;

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
  setSelectedLogIndices: (indices: Set<number>) => void;
  clearSelection: () => void;
  setTimeRange: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => void;
  startTail: () => void;
  stopTail: () => void;
  clearLogs: () => void;
  resetFilters: () => void;
  resetState: () => void;
  setLoadingProgress: (count: number, sizeBytes: number) => void;
  setSessionExpired: () => void;
}

export function parseLogLevel(
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
      if (getKeywordRegex(keyword).test(message)) {
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

/**
 * Checks if a message is incomplete JSON (starts with { but has unbalanced braces).
 * CloudWatch splits large log messages across multiple events, and this detects the fragments.
 */
function isIncompleteJson(msg: string): boolean {
  const trimmed = msg.trim();
  if (!trimmed.startsWith("{")) return false;

  // Count braces - incomplete if unbalanced
  let depth = 0;
  let inString = false;
  let prevChar = "";

  for (const char of trimmed) {
    // Track string boundaries (handle escaped quotes)
    if (char === '"' && prevChar !== "\\") {
      inString = !inString;
    }
    // Only count braces outside of strings
    if (!inString) {
      if (char === "{") depth++;
      if (char === "}") depth--;
    }
    prevChar = char;
  }

  return depth !== 0;
}

/**
 * Checks if a candidate log event should be merged with the first fragment.
 * Fragments must have the same log stream and timestamps within a small window.
 * CloudWatch fragments can have slightly different timestamps (1-20ms apart).
 */
const MERGE_TIMESTAMP_THRESHOLD_MS = 100;

function shouldMerge(
  first: LogEvent,
  candidate: LogEvent,
  accumulated: string,
): boolean {
  // Same stream (required)
  if (first.log_stream_name !== candidate.log_stream_name) return false;

  // Timestamps within threshold (CloudWatch fragments can be 1-20ms apart)
  if (
    Math.abs(first.timestamp - candidate.timestamp) >
    MERGE_TIMESTAMP_THRESHOLD_MS
  )
    return false;

  // Accumulated JSON still incomplete
  return isIncompleteJson(accumulated);
}

/**
 * Merges fragmented log events back into complete messages.
 * CloudWatch splits large messages (e.g., SQL queries with thousands of parameters)
 * across multiple events with the same timestamp and log stream.
 */
function mergeFragmentedLogs(logs: LogEvent[]): LogEvent[] {
  const result: LogEvent[] = [];
  let i = 0;

  while (i < logs.length) {
    const current = logs[i];

    // Check if this looks like a fragment (incomplete JSON)
    if (isIncompleteJson(current.message)) {
      // Try to merge with subsequent events from same stream/timestamp
      let merged = current.message;
      let j = i + 1;

      while (j < logs.length && shouldMerge(current, logs[j], merged)) {
        merged += logs[j].message;
        j++;
      }

      // Create merged event (preserves first fragment's metadata)
      result.push({
        ...current,
        message: merged,
      });
      i = j;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
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
  selectedLogIndices: new Set(),
  timeRange: null,
  isTailing: false,
  tailPoller: null,

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

      // Restore persisted filter state
      const {
        lastSelectedLogGroup,
        getPersistedDisabledLevelsAsSet,
        persistedTimeRange,
        persistedTimePreset,
        getDefaultDisabledLevels,
      } = useSettingsStore.getState();

      const persistedLevels = getPersistedDisabledLevelsAsSet();

      // Recalculate time range from preset (so "1h" is always relative to now)
      const presetToMs: Record<string, number> = {
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
      };

      let restoredTimeRange: { start: number; end: number | null } | null =
        null;
      if (persistedTimePreset && presetToMs[persistedTimePreset]) {
        // Recalculate relative time range from now
        const now = Date.now();
        restoredTimeRange = {
          start: now - presetToMs[persistedTimePreset],
          end: null,
        };
      } else if (persistedTimePreset === "custom" && persistedTimeRange) {
        // Use absolute timestamps for custom ranges
        restoredTimeRange = persistedTimeRange;
      }
      // If no preset or unknown, leave timeRange as null (will use default 15m)

      set({
        disabledLevels:
          persistedLevels.size > 0
            ? persistedLevels
            : getDefaultDisabledLevels(),
        timeRange: restoredTimeRange,
      });

      // Auto-select last used log group if available
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
    const { setLastSelectedLogGroup } = useSettingsStore.getState();
    stopTail();
    set({
      selectedLogGroup: name,
      logs: [],
      filteredLogs: [],
      error: null,
      // Keep current disabledLevels - don't reset on log group switch
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

    // Increment fetch ID to cancel any in-flight requests
    const fetchId = ++currentFetchId;

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

      // Check if this request is still current (user may have started a new fetch)
      if (fetchId !== currentFetchId) {
        console.log("[Backend Activity] Discarding stale fetch results");
        return;
      }

      // Merge fragmented logs before parsing (CloudWatch splits large messages)
      const mergedLogs = mergeFragmentedLogs(rawLogs);
      const parsedLogs = mergedLogs.map(parseLogEvent);
      const filtered = getFilteredLogs(parsedLogs, filterText, disabledLevels);

      // Calculate total size of loaded logs (use merged to reflect actual content)
      const totalSize = mergedLogs.reduce(
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
      // Only set error if this request is still current
      if (fetchId === currentFetchId) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      }
    }
  },

  setFilterText: (text: string) => {
    console.log("[User Activity] Set filter text:", text || "(empty)");
    const { logs, disabledLevels } = get();
    const filtered = getFilteredLogs(logs, text, disabledLevels);
    set({
      filterText: text,
      filteredLogs: filtered,
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
    });
  },

  toggleLevel: (level: LogLevel) => {
    const { logs, filterText, disabledLevels } = get();
    const { setPersistedDisabledLevels } = useSettingsStore.getState();
    const newDisabled = new Set(disabledLevels);
    if (newDisabled.has(level)) {
      newDisabled.delete(level);
      console.log("[User Activity] Enable level:", level);
    } else {
      newDisabled.add(level);
      console.log("[User Activity] Disable level:", level);
    }
    const filtered = getFilteredLogs(logs, filterText, newDisabled);
    set({
      disabledLevels: newDisabled,
      filteredLogs: filtered,
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
    });
    // Persist the change
    setPersistedDisabledLevels(newDisabled);
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

  setSelectedLogIndices: (indices: Set<number>) => {
    set({ selectedLogIndices: indices });
  },

  clearSelection: () => {
    set({ selectedLogIndices: new Set() });
  },

  setTimeRange: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => {
    const { setPersistedTimeRange } = useSettingsStore.getState();
    if (range) {
      const startDate = new Date(range.start).toISOString();
      const endDate = range.end ? new Date(range.end).toISOString() : "now";
      console.log("[User Activity] Set time range:", startDate, "to", endDate);
    } else {
      console.log("[User Activity] Clear time range");
    }
    set({ timeRange: range });
    // Persist the change (including preset label for restoration)
    setPersistedTimeRange(range, preset);
    if (range) {
      get().fetchLogs(range.start, range.end ?? undefined);
    }
  },

  startTail: () => {
    const { isTailing, selectedLogGroup, tailPoller } = get();
    if (!selectedLogGroup) return;

    // If already tailing, don't start another interval
    if (isTailing) return;

    // Cancel any in-flight fetch requests
    currentFetchId++;

    // Stop any existing poller (defensive, survives HMR)
    if (tailPoller) {
      tailPoller.stop();
    }

    // Clear existing logs - live tail starts fresh from now
    set({
      isLoading: false, // Cancel loading state from previous fetch
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
    });

    // Create new TailPoller instance
    const newPoller = new TailPoller(
      selectedLogGroup,
      (newLogs: LogEvent[]) => {
        // Handle new logs from poller
        const { logs, filterText, disabledLevels } = get();

        // Deduplicate: filter out logs we already have (by event_id or timestamp+message)
        const existingIds = new Set(
          logs.map((l) => l.event_id).filter(Boolean),
        );
        const existingKeys = new Set(
          logs.map((l) => `${l.timestamp}:${l.message.slice(0, 100)}`),
        );
        const uniqueNewLogs = newLogs.filter((log) => {
          if (log.event_id && existingIds.has(log.event_id)) return false;
          const key = `${log.timestamp}:${log.message.slice(0, 100)}`;
          return !existingKeys.has(key);
        });

        if (uniqueNewLogs.length === 0) {
          return; // No new unique logs
        }

        // Merge fragmented logs before parsing
        const mergedNew = mergeFragmentedLogs(uniqueNewLogs);
        const parsedNew = mergedNew.map(parseLogEvent);
        const allLogs = [...logs, ...parsedNew];

        // Keep max 50000 logs in memory
        const trimmedLogs = allLogs.slice(-50000);
        const filtered = getFilteredLogs(
          trimmedLogs,
          filterText,
          disabledLevels,
        );

        set({ logs: trimmedLogs, filteredLogs: filtered });
      },
      (error: unknown) => {
        console.error("[Backend Activity] Tail fetch error:", error);
      },
      () => {
        // Get last log timestamp
        const { logs } = get();
        return logs.length > 0 ? logs[logs.length - 1].timestamp : null;
      },
    );

    newPoller.start();

    set({ isTailing: true, tailPoller: newPoller });
  },

  stopTail: () => {
    const { tailPoller } = get();
    if (tailPoller) {
      tailPoller.stop();
    }
    set({ isTailing: false, tailPoller: null });
  },

  clearLogs: () => {
    console.log("[User Activity] Clear logs");
    const { selectedLogGroup, fetchLogs, timeRange, isTailing, tailPoller } =
      get();

    // If tailing, reset the tail start timestamp so we only show logs from now
    if (isTailing && tailPoller) {
      tailPoller.resetStartTimestamp();
    }

    // Clear logs but keep current filters
    set({
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
    });

    // If tailing, don't re-fetch - the tail will pick up new logs from now
    // If not tailing, re-fetch with current time range
    if (selectedLogGroup && !isTailing) {
      fetchLogs(timeRange?.start, timeRange?.end ?? undefined);
    }
  },

  resetFilters: () => {
    console.log("[User Activity] Reset filters to defaults");
    const { selectedLogGroup, fetchLogs, stopTail } = get();
    const {
      getDefaultDisabledLevels,
      setPersistedDisabledLevels,
      setPersistedTimeRange,
    } = useSettingsStore.getState();

    // Stop any active tail first
    stopTail();

    const defaultDisabled = getDefaultDisabledLevels();

    // Reset all filters to defaults and clear logs
    set({
      logs: [],
      filteredLogs: [],
      filterText: "",
      disabledLevels: defaultDisabled,
      timeRange: null,
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
    });

    // Persist the reset values
    setPersistedDisabledLevels(defaultDisabled);
    setPersistedTimeRange(null);

    // Trigger a fresh query with default time range
    if (selectedLogGroup) {
      fetchLogs();
    }
  },

  resetState: () => {
    const { stopTail } = get();
    const { setLastSelectedLogGroup } = useSettingsStore.getState();

    // Stop any active tail
    stopTail();

    // Clear persisted log group selection
    setLastSelectedLogGroup(null);

    // Reset state but keep filters (disabledLevels, timeRange, filterText)
    set({
      selectedLogGroup: null,
      logs: [],
      filteredLogs: [],
      // Keep filterText, disabledLevels, timeRange - user can reset manually
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
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

  setSessionExpired: () => {
    set({
      isConnected: false,
      connectionError:
        "Your AWS session has expired. Please complete SSO login in your browser.",
    });
  },
}));
