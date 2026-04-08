import { create } from "zustand";
import { invoke } from "../demo/demoInvoke";
import type { GroupByMode, ParsedLogEvent } from "../types";

// Circular import: workspaceStore ↔ groupStore
// Safe because cross-store calls only happen inside actions (after both modules load).
import { useGroupStore } from "./groupStore";
import type {
  PanelConfig,
  WorkspaceConfig,
  CorrelationHighlight,
  MergedLogRef,
} from "../types/workspace";
import {
  createPanelState,
  createPanelActions,
  type PanelState,
  type PanelActions,
} from "./panelSlice";
import { useSettingsStore } from "./settingsStore";
import {
  useConnectionStore,
  setOnConnectionEstablished,
  setOnConnectionRefreshed,
} from "./connectionStore";
import { mergePanelLogs, buildEventKeyMap } from "../utils/mergeLogs";

// Loading sentinel returned when a panel ID is stale (panel closed but component not yet unmounted)
const EMPTY_PANEL: PanelState = createPanelState("__empty__");

// ─── Store Shape ────────────────────────────────────────────────────────────

interface PanelSlice {
  panels: Map<string, PanelState>;

  createPanel: (panelId: string) => void;
  removePanel: (panelId: string) => void;
  panelAction: (panelId: string) => PanelActions;
  setTimeRangeForAll: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => void;
}

interface MergedViewSlice {
  mergedLogRefs: MergedLogRef[];
  mergedEventKeyMap: Map<string, ParsedLogEvent>;
  mergedSourceToggles: Map<string, boolean>;
  recomputeMergedLogs: () => void;
  setMergedSourceToggle: (panelId: string, visible: boolean) => void;
}

interface CorrelationSlice {
  correlationHighlight: CorrelationHighlight | null;
  setCorrelation: (field: string, value: string, sourcePanelId: string) => void;
  clearCorrelation: () => void;
}

interface WorkspaceConfigSlice {
  saveWorkspace: (name: string) => WorkspaceConfig;
  loadWorkspace: (config: WorkspaceConfig) => void;
}

type WorkspaceStore = PanelSlice &
  MergedViewSlice &
  CorrelationSlice &
  WorkspaceConfigSlice;

// ─── Persisted State Restoration ────────────────────────────────────────────

function restorePersistedStateForPanel(
  setPanel: (partial: Partial<PanelState>) => void,
  actions: PanelActions,
): void {
  const {
    lastSelectedLogGroup,
    getPersistedDisabledLevelsAsSet,
    persistedTimeRange,
    persistedTimePreset,
    persistedGroupByMode,
    persistedGroupFilter,
    getDefaultDisabledLevels,
  } = useSettingsStore.getState();

  const persistedLevels = getPersistedDisabledLevelsAsSet();

  const presetToMs: Record<string, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };

  let restoredTimeRange: { start: number; end: number | null } | null = null;
  if (persistedTimePreset && presetToMs[persistedTimePreset]) {
    const now = Date.now();
    restoredTimeRange = {
      start: now - presetToMs[persistedTimePreset],
      end: null,
    };
  } else if (persistedTimePreset === "custom" && persistedTimeRange) {
    restoredTimeRange = persistedTimeRange;
  }

  const restoredGroupByMode = (
    ["none", "stream", "invocation"].includes(persistedGroupByMode)
      ? persistedGroupByMode
      : "none"
  ) as GroupByMode;

  setPanel({
    disabledLevels:
      persistedLevels.size > 0 ? persistedLevels : getDefaultDisabledLevels(),
    timeRange: restoredTimeRange,
    groupByMode: restoredGroupByMode,
    effectiveGroupByMode: restoredGroupByMode,
    groupFilter: restoredGroupByMode === "none" ? false : persistedGroupFilter,
  });

  const { logGroups } = useConnectionStore.getState();
  if (
    lastSelectedLogGroup &&
    logGroups.some((g) => g.name === lastSelectedLogGroup)
  ) {
    actions.selectLogGroup(lastSelectedLogGroup);

    if (persistedTimePreset === "live") {
      actions.startTail();
    }
  }
}

// ─── Action Cache ───────────────────────────────────────────────────────────

const panelActionsCache = new Map<string, PanelActions>();

// ─── Store ──────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const getPanel = (panelId: string) => () => get().panels.get(panelId);

  const setPanelPartial =
    (panelId: string) => (partial: Partial<PanelState>) => {
      const { panels } = get();
      const existing = panels.get(panelId);
      if (!existing) return;

      const updated = new Map(panels);
      updated.set(panelId, { ...existing, ...partial });
      set({ panels: updated });
    };

  const getOrCreateActions = (panelId: string): PanelActions => {
    let cached = panelActionsCache.get(panelId);
    if (!cached) {
      cached = createPanelActions(
        panelId,
        getPanel(panelId),
        setPanelPartial(panelId),
      );
      panelActionsCache.set(panelId, cached);
    }
    return cached;
  };

  return {
    // ─── Panel Slice ────────────────────────────────────────────────
    panels: new Map<string, PanelState>(),

    createPanel: (panelId: string) => {
      const { panels } = get();
      if (panels.has(panelId)) return;

      const newPanel = createPanelState(panelId);
      const updated = new Map(panels);
      updated.set(panelId, newPanel);
      set({ panels: updated });
    },

    removePanel: (panelId: string) => {
      const { panels } = get();
      const panel = panels.get(panelId);
      if (!panel) return;

      // Stop any active tail
      if (panel.tailManager) {
        panel.tailManager.stop();
      }

      // Cancel backend resources
      invoke("cancel_fetch", { panelId }).catch(() => {});
      invoke("stop_live_tail", { panelId }).catch(() => {});

      // Clean up action cache
      panelActionsCache.delete(panelId);

      const updated = new Map(panels);
      updated.delete(panelId);
      set({ panels: updated });

      // NOTE: No "at least one panel" invariant here.
      // groupStore owns that invariant and will create a new panel if needed.
    },

    panelAction: (panelId: string): PanelActions => {
      return getOrCreateActions(panelId);
    },

    setTimeRangeForAll: (
      range: { start: number; end: number | null } | null,
      preset?: string | null,
    ) => {
      const { panels } = get();
      let delay = 0;
      for (const panelId of panels.keys()) {
        const actions = getOrCreateActions(panelId);
        if (delay === 0) {
          actions.setTimeRange(range, preset);
        } else {
          setTimeout(() => {
            actions.stopTail();
            actions.setTimeRange(range, preset);
          }, delay);
        }
        delay += 500;
      }
    },

    // ─── Merged View Slice ──────────────────────────────────────────
    mergedLogRefs: [],
    mergedEventKeyMap: new Map(),
    mergedSourceToggles: new Map(),

    recomputeMergedLogs: () => {
      const { panels, mergedSourceToggles } = get();

      const panelLogs = new Map<string, ParsedLogEvent[]>();
      for (const [panelId, panel] of panels) {
        if (!panel.logGroupName) continue;
        if (mergedSourceToggles.get(panelId) === false) continue;
        panelLogs.set(panelId, panel.filteredLogs);
      }

      const refs = mergePanelLogs(panelLogs);
      const keyMap = buildEventKeyMap(panelLogs);
      set({ mergedLogRefs: refs, mergedEventKeyMap: keyMap });
    },

    setMergedSourceToggle: (panelId: string, visible: boolean) => {
      const { mergedSourceToggles } = get();
      const updated = new Map(mergedSourceToggles);
      updated.set(panelId, visible);
      set({ mergedSourceToggles: updated });
      setTimeout(() => get().recomputeMergedLogs(), 0);
    },

    // ─── Correlation Slice ──────────────────────────────────────────
    correlationHighlight: null,

    setCorrelation: (field: string, value: string, sourcePanelId: string) => {
      set({ correlationHighlight: { field, value, sourcePanelId } });
    },

    clearCorrelation: () => {
      set({ correlationHighlight: null });
    },

    // ─── Workspace Config Slice ─────────────────────────────────────
    saveWorkspace: (name: string): WorkspaceConfig => {
      const { panels } = get();
      const { awsProfile } = useSettingsStore.getState();

      // Import groupStore lazily to avoid circular deps
      const groupLayout = useGroupStore.getState().saveGroupLayout();
      const timeSyncEnabled = useGroupStore.getState().timeSyncEnabled;

      const now = Date.now();

      const panelConfigs: PanelConfig[] = [...panels.values()].map((panel) => ({
        id: panel.id,
        logGroupName: panel.logGroupName,
        filterText: panel.filterText,
        disabledLevels: [...panel.disabledLevels],
        groupByMode: panel.groupByMode,
        groupFilter: panel.groupFilter,
        timeRange: panel.timeRange,
        timePreset: null,
        wasTailing: panel.isTailing,
      }));

      return {
        id: `ws-${now}`,
        name,
        awsProfile: awsProfile ?? null,
        layout: groupLayout,
        panels: panelConfigs,
        timeSyncEnabled,
        createdAt: now,
        updatedAt: now,
      };
    },

    loadWorkspace: (config: WorkspaceConfig) => {
      const { panels } = get();

      // Stop all tails first
      for (const panel of panels.values()) {
        if (panel.tailManager) {
          panel.tailManager.stop();
        }
      }

      // Clear action cache
      panelActionsCache.clear();

      // Check which log groups still exist
      const { logGroups } = useConnectionStore.getState();
      const existingGroupNames = new Set(logGroups.map((g) => g.name));

      // Create new panels from config
      const newPanels = new Map<string, PanelState>();
      const staleLogGroups: string[] = [];
      for (const panelConfig of config.panels) {
        const panel = createPanelState(panelConfig.id);

        if (
          panelConfig.logGroupName &&
          !existingGroupNames.has(panelConfig.logGroupName)
        ) {
          staleLogGroups.push(panelConfig.logGroupName);
          panel.logGroupName = panelConfig.logGroupName;
          panel.error = `Log group "${panelConfig.logGroupName}" no longer exists`;
        } else {
          panel.logGroupName = panelConfig.logGroupName;
        }

        panel.filterText = panelConfig.filterText;
        panel.disabledLevels = new Set(panelConfig.disabledLevels);
        panel.groupByMode = panelConfig.groupByMode;
        panel.groupFilter = panelConfig.groupFilter;
        panel.timeRange = panelConfig.timeRange;
        newPanels.set(panelConfig.id, panel);
      }

      set({ panels: newPanels });

      // Load group layout
      useGroupStore.getState().loadGroupLayout(config.layout);
      if (config.timeSyncEnabled !== undefined) {
        useGroupStore.getState().setTimeSyncEnabled(config.timeSyncEnabled);
      }

      // Stagger fetches for panels with valid log groups
      let delay = 0;
      for (const [id, panel] of newPanels) {
        if (panel.logGroupName && !panel.error) {
          const actions = getOrCreateActions(id);
          if (delay === 0) {
            actions.fetchLogs(
              panel.timeRange?.start,
              panel.timeRange?.end ?? undefined,
            );
          } else {
            setTimeout(
              () =>
                actions.fetchLogs(
                  panel.timeRange?.start,
                  panel.timeRange?.end ?? undefined,
                ),
              delay,
            );
          }
          delay += 500;
        }
      }

      if (staleLogGroups.length > 0) {
        console.warn(
          `[Workspace] Stale log groups in loaded workspace: ${staleLogGroups.join(", ")}`,
        );
      }
    },
  };
});

// ─── Convenience Hooks ──────────────────────────────────────────────────────

/** Get panel state by ID — returns loading sentinel for stale IDs */
export function usePanelState(panelId: string): PanelState {
  return useWorkspaceStore((s) => s.panels.get(panelId) ?? EMPTY_PANEL);
}

// ─── Connection Callbacks ───────────────────────────────────────────────────

// Register post-connection callback to restore persisted state into the active panel
setOnConnectionEstablished(() => {
  const activePanelId = useGroupStore.getState().getActivePanelId();
  if (!activePanelId) return;

  const setPanelFn = (partial: Partial<PanelState>) => {
    const { panels } = useWorkspaceStore.getState();
    const existing = panels.get(activePanelId);
    if (!existing) return;
    const updated = new Map(panels);
    updated.set(activePanelId, { ...existing, ...partial });
    useWorkspaceStore.setState({ panels: updated });
  };

  const actions = useWorkspaceStore.getState().panelAction(activePanelId);
  restorePersistedStateForPanel(setPanelFn, actions);
});

// Register post-refresh callback to re-fetch all panels
setOnConnectionRefreshed(() => {
  const { panels } = useWorkspaceStore.getState();

  let delay = 0;
  for (const [panelId, panel] of panels) {
    if (!panel.logGroupName) continue;

    const actions = useWorkspaceStore.getState().panelAction(panelId);

    if (panel.isTailing) {
      actions.stopTail();
      if (delay === 0) {
        actions.startTail();
      } else {
        setTimeout(() => actions.startTail(), delay);
      }
    } else {
      if (delay === 0) {
        actions.fetchLogs(
          panel.timeRange?.start,
          panel.timeRange?.end ?? undefined,
        );
      } else {
        setTimeout(
          () =>
            actions.fetchLogs(
              panel.timeRange?.start,
              panel.timeRange?.end ?? undefined,
            ),
          delay,
        );
      }
    }
    delay += 500;
  }
});
