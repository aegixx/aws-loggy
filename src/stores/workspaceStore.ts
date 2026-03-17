import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { GroupByMode } from "../types";
import type {
  LayoutMode,
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

// Loading sentinel returned when a panel ID is stale (panel closed but component not yet unmounted)
const EMPTY_PANEL: PanelState = createPanelState("__empty__");

let panelIdCounter = 0;

function generatePanelId(): string {
  return `panel-${Date.now()}-${++panelIdCounter}`;
}

// ─── Store Shape ────────────────────────────────────────────────────────────

interface PanelManagerSlice {
  panels: Map<string, PanelState>;
  activePanelId: string;
  layoutMode: LayoutMode;

  addPanel: (logGroupName?: string | null) => string;
  removePanel: (panelId: string) => void;
  setActivePanel: (panelId: string) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  reorderPanels: (orderedIds: string[]) => void;
  panelAction: (panelId: string) => PanelActions;
}

interface MergedViewSlice {
  mergedLogRefs: MergedLogRef[];
  recomputeMergedLogs: () => void;
}

interface CorrelationSlice {
  correlationHighlight: CorrelationHighlight | null;
  setCorrelation: (field: string, value: string, sourcePanelId: string) => void;
  clearCorrelation: () => void;
}

interface WorkspaceConfigSlice {
  timeSyncEnabled: boolean;
  setTimeSyncEnabled: (enabled: boolean) => void;
  setTimeRangeForAll: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => void;
  saveWorkspace: (name: string) => WorkspaceConfig;
  loadWorkspace: (config: WorkspaceConfig) => void;
}

type WorkspaceStore = PanelManagerSlice &
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

  // Recalculate time range from preset (so "1h" is always relative to now)
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

  // Auto-select last used log group if available
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

// Cache panel actions to avoid creating new closures on every panelAction() call
const panelActionsCache = new Map<string, PanelActions>();

// ─── Store ──────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  // Helper: get a panel by ID
  const getPanel = (panelId: string) => () => get().panels.get(panelId);

  // Helper: set partial state on a panel
  const setPanel = (panelId: string) => (partial: Partial<PanelState>) => {
    const { panels } = get();
    const existing = panels.get(panelId);
    if (!existing) return;

    const updated = new Map(panels);
    updated.set(panelId, { ...existing, ...partial });
    set({ panels: updated });
  };

  // Helper: get or create cached panel actions
  const getOrCreateActions = (panelId: string): PanelActions => {
    let cached = panelActionsCache.get(panelId);
    if (!cached) {
      cached = createPanelActions(
        panelId,
        getPanel(panelId),
        setPanel(panelId),
      );
      panelActionsCache.set(panelId, cached);
    }
    return cached;
  };

  // Create the initial panel
  const initialPanelId = generatePanelId();
  const initialPanels = new Map<string, PanelState>();
  initialPanels.set(initialPanelId, createPanelState(initialPanelId));

  return {
    // ─── Panel Manager Slice ──────────────────────────────────────────
    panels: initialPanels,
    activePanelId: initialPanelId,
    layoutMode: "tabs" as LayoutMode,

    addPanel: (logGroupName?: string | null) => {
      const id = generatePanelId();
      const { panels } = get();
      const maxPanels = 10;

      if (panels.size >= maxPanels) {
        console.warn(
          `[Workspace] Maximum ${maxPanels} panels reached, cannot add more`,
        );
        return get().activePanelId;
      }

      const newPanel = createPanelState(id);
      const updated = new Map(panels);
      updated.set(id, newPanel);
      set({ panels: updated, activePanelId: id });

      // If a log group was specified, select it
      if (logGroupName) {
        const actions = getOrCreateActions(id);
        actions.selectLogGroup(logGroupName);
      }

      return id;
    },

    removePanel: (panelId: string) => {
      const { panels, activePanelId } = get();

      // Stop any active tail on the panel being removed
      const panel = panels.get(panelId);
      if (panel?.tailManager) {
        panel.tailManager.stop();
      }

      // Clean up action cache
      panelActionsCache.delete(panelId);

      const updated = new Map(panels);
      updated.delete(panelId);

      // Ensure at least one panel exists
      if (updated.size === 0) {
        const newId = generatePanelId();
        updated.set(newId, createPanelState(newId));
        set({ panels: updated, activePanelId: newId });
      } else if (activePanelId === panelId) {
        // Switch to the nearest panel
        const ids = [...updated.keys()];
        set({ panels: updated, activePanelId: ids[ids.length - 1] });
      } else {
        set({ panels: updated });
      }
    },

    setActivePanel: (panelId: string) => {
      if (get().panels.has(panelId)) {
        set({ activePanelId: panelId });
      }
    },

    setLayoutMode: (mode: LayoutMode) => {
      set({ layoutMode: mode });
    },

    reorderPanels: (orderedIds: string[]) => {
      const { panels } = get();
      const reordered = new Map<string, PanelState>();
      for (const id of orderedIds) {
        const panel = panels.get(id);
        if (panel) {
          reordered.set(id, panel);
        }
      }
      set({ panels: reordered });
    },

    panelAction: (panelId: string): PanelActions => {
      return getOrCreateActions(panelId);
    },

    // ─── Merged View Slice ────────────────────────────────────────────
    mergedLogRefs: [],

    recomputeMergedLogs: () => {
      // Phase 4 — placeholder for now
      set({ mergedLogRefs: [] });
    },

    // ─── Correlation Slice ────────────────────────────────────────────
    correlationHighlight: null,

    setCorrelation: (field: string, value: string, sourcePanelId: string) => {
      set({ correlationHighlight: { field, value, sourcePanelId } });
    },

    clearCorrelation: () => {
      set({ correlationHighlight: null });
    },

    // ─── Workspace Config Slice ───────────────────────────────────────
    timeSyncEnabled: false,

    setTimeSyncEnabled: (enabled: boolean) => {
      set({ timeSyncEnabled: enabled });
    },

    setTimeRangeForAll: (
      range: { start: number; end: number | null } | null,
      preset?: string | null,
    ) => {
      const { panels } = get();
      let delay = 0;
      for (const panelId of panels.keys()) {
        const actions = getOrCreateActions(panelId);
        // Stagger fetches by 500ms to avoid API throttling
        if (delay === 0) {
          actions.setTimeRange(range, preset);
        } else {
          setTimeout(() => actions.setTimeRange(range, preset), delay);
        }
        delay += 500;
      }
    },

    saveWorkspace: (name: string): WorkspaceConfig => {
      const { panels, layoutMode } = get();
      const { awsProfile } = useSettingsStore.getState();
      const now = Date.now();

      const panelConfigs: PanelConfig[] = [...panels.values()].map((panel) => ({
        id: panel.id,
        logGroupName: panel.logGroupName,
        filterText: panel.filterText,
        disabledLevels: [...panel.disabledLevels],
        groupByMode: panel.groupByMode,
        groupFilter: panel.groupFilter,
        timeRange: panel.timeRange,
        timePreset: null, // TODO: track per-panel preset in Phase 5
        wasTailing: panel.isTailing,
      }));

      return {
        id: `ws-${now}`,
        name,
        awsProfile: awsProfile ?? null,
        layoutMode,
        panels: panelConfigs,
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

      // Create new panels from config
      const newPanels = new Map<string, PanelState>();
      for (const panelConfig of config.panels) {
        const id = generatePanelId();
        const panel = createPanelState(id);
        panel.logGroupName = panelConfig.logGroupName;
        panel.filterText = panelConfig.filterText;
        panel.disabledLevels = new Set(panelConfig.disabledLevels);
        panel.groupByMode = panelConfig.groupByMode;
        panel.groupFilter = panelConfig.groupFilter;
        panel.timeRange = panelConfig.timeRange;
        newPanels.set(id, panel);
      }

      // Ensure at least one panel
      if (newPanels.size === 0) {
        const id = generatePanelId();
        newPanels.set(id, createPanelState(id));
      }

      const firstId = [...newPanels.keys()][0];
      set({
        panels: newPanels,
        activePanelId: firstId,
        layoutMode: config.layoutMode,
      });

      // Stagger fetches for panels with log groups
      let delay = 0;
      for (const [id, panel] of newPanels) {
        if (panel.logGroupName) {
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
    },
  };
});

// ─── Convenience Hooks ──────────────────────────────────────────────────────

/** Get panel state by ID — returns loading sentinel for stale IDs */
export function usePanelState(panelId: string): PanelState {
  return useWorkspaceStore((s) => s.panels.get(panelId) ?? EMPTY_PANEL);
}

/** Get the active panel's state */
export function useActivePanelState(): PanelState {
  return useWorkspaceStore((s) => s.panels.get(s.activePanelId) ?? EMPTY_PANEL);
}

/** Get the active panel's ID */
export function useActivePanelId(): string {
  return useWorkspaceStore((s) => s.activePanelId);
}

/** Get ordered list of panel IDs */
export function usePanelIds(): string[] {
  return useWorkspaceStore(useShallow((s) => [...s.panels.keys()]));
}

// ─── Connection Callbacks ───────────────────────────────────────────────────

// Register post-connection callback to restore persisted state into the active panel
setOnConnectionEstablished(() => {
  const { activePanelId } = useWorkspaceStore.getState();
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

// Register post-refresh callback to re-fetch or restore for the active panel
setOnConnectionRefreshed(() => {
  const { activePanelId, panels } = useWorkspaceStore.getState();
  const panel = panels.get(activePanelId);
  if (!panel) return;

  const actions = useWorkspaceStore.getState().panelAction(activePanelId);

  if (panel.logGroupName) {
    // Already has a log group — refresh it
    if (panel.isTailing) {
      actions.stopTail();
      actions.startTail();
    } else {
      actions.fetchLogs(
        panel.timeRange?.start,
        panel.timeRange?.end ?? undefined,
      );
    }
  } else {
    // No log group — restore from settings
    const setPanelFn = (partial: Partial<PanelState>) => {
      const { panels: currentPanels } = useWorkspaceStore.getState();
      const existing = currentPanels.get(activePanelId);
      if (!existing) return;
      const updated = new Map(currentPanels);
      updated.set(activePanelId, { ...existing, ...partial });
      useWorkspaceStore.setState({ panels: updated });
    };
    restorePersistedStateForPanel(setPanelFn, actions);
  }
});
