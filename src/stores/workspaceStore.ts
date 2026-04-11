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
import { useSettingsStore, DEFAULT_TIME_PRESETS } from "./settingsStore";
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
  /**
   * ID of the saved workspace currently bound to this window, if any.
   * Non-null when the user opened a window with `Loggy → New Window with
   * Workspace → <name>` or loaded a saved workspace manually. Used to decide
   * whether to auto-save the current state back on window close.
   */
  loadedWorkspaceId: string | null;
  saveWorkspace: (name: string) => WorkspaceConfig;
  loadWorkspace: (config: WorkspaceConfig) => void;
  /**
   * Persist the currently loaded workspace back to the saved-workspaces
   * catalog. Called from App.tsx on `tauri://close-requested` when
   * `loadedWorkspaceId` is non-null.
   */
  autoSaveLoadedWorkspace: () => void;
}

type WorkspaceStore = PanelSlice &
  MergedViewSlice &
  CorrelationSlice &
  WorkspaceConfigSlice;

// ─── Persisted State Restoration ────────────────────────────────────────────

function restorePersistedStateForPanel(
  panelId: string,
  setPanel: (partial: Partial<PanelState>) => void,
  actions: PanelActions,
  useGlobalFallback: boolean,
): void {
  const {
    lastSelectedLogGroup,
    panelPersistedConfigs,
    getPersistedDisabledLevelsAsSet,
    persistedTimeRange,
    persistedTimePreset,
    persistedGroupByMode,
    persistedGroupFilter,
    getDefaultDisabledLevels,
  } = useSettingsStore.getState();

  const rawConfig = panelPersistedConfigs[panelId];
  const persistedLevels = getPersistedDisabledLevelsAsSet();

  // Per-panel configs may have been created before new fields were added
  // (e.g. disabledLevels, timePreset). Check each field explicitly with
  // "in" operator to distinguish "field is null" (explicitly set) from
  // "field is undefined" (missing, should fall back to global).
  const hasField = (field: string) => rawConfig != null && field in rawConfig;

  // When useGlobalFallback is false (multi-panel), panels without per-panel
  // config stay with defaults — no global bleed from other panels' settings.
  const fallback = <T>(perPanel: T | undefined, global: T, dflt: T): T => {
    if (perPanel !== undefined) return perPanel;
    if (useGlobalFallback) return global;
    return dflt;
  };

  // Resolve time preset: per-panel if the field exists, else global (single panel) or null (multi)
  const effectiveTimePreset = hasField("timePreset")
    ? rawConfig!.timePreset
    : fallback(undefined, persistedTimePreset, null);
  const effectiveTimeRange = hasField("timeRange")
    ? rawConfig!.timeRange
    : fallback(undefined, persistedTimeRange, null);

  // Build from user-configurable presets (not hardcoded labels)
  const { timePresets } = useSettingsStore.getState();
  const presetToMs: Record<string, number> = {};
  for (const p of timePresets ?? DEFAULT_TIME_PRESETS) {
    presetToMs[p.label] = p.ms;
  }

  let restoredTimeRange: { start: number; end: number | null } | null = null;
  if (effectiveTimePreset && presetToMs[effectiveTimePreset]) {
    const now = Date.now();
    restoredTimeRange = {
      start: now - presetToMs[effectiveTimePreset],
      end: null,
    };
  } else if (effectiveTimePreset === "custom" && effectiveTimeRange) {
    restoredTimeRange = effectiveTimeRange;
  }

  // Resolve groupByMode: per-panel if field exists, else global/default
  const effectiveGroupByModeRaw = hasField("groupByMode")
    ? rawConfig!.groupByMode
    : fallback(undefined, persistedGroupByMode, "none");
  const restoredGroupByMode = (
    ["none", "stream", "invocation", "auto"].includes(effectiveGroupByModeRaw)
      ? effectiveGroupByModeRaw
      : "none"
  ) as GroupByMode;

  // Resolve groupFilter: per-panel if field exists, else global/default
  const restoredGroupFilter = hasField("groupFilter")
    ? rawConfig!.groupFilter
    : fallback(undefined, persistedGroupFilter, true);

  // Resolve disabledLevels: per-panel if field exists, else global/default.
  // An empty array means "all levels enabled" (explicitly set).
  // A missing field means "inherit global" (config created before field was added).
  let restoredDisabledLevels: Set<string>;
  if (hasField("disabledLevels") && Array.isArray(rawConfig!.disabledLevels)) {
    restoredDisabledLevels = new Set(rawConfig!.disabledLevels);
  } else if (useGlobalFallback) {
    restoredDisabledLevels =
      persistedLevels.size > 0 ? persistedLevels : getDefaultDisabledLevels();
  } else {
    restoredDisabledLevels = getDefaultDisabledLevels();
  }

  setPanel({
    disabledLevels: restoredDisabledLevels,
    timeRange: restoredTimeRange,
    groupByMode: restoredGroupByMode,
    effectiveGroupByMode: restoredGroupByMode,
    groupFilter: restoredGroupByMode === "none" ? false : restoredGroupFilter,
  });

  const { logGroups } = useConnectionStore.getState();

  // Use per-panel log group if available, fall back to global only for single panel
  const effectiveLogGroup =
    rawConfig != null
      ? rawConfig.logGroupName
      : fallback(undefined, lastSelectedLogGroup, null);

  // Defer write-back to avoid cross-store render tearing.
  // The workspaceStore setPanel above is the authoritative state change.
  if (effectiveLogGroup) {
    setTimeout(() => {
      const { setPanelPersistedConfig } = useSettingsStore.getState();
      setPanelPersistedConfig(panelId, {
        logGroupName: effectiveLogGroup,
        timePreset: effectiveTimePreset,
        timeRange: effectiveTimePreset === "custom" ? effectiveTimeRange : null,
        groupByMode: restoredGroupByMode,
        groupFilter: restoredGroupFilter,
        disabledLevels: [...restoredDisabledLevels],
      });
    }, 0);
  }

  if (
    effectiveLogGroup &&
    logGroups.some((g) => g.name === effectiveLogGroup)
  ) {
    actions.selectLogGroup(effectiveLogGroup);

    if (effectiveTimePreset === "live") {
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
    loadedWorkspaceId: null,

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

      set({ panels: newPanels, loadedWorkspaceId: config.id });

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

    autoSaveLoadedWorkspace: () => {
      const { loadedWorkspaceId } = get();
      if (!loadedWorkspaceId) return;

      const settings = useSettingsStore.getState();
      const existing = settings.savedWorkspaces.find(
        (w) => w.id === loadedWorkspaceId,
      );
      if (!existing) {
        console.warn(
          `[Workspace] autoSaveLoadedWorkspace: id ${loadedWorkspaceId} no longer in catalog, skipping`,
        );
        return;
      }

      // Build an updated config preserving the id + name but refreshing the
      // layout, panels, and profile to whatever the user ended with.
      const fresh = get().saveWorkspace(existing.name);
      settings.addSavedWorkspace({
        ...fresh,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      });
      console.info(
        `[Workspace] auto-saved workspace ${existing.name} (${existing.id}) on close`,
      );
    },
  };
});

// ─── Convenience Hooks ──────────────────────────────────────────────────────

/** Get panel state by ID — returns loading sentinel for stale IDs */
export function usePanelState(panelId: string): PanelState {
  return useWorkspaceStore((s) => s.panels.get(panelId) ?? EMPTY_PANEL);
}

// ─── Connection Callbacks ───────────────────────────────────────────────────

// Register post-connection callback to restore persisted state into all panels
setOnConnectionEstablished(() => {
  const allPanelIds = useGroupStore.getState().getAllPanelIds();
  if (allPanelIds.length === 0) return;

  // Only use global fallback (lastSelectedLogGroup, persistedTimePreset, etc.)
  // for single-panel layouts. Multi-panel: each panel uses its own per-panel
  // config or stays empty — prevents panel 1's settings from bleeding into
  // unconfigured panels.
  const useGlobalFallback = allPanelIds.length === 1;

  allPanelIds.forEach((panelId, index) => {
    const setPanelFn = (partial: Partial<PanelState>) => {
      const { panels } = useWorkspaceStore.getState();
      const existing = panels.get(panelId);
      if (!existing) return;
      const updated = new Map(panels);
      updated.set(panelId, { ...existing, ...partial });
      useWorkspaceStore.setState({ panels: updated });
    };

    const actions = useWorkspaceStore.getState().panelAction(panelId);

    if (index === 0) {
      restorePersistedStateForPanel(
        panelId,
        setPanelFn,
        actions,
        useGlobalFallback,
      );
    } else {
      // Stagger secondary panel fetches to avoid hammering AWS
      setTimeout(
        () =>
          restorePersistedStateForPanel(
            panelId,
            setPanelFn,
            actions,
            useGlobalFallback,
          ),
        index * 500,
      );
    }
  });
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
