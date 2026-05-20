import { invoke } from "../demo/demoInvoke";
import type { LogEvent, ParsedLogEvent, LogLevel, GroupByMode } from "../types";
import { useSettingsStore } from "./settingsStore";
import { LiveTailManager, type TransportType } from "./LiveTailManager";
import { parseLogEvent, mergeFragmentedLogs } from "../utils/logParsing";
import { FilterCache } from "../utils/logFiltering";
import { isConnectionOrCredentialError } from "../utils/connectionErrors";
import { useConnectionStore } from "./connectionStore";

const BACKFILL_WINDOW_MS = 15 * 60 * 1000;
// Overlap the backfill window past `Date.now()` so events emitted between
// the fetch completing and the live-tail stream activating are captured by
// the backfill instead of dropped at the seam. Existing dedup handles
// overlap; gaps would silently lose events.
const BACKFILL_SEAM_OVERLAP_MS = 2000;
const BACKFILL_TIMEOUT_MS = 15_000;
// How many of the most recent events to check for stream/backfill dedup.
// Bounded so onNewLogs stays O(window) even when logs holds the 50k-event
// backfill — streaming dedup only matters against very recent events near
// the seam, never against events from minutes ago.
const DEDUP_WINDOW_SIZE = 500;

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
  setDisabledLevels: (levels: Set<LogLevel>) => void;
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

      // Defer settings persistence to avoid cross-store render tearing
      setTimeout(() => {
        const { setLastSelectedLogGroup, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setLastSelectedLogGroup(name);
        setPanelPersistedConfig(panelId, { logGroupName: name });
      }, 0);

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
      invoke("cancel_fetch", { panelId }).catch((e) => {
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
          panelId,
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
        const filtered = currentPanel.filterCache.getFilteredLogs(
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
      const newDisabled = new Set(panel.disabledLevels);
      if (newDisabled.has(level)) {
        newDisabled.delete(level);
      } else {
        newDisabled.add(level);
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
      // Defer settings persistence to avoid cross-store render tearing.
      // The workspaceStore update above is the authoritative state change;
      // settingsStore writes are only for localStorage persistence.
      setTimeout(() => {
        const { setPersistedDisabledLevels, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setPersistedDisabledLevels(newDisabled);
        setPanelPersistedConfig(panelId, {
          disabledLevels: [...newDisabled],
        });
      }, 0);
    },

    setDisabledLevels: (levels: Set<LogLevel>) => {
      const panel = safeGet();
      const filtered = panel.filterCache.getFilteredLogs(
        panel.logs,
        panel.filterText,
        levels,
      );
      setPanel({
        disabledLevels: levels,
        filteredLogs: filtered,
        expandedLogIndex: null,
        selectedLogIndex: null,
        selectedLogIndices: new Set(),
      });
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
      setPanel({ timeRange: range });
      setTimeout(() => {
        const { setPersistedTimeRange, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setPersistedTimeRange(range, preset);
        setPanelPersistedConfig(panelId, {
          timePreset: preset ?? null,
          timeRange: range,
        });
      }, 0);
      if (range) {
        actions.fetchLogs(range.start, range.end ?? undefined);
      }
    },

    startTail: async () => {
      const panel = safeGet();
      if (!panel.logGroupName) return;
      if (panel.isTailing) return;

      const capturedLogGroupName = panel.logGroupName;

      // Cancel any in-flight fetch requests and claim a fresh fetchId. The
      // backfill below participates in the same `currentFetchId` counter as
      // `fetchLogs()`, so any later action (`stopTail`, log-group switch,
      // preset switch, rapid LIVE re-toggle) invalidates this attempt.
      const fetchId = panel.currentFetchId + 1;
      setPanel({ currentFetchId: fetchId });
      invoke("cancel_fetch", { panelId }).catch((e) => {
        console.debug("[Backend Activity] cancel_fetch:", e);
      });

      // Stop any existing manager
      if (panel.tailManager) {
        panel.tailManager.stop();
      }

      // Clear existing logs — live tail starts fresh, then backfills.
      // `isTailing` becomes true as soon as the user expresses live intent,
      // even before the manager is constructed. This way:
      //   1) The guard at the top of `startTail()` blocks parallel backfills
      //      when the user rapidly clicks LIVE during a slow backfill.
      //   2) The post-SSO-refresh restart loop in workspaceStore.ts (which
      //      checks `panel.isTailing`) will resume live tail on panels whose
      //      backfill failed with a credential error mid-flight.
      // Downstream consumers should treat `isTailing && !tailManager` as
      // one of two transient states:
      //   - backfill is in flight, manager not yet constructed (the common
      //     case while `isLoading: true`), OR
      //   - backfill ended with a credential error and the panel is waiting
      //     for SSO refresh to retrigger startTail (isLoading: false).
      // A future `tailStatus: 'backfilling' | 'credential_error' | 'live'`
      // field would disambiguate these for UI affordances like a "reconnecting"
      // spinner; today the two states are distinguishable via `isLoading`.
      setPanel({
        isTailing: true,
        isLoading: true,
        logs: [],
        filteredLogs: [],
        expandedLogIndex: null,
        selectedLogIndex: null,
        isFollowing: true,
        tailManager: null,
        activeTransport: null,
      });

      // Backfill: fetch the last 15 minutes (+ a 2s overlap past `now` so
      // events emitted while the stream is connecting are not lost at the
      // seam — existing dedup in `onNewLogs` handles the overlap).
      const { cacheLimits } = useSettingsStore.getState();
      const backfillStart = Date.now() - BACKFILL_WINDOW_MS;
      const backfillEnd = Date.now() + BACKFILL_SEAM_OVERLAP_MS;
      const backfillInvoke = invoke<LogEvent[]>("fetch_logs", {
        panelId,
        logGroupName: capturedLogGroupName,
        startTime: backfillStart,
        endTime: backfillEnd,
        filterPattern: null,
        maxCount: cacheLimits.maxLogCount,
        maxSizeMb: cacheLimits.maxSizeMb,
        fetchId,
      });
      // If the timeout wins the Promise.race below, the backfillInvoke
      // promise is still pending. A later rejection (network error after
      // the timeout fired) would surface as an UnhandledPromiseRejection.
      // Attach a no-op catch so the abandoned branch settles cleanly.
      backfillInvoke.catch(() => {});

      let backfillFailedFatally = false;
      // Track the timeout handle so we can cancel it on success. Without
      // this, every successful backfill leaks a pending setTimeout that
      // fires 15s later and produces an unhandled rejection.
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        const rawLogs = await Promise.race<LogEvent[]>([
          backfillInvoke,
          new Promise<LogEvent[]>((_, reject) => {
            // Do not include the word "timeout" — it would match
            // `isConnectionOrCredentialError` and falsely trigger an SSO
            // refresh prompt. A backfill that exceeds the window is a
            // soft local failure, not a credential problem.
            timeoutHandle = setTimeout(
              () => reject(new Error("backfill window exceeded")),
              BACKFILL_TIMEOUT_MS,
            );
          }),
        ]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        // Stale-result guard: matches `fetchLogs` at panelSlice.ts:240. If
        // another action bumped `currentFetchId` (stopTail, log-group switch,
        // preset switch), discard and bail — do not start the manager.
        const current = getPanel();
        if (
          !current ||
          fetchId !== current.currentFetchId ||
          current.logGroupName !== capturedLogGroupName
        ) {
          console.log(`[Panel ${panelId}] Discarding stale backfill results`);
          return;
        }

        const mergedLogs = mergeFragmentedLogs(rawLogs);
        const parsedLogs = mergedLogs.map(parseLogEvent);
        const filtered = current.filterCache.getFilteredLogs(
          parsedLogs,
          current.filterText,
          current.disabledLevels,
        );
        const totalSize = mergedLogs.reduce(
          (sum, log) => sum + log.message.length,
          0,
        );
        setPanel({
          logs: parsedLogs,
          filteredLogs: filtered,
          totalSizeBytes: totalSize,
          isLoading: false,
        });
      } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const message = error instanceof Error ? error.message : String(error);
        // Credential errors route through the connection store so SSO refresh
        // can run; live tail is blocked until reconnect completes.
        if (isConnectionOrCredentialError(message)) {
          useConnectionStore.getState().setConnectionFailed(message);
          backfillFailedFatally = true;
        } else {
          // Generic backfill failure is non-fatal — toast and proceed to
          // stream-only. Matches the design: "live tail must not be blocked
          // by backfill failure."
          setPanel({
            tailToast: "Backfill failed — streaming live only",
            isLoading: false,
          });
          setTimeout(() => {
            const p = getPanel();
            if (p && p.tailToast === "Backfill failed — streaming live only") {
              setPanel({ tailToast: null });
            }
          }, 5000);
        }
      }

      // Bail if the backfill ended in a fatal error, or if any concurrent
      // action invalidated this attempt while we were awaiting.
      const postBackfill = getPanel();
      if (
        backfillFailedFatally ||
        !postBackfill ||
        fetchId !== postBackfill.currentFetchId ||
        postBackfill.logGroupName !== capturedLogGroupName
      ) {
        setPanel({ isLoading: false });
        return;
      }

      // Resolve ARN for streaming
      const { logGroups } = useConnectionStore.getState();
      const logGroupArn =
        logGroups.find((g) => g.name === capturedLogGroupName)?.arn ?? null;

      const manager = new LiveTailManager({
        panelId,
        logGroupName: capturedLogGroupName,
        logGroupArn,
        onNewLogs: (newLogs: LogEvent[]) => {
          const current = getPanel();
          if (!current) return; // Panel was closed

          // Deduplicate against the most recent DEDUP_WINDOW_SIZE events
          // only. Streamed events arrive at most ~1s apart and only collide
          // with backfill events near the seam, so checking the full log
          // history (up to 50k entries after backfill) on every callback
          // is wasted O(n) work.
          const dedupWindow = current.logs.slice(-DEDUP_WINDOW_SIZE);
          const existingIds = new Set(
            dedupWindow.map((l) => l.event_id).filter(Boolean),
          );
          const existingKeys = new Set(
            dedupWindow.map((l) => `${l.timestamp}:${l.message.slice(0, 100)}`),
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
          } else {
            // Non-recoverable error (e.g. permission denied) — clear tailing
            // state so the panel doesn't appear stuck and reconnect won't retry.
            setPanel({
              isTailing: false,
              tailManager: null,
              activeTransport: null,
            });
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

      setPanel({ isTailing: true, tailManager: manager, isLoading: false });

      // Defer settings persistence to avoid cross-store render tearing
      setTimeout(() => {
        const { setPersistedTimeRange, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setPersistedTimeRange(null, "live");
        setPanelPersistedConfig(panelId, {
          timePreset: "live",
          timeRange: null,
        });
      }, 0);
    },

    stopTail: () => {
      const panel = getPanel();
      if (panel?.tailManager) {
        panel.tailManager.stop();
      }
      // Bump fetchId so any in-flight backfill from startTail() is
      // invalidated. Without this, a backfill that resolves after stopTail()
      // could still construct and start a new manager.
      setPanel({
        currentFetchId: (panel?.currentFetchId ?? 0) + 1,
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
      const panel = safeGet();
      const { getDefaultDisabledLevels } = useSettingsStore.getState();

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

      setTimeout(() => {
        const {
          setPersistedDisabledLevels,
          setPersistedTimeRange,
          setPanelPersistedConfig,
        } = useSettingsStore.getState();
        setPersistedDisabledLevels(defaultDisabled);
        setPersistedTimeRange(null);
        setPanelPersistedConfig(panelId, {
          disabledLevels: [...defaultDisabled],
          timePreset: null,
          timeRange: null,
        });
      }, 0);

      if (panel.logGroupName) {
        actions.fetchLogs();
      }
    },

    resetState: () => {
      actions.stopTail();

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

      setTimeout(() => {
        const { setLastSelectedLogGroup, clearPanelPersistedConfig } =
          useSettingsStore.getState();
        setLastSelectedLogGroup(null);
        clearPanelPersistedConfig(panelId);
      }, 0);
    },

    setLoadingProgress: (count: number, sizeBytes: number) => {
      setPanel({ loadingProgress: count, loadingSizeBytes: sizeBytes });
    },

    toggleGroupFilter: () => {
      const panel = safeGet();
      const next = !panel.groupFilter;
      setPanel({ groupFilter: next });
      setTimeout(() => {
        const { setPersistedGroupFilter, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setPersistedGroupFilter(next);
        setPanelPersistedConfig(panelId, { groupFilter: next });
      }, 0);
    },

    setGroupByMode: (mode: GroupByMode | "auto") => {
      const panel = safeGet();
      const effectiveMode = resolveGroupByMode(mode, panel.logGroupName);
      setPanel({
        groupByMode: mode,
        collapsedGroups: new Set(),
        effectiveGroupByMode: effectiveMode,
        groupFilter: effectiveMode === "none" ? false : panel.groupFilter,
      });
      setTimeout(() => {
        const { setPersistedGroupByMode, setPanelPersistedConfig } =
          useSettingsStore.getState();
        setPersistedGroupByMode(mode);
        setPanelPersistedConfig(panelId, { groupByMode: mode });
      }, 0);
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
