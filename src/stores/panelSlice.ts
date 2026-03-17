import { invoke } from "../demo/demoInvoke";
import type { LogEvent, ParsedLogEvent, LogLevel, GroupByMode } from "../types";
import { useSettingsStore } from "./settingsStore";
import { LiveTailManager, type TransportType } from "./LiveTailManager";
import { parseLogEvent, mergeFragmentedLogs } from "../utils/logParsing";
import {
  FilterCache,
  getFilteredLogs as moduleGetFilteredLogs,
} from "../utils/logFiltering";
import { isConnectionOrCredentialError } from "../utils/connectionErrors";
import { useConnectionStore } from "./connectionStore";

/** Runtime state for a single panel */
export interface PanelState {
  // Identity
  id: string;
  logGroupName: string | null;

  // Logs
  logs: ParsedLogEvent[];
  filteredLogs: ParsedLogEvent[];
  isLoading: boolean;
  loadingProgress: number;
  loadingSizeBytes: number;
  totalSizeBytes: number;
  error: string | null;

  // Filtering
  filterText: string;
  disabledLevels: Set<LogLevel>;
  filterCache: FilterCache;

  // UI state
  expandedLogIndex: number | null;
  selectedLogIndex: number | null;
  selectedLogIndices: Set<number>;

  // Time range
  timeRange: { start: number; end: number | null } | null;

  // Grouping
  groupByMode: GroupByMode | "auto";
  effectiveGroupByMode: GroupByMode;
  collapsedGroups: Set<string>;
  groupFilter: boolean;

  // Live tail
  isTailing: boolean;
  tailManager: LiveTailManager | null;
  activeTransport: TransportType | null;
  isFollowing: boolean;
  tailToast: string | null;

  // Fetch tracking
  currentFetchId: number;
}

/** Actions that can be performed on a single panel */
export interface PanelActions {
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
  setIsFollowing: (following: boolean) => void;
  setTailToast: (message: string | null) => void;
  clearLogs: () => void;
  resetFilters: () => void;
  resetState: () => void;
  setLoadingProgress: (count: number, sizeBytes: number) => void;
  toggleGroupFilter: () => void;
  setGroupByMode: (mode: GroupByMode | "auto") => void;
  toggleGroupCollapsed: (groupId: string) => void;
  expandAllGroups: () => void;
  collapseAllGroups: (groupIds: string[]) => void;
}

function resolveGroupByMode(
  mode: GroupByMode | "auto",
  selectedLogGroup: string | null,
): GroupByMode {
  if (mode === "auto") {
    if (selectedLogGroup && selectedLogGroup.startsWith("/aws/lambda/")) {
      return "invocation";
    } else {
      return "stream";
    }
  } else {
    return mode;
  }
}

/** Create initial state for a new panel */
export function createPanelState(id: string): PanelState {
  return {
    id,
    logGroupName: null,
    logs: [],
    filteredLogs: [],
    isLoading: false,
    loadingProgress: 0,
    loadingSizeBytes: 0,
    totalSizeBytes: 0,
    error: null,
    filterText: "",
    disabledLevels: new Set(),
    filterCache: new FilterCache(),
    expandedLogIndex: null,
    selectedLogIndex: null,
    selectedLogIndices: new Set(),
    timeRange: null,
    groupByMode: "none",
    effectiveGroupByMode: "none",
    collapsedGroups: new Set(),
    groupFilter: true,
    isTailing: false,
    tailManager: null,
    activeTransport: null,
    isFollowing: false,
    tailToast: null,
    currentFetchId: 0,
  };
}

/**
 * Create panel actions that read/write a specific panel's state within a parent store.
 *
 * @param panelId - The panel to act on
 * @param getPanel - Getter for the panel's current state
 * @param setPanel - Setter that merges partial state into the panel
 */
export function createPanelActions(
  panelId: string,
  getPanel: () => PanelState | undefined,
  setPanel: (partial: Partial<PanelState>) => void,
): PanelActions {
  const safeGet = (): PanelState => {
    const panel = getPanel();
    if (!panel) {
      throw new Error(`Panel ${panelId} not found`);
    }
    return panel;
  };

  const actions: PanelActions = {} as PanelActions;

  Object.assign(actions, {
    selectLogGroup: (name: string) => {
      console.log(`[Panel ${panelId}] Select log group:`, name);
      const panel = safeGet();
      const { setLastSelectedLogGroup } = useSettingsStore.getState();

      // Stop any active tail
      if (panel.tailManager) {
        panel.tailManager.stop();
      }

      const effectiveMode = resolveGroupByMode(panel.groupByMode, name);

      setPanel({
        logGroupName: name,
        logs: [],
        filteredLogs: [],
        error: null,
        isTailing: false,
        tailManager: null,
        activeTransport: null,
        isFollowing: false,
        effectiveGroupByMode: effectiveMode,
      });

      // Persist selection to settings
      setLastSelectedLogGroup(name);

      // Auto-fetch with current time range
      if (name) {
        const updated = safeGet();
        actions.fetchLogs(
          updated.timeRange?.start,
          updated.timeRange?.end ?? undefined,
        );
      }
    },

    fetchLogs: async (startTime?: number, endTime?: number) => {
      const panel = safeGet();
      if (!panel.logGroupName) return;

      // Increment fetch ID to cancel stale requests
      const fetchId = panel.currentFetchId + 1;

      // Cancel any in-progress backend fetch
      invoke("cancel_fetch").catch((e) => {
        console.debug("[Backend Activity] cancel_fetch:", e);
      });

      setPanel({
        currentFetchId: fetchId,
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
        const now = Date.now();
        const defaultStart = startTime ?? now - 15 * 60 * 1000;
        const effectiveEnd = endTime ?? Date.now();

        const { cacheLimits } = useSettingsStore.getState();

        const rawLogs = await invoke<LogEvent[]>("fetch_logs", {
          logGroupName: panel.logGroupName,
          startTime: defaultStart,
          endTime: effectiveEnd,
          filterPattern: null,
          maxCount: cacheLimits.maxLogCount,
          maxSizeMb: cacheLimits.maxSizeMb,
          fetchId,
        });

        // Check if this fetch is still current
        const currentPanel = getPanel();
        if (!currentPanel || fetchId !== currentPanel.currentFetchId) {
          console.log(`[Panel ${panelId}] Discarding stale fetch results`);
          return;
        }

        const mergedLogs = mergeFragmentedLogs(rawLogs);
        const parsedLogs = mergedLogs.map(parseLogEvent);
        const filtered = moduleGetFilteredLogs(
          parsedLogs,
          currentPanel.filterText,
          currentPanel.disabledLevels,
        );

        const totalSize = mergedLogs.reduce(
          (sum, log) => sum + log.message.length,
          0,
        );

        setPanel({
          logs: parsedLogs,
          filteredLogs: filtered,
          isLoading: false,
          totalSizeBytes: totalSize,
        });
      } catch (error) {
        // Only set error if this fetch is still current
        const currentPanel = getPanel();
        if (currentPanel && fetchId === currentPanel.currentFetchId) {
          const message =
            error instanceof Error ? error.message : String(error);
          setPanel({
            error: message,
            isLoading: false,
          });
          if (isConnectionOrCredentialError(message)) {
            useConnectionStore.getState().setConnectionFailed(message);
          }
        }
      }
    },

    setFilterText: (text: string) => {
      console.log(`[Panel ${panelId}] Set filter text:`, text || "(empty)");
      const panel = safeGet();
      const filtered = panel.filterCache.getFilteredLogs(
        panel.logs,
        text,
        panel.disabledLevels,
      );
      setPanel({
        filterText: text,
        filteredLogs: filtered,
        expandedLogIndex: null,
        selectedLogIndex: null,
        selectedLogIndices: new Set(),
      });
    },

    toggleLevel: (level: LogLevel) => {
      const panel = safeGet();
      const { setPersistedDisabledLevels } = useSettingsStore.getState();
      const newDisabled = new Set(panel.disabledLevels);
      if (newDisabled.has(level)) {
        newDisabled.delete(level);
        console.log(`[Panel ${panelId}] Enable level:`, level);
      } else {
        newDisabled.add(level);
        console.log(`[Panel ${panelId}] Disable level:`, level);
      }
      const filtered = panel.filterCache.getFilteredLogs(
        panel.logs,
        panel.filterText,
        newDisabled,
      );
      setPanel({
        disabledLevels: newDisabled,
        filteredLogs: filtered,
        expandedLogIndex: null,
        selectedLogIndex: null,
        selectedLogIndices: new Set(),
      });
      setPersistedDisabledLevels(newDisabled);
    },

    setExpandedLogIndex: (index: number | null) => {
      setPanel({ expandedLogIndex: index });
    },

    setSelectedLogIndex: (index: number | null) => {
      setPanel({ selectedLogIndex: index });
    },

    setSelectedLogIndices: (indices: Set<number>) => {
      setPanel({ selectedLogIndices: indices });
    },

    clearSelection: () => {
      setPanel({ selectedLogIndices: new Set() });
    },

    setTimeRange: (
      range: { start: number; end: number | null } | null,
      preset?: string | null,
    ) => {
      const { setPersistedTimeRange } = useSettingsStore.getState();
      if (range) {
        const startDate = new Date(range.start).toISOString();
        const endDate = range.end ? new Date(range.end).toISOString() : "now";
        console.log(
          `[Panel ${panelId}] Set time range:`,
          startDate,
          "to",
          endDate,
        );
      } else {
        console.log(`[Panel ${panelId}] Clear time range`);
      }
      setPanel({ timeRange: range });
      setPersistedTimeRange(range, preset);
      if (range) {
        actions.fetchLogs(range.start, range.end ?? undefined);
      }
    },

    startTail: () => {
      const panel = safeGet();
      if (!panel.logGroupName) return;
      if (panel.isTailing) return;

      // Cancel any in-flight fetch requests
      setPanel({ currentFetchId: panel.currentFetchId + 1 });
      invoke("cancel_fetch").catch((e) => {
        console.debug("[Backend Activity] cancel_fetch:", e);
      });

      // Stop any existing manager
      if (panel.tailManager) {
        panel.tailManager.stop();
      }

      // Clear existing logs — live tail starts fresh
      setPanel({
        isLoading: false,
        logs: [],
        filteredLogs: [],
        expandedLogIndex: null,
        selectedLogIndex: null,
        isFollowing: true,
      });

      // Resolve ARN for streaming
      const { logGroups } = useConnectionStore.getState();
      const logGroupArn =
        logGroups.find((g) => g.name === panel.logGroupName)?.arn ?? null;

      const manager = new LiveTailManager({
        logGroupName: panel.logGroupName,
        logGroupArn,
        onNewLogs: (newLogs: LogEvent[]) => {
          const current = getPanel();
          if (!current) return; // Panel was closed

          // Deduplicate
          const existingIds = new Set(
            current.logs.map((l) => l.event_id).filter(Boolean),
          );
          const existingKeys = new Set(
            current.logs.map(
              (l) => `${l.timestamp}:${l.message.slice(0, 100)}`,
            ),
          );
          const uniqueNewLogs = newLogs.filter((log) => {
            if (log.event_id && existingIds.has(log.event_id)) return false;
            const key = `${log.timestamp}:${log.message.slice(0, 100)}`;
            return !existingKeys.has(key);
          });

          if (uniqueNewLogs.length === 0) return;

          const mergedNew = mergeFragmentedLogs(uniqueNewLogs);
          const parsedNew = mergedNew.map(parseLogEvent);
          const allLogs = [...current.logs, ...parsedNew];
          const { cacheLimits } = useSettingsStore.getState();
          const trimmedLogs = allLogs.slice(-cacheLimits.maxLogCount);
          const filtered = current.filterCache.getFilteredLogs(
            trimmedLogs,
            current.filterText,
            current.disabledLevels,
          );

          setPanel({ logs: trimmedLogs, filteredLogs: filtered });
        },
        onError: (error: unknown) => {
          console.error(`[Panel ${panelId}] Tail error:`, error);
          const message =
            error instanceof Error ? error.message : String(error);
          if (isConnectionOrCredentialError(message)) {
            useConnectionStore.getState().setConnectionFailed(message);
          }
        },
        onTransportChange: (type: TransportType) => {
          setPanel({ activeTransport: type });
        },
        onToast: (message: string) => {
          setPanel({ tailToast: message });
          setTimeout(() => {
            const current = getPanel();
            if (current && current.tailToast === message) {
              setPanel({ tailToast: null });
            }
          }, 5000);
        },
        getLastLogTimestamp: () => {
          const current = getPanel();
          if (!current || current.logs.length === 0) return null;
          return current.logs[current.logs.length - 1].timestamp;
        },
      });

      manager.start();

      setPanel({ isTailing: true, tailManager: manager });

      // Persist "live" so it restores on next launch
      const { setPersistedTimeRange } = useSettingsStore.getState();
      setPersistedTimeRange(null, "live");
    },

    stopTail: () => {
      const panel = getPanel();
      if (panel?.tailManager) {
        panel.tailManager.stop();
      }
      setPanel({
        isTailing: false,
        tailManager: null,
        activeTransport: null,
        isFollowing: false,
      });
    },

    setIsFollowing: (following: boolean) => {
      setPanel({ isFollowing: following });
    },

    setTailToast: (message: string | null) => {
      setPanel({ tailToast: message });
    },

    clearLogs: () => {
      console.log(`[Panel ${panelId}] Clear logs`);
      const panel = safeGet();

      if (panel.isTailing && panel.tailManager) {
        panel.tailManager.resetStartTimestamp();
      }

      setPanel({
        logs: [],
        filteredLogs: [],
        expandedLogIndex: null,
        selectedLogIndex: null,
        selectedLogIndices: new Set(),
      });

      // If not tailing, re-fetch
      if (panel.logGroupName && !panel.isTailing) {
        actions.fetchLogs(
          panel.timeRange?.start,
          panel.timeRange?.end ?? undefined,
        );
      }
    },

    resetFilters: () => {
      console.log(`[Panel ${panelId}] Reset filters`);
      const panel = safeGet();
      const {
        getDefaultDisabledLevels,
        setPersistedDisabledLevels,
        setPersistedTimeRange,
      } = useSettingsStore.getState();

      // Stop any active tail
      actions.stopTail();

      const defaultDisabled = getDefaultDisabledLevels();

      setPanel({
        logs: [],
        filteredLogs: [],
        filterText: "",
        disabledLevels: defaultDisabled,
        timeRange: null,
        expandedLogIndex: null,
        selectedLogIndex: null,
        selectedLogIndices: new Set(),
      });

      setPersistedDisabledLevels(defaultDisabled);
      setPersistedTimeRange(null);

      if (panel.logGroupName) {
        actions.fetchLogs();
      }
    },

    resetState: () => {
      const { setLastSelectedLogGroup } = useSettingsStore.getState();

      actions.stopTail();
      setLastSelectedLogGroup(null);

      setPanel({
        logGroupName: null,
        logs: [],
        filteredLogs: [],
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
      setPanel({ loadingProgress: count, loadingSizeBytes: sizeBytes });
    },

    toggleGroupFilter: () => {
      const panel = safeGet();
      const { setPersistedGroupFilter } = useSettingsStore.getState();
      const next = !panel.groupFilter;
      setPanel({ groupFilter: next });
      setPersistedGroupFilter(next);
    },

    setGroupByMode: (mode: GroupByMode | "auto") => {
      const panel = safeGet();
      const { setPersistedGroupByMode } = useSettingsStore.getState();
      const effectiveMode = resolveGroupByMode(mode, panel.logGroupName);
      setPanel({
        groupByMode: mode,
        collapsedGroups: new Set(),
        effectiveGroupByMode: effectiveMode,
        groupFilter: effectiveMode === "none" ? false : panel.groupFilter,
      });
      setPersistedGroupByMode(mode);
    },

    toggleGroupCollapsed: (groupId: string) => {
      const panel = safeGet();
      const next = new Set(panel.collapsedGroups);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      setPanel({ collapsedGroups: next });
    },

    expandAllGroups: () => {
      setPanel({ collapsedGroups: new Set() });
    },

    collapseAllGroups: (groupIds: string[]) => {
      setPanel({ collapsedGroups: new Set(groupIds) });
    },
  });

  return actions;
}
