/**
 * logStore.ts — FACADE
 *
 * This module preserves the original useLogStore API for backward compatibility.
 * It delegates all state reads/writes to:
 *   - connectionStore (AWS connection, log groups)
 *   - workspaceStore (active panel state and actions)
 *
 * All existing consumers continue to work unchanged.
 * In Phase 2, components will migrate to usePanelState/usePanelActions directly,
 * and this facade will be deleted.
 */
import { create } from "zustand";
import type { LogGroup, ParsedLogEvent, LogLevel, GroupByMode } from "../types";
import type { TransportType } from "./LiveTailManager";
import { useConnectionStore } from "./connectionStore";
import { useWorkspaceStore } from "./workspaceStore";

// Re-export extracted utilities for backward compatibility
export { parseLogLevel } from "../utils/logParsing";
export { filterLogs } from "../utils/logFiltering";

interface AwsConnectionInfo {
  profile: string | null;
  region: string | null;
}

interface LogStore {
  // Connection state (from connectionStore)
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  awsInfo: AwsConnectionInfo | null;

  // Log groups (from connectionStore)
  logGroups: LogGroup[];
  selectedLogGroup: string | null;

  // Logs (from active panel)
  logs: ParsedLogEvent[];
  isLoading: boolean;
  loadingProgress: number;
  loadingSizeBytes: number;
  totalSizeBytes: number;
  error: string | null;

  // Filtering (from active panel)
  filterText: string;
  disabledLevels: Set<LogLevel>;
  filteredLogs: ParsedLogEvent[];

  // UI state (from active panel)
  expandedLogIndex: number | null;
  selectedLogIndex: number | null;
  selectedLogIndices: Set<number>;

  // Time range (from active panel)
  timeRange: { start: number; end: number | null } | null;

  // Grouping (from active panel)
  groupByMode: GroupByMode | "auto";
  collapsedGroups: Set<string>;
  groupFilter: boolean;
  effectiveGroupByMode: GroupByMode;

  // Live tail (from active panel)
  isTailing: boolean;
  tailManager: unknown;
  activeTransport: TransportType | null;
  isFollowing: boolean;
  tailToast: string | null;

  // Actions — connection (delegate to connectionStore)
  initializeAws: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  loadLogGroups: () => Promise<void>;
  setSessionExpired: () => void;
  setConnectionFailed: (message: string) => void;

  // Actions — panel (delegate to active panel)
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

/**
 * Facade store that composes connectionStore + workspaceStore's active panel.
 *
 * Uses create() so components can subscribe via useLogStore() as before.
 * The store syncs with underlying stores via subscriptions.
 *
 * Actions are stable references (created once) that lazily resolve the
 * active panel on each call. Only data values are synced on store changes.
 */

function getActiveActions() {
  const { activePanelId, panelAction } = useWorkspaceStore.getState();
  return panelAction(activePanelId);
}

// Stable action references — created once, never change
const stableActions = {
  // Connection actions (delegate to connectionStore)
  initializeAws: () => useConnectionStore.getState().initializeAws(),
  refreshConnection: () => useConnectionStore.getState().refreshConnection(),
  loadLogGroups: () => useConnectionStore.getState().loadLogGroups(),
  setSessionExpired: () => useConnectionStore.getState().setSessionExpired(),
  setConnectionFailed: (message: string) =>
    useConnectionStore.getState().setConnectionFailed(message),

  // Panel actions (delegate to active panel)
  selectLogGroup: (name: string) => getActiveActions().selectLogGroup(name),
  fetchLogs: (startTime?: number, endTime?: number) =>
    getActiveActions().fetchLogs(startTime, endTime),
  setFilterText: (text: string) => getActiveActions().setFilterText(text),
  toggleLevel: (level: LogLevel) => getActiveActions().toggleLevel(level),
  setExpandedLogIndex: (index: number | null) =>
    getActiveActions().setExpandedLogIndex(index),
  setSelectedLogIndex: (index: number | null) =>
    getActiveActions().setSelectedLogIndex(index),
  setSelectedLogIndices: (indices: Set<number>) =>
    getActiveActions().setSelectedLogIndices(indices),
  clearSelection: () => getActiveActions().clearSelection(),
  setTimeRange: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => getActiveActions().setTimeRange(range, preset),
  startTail: () => getActiveActions().startTail(),
  stopTail: () => getActiveActions().stopTail(),
  setIsFollowing: (following: boolean) =>
    getActiveActions().setIsFollowing(following),
  setTailToast: (message: string | null) =>
    getActiveActions().setTailToast(message),
  clearLogs: () => getActiveActions().clearLogs(),
  resetFilters: () => getActiveActions().resetFilters(),
  resetState: () => getActiveActions().resetState(),
  setLoadingProgress: (count: number, sizeBytes: number) =>
    getActiveActions().setLoadingProgress(count, sizeBytes),
  toggleGroupFilter: () => getActiveActions().toggleGroupFilter(),
  setGroupByMode: (mode: GroupByMode | "auto") =>
    getActiveActions().setGroupByMode(mode),
  toggleGroupCollapsed: (groupId: string) =>
    getActiveActions().toggleGroupCollapsed(groupId),
  expandAllGroups: () => getActiveActions().expandAllGroups(),
  collapseAllGroups: (groupIds: string[]) =>
    getActiveActions().collapseAllGroups(groupIds),
};

/** Build data-only state (no actions) from underlying stores */
function buildDataState(): Omit<LogStore, keyof typeof stableActions> {
  const conn = useConnectionStore.getState();
  const ws = useWorkspaceStore.getState();
  const panel = ws.panels.get(ws.activePanelId);

  if (panel) {
    return {
      isConnected: conn.isConnected,
      isConnecting: conn.isConnecting,
      connectionError: conn.connectionError,
      awsInfo: conn.awsInfo,
      logGroups: conn.logGroups,
      selectedLogGroup: panel.logGroupName,
      logs: panel.logs,
      isLoading: panel.isLoading,
      loadingProgress: panel.loadingProgress,
      loadingSizeBytes: panel.loadingSizeBytes,
      totalSizeBytes: panel.totalSizeBytes,
      error: panel.error,
      filterText: panel.filterText,
      disabledLevels: panel.disabledLevels,
      filteredLogs: panel.filteredLogs,
      expandedLogIndex: panel.expandedLogIndex,
      selectedLogIndex: panel.selectedLogIndex,
      selectedLogIndices: panel.selectedLogIndices,
      timeRange: panel.timeRange,
      groupByMode: panel.groupByMode,
      collapsedGroups: panel.collapsedGroups,
      groupFilter: panel.groupFilter,
      effectiveGroupByMode: panel.effectiveGroupByMode,
      isTailing: panel.isTailing,
      tailManager: panel.tailManager,
      activeTransport: panel.activeTransport,
      isFollowing: panel.isFollowing,
      tailToast: panel.tailToast,
    };
  } else {
    return {
      isConnected: conn.isConnected,
      isConnecting: conn.isConnecting,
      connectionError: conn.connectionError,
      awsInfo: conn.awsInfo,
      logGroups: conn.logGroups,
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
      groupByMode: "none" as GroupByMode | "auto",
      collapsedGroups: new Set(),
      groupFilter: true,
      effectiveGroupByMode: "none" as GroupByMode,
      isTailing: false,
      tailManager: null,
      activeTransport: null,
      isFollowing: false,
      tailToast: null,
    };
  }
}

export const useLogStore = create<LogStore>(() => ({
  ...buildDataState(),
  ...stableActions,
}));

// Sync facade data when underlying stores change (actions are stable, never re-set)
useConnectionStore.subscribe(() => {
  useLogStore.setState(buildDataState());
});

useWorkspaceStore.subscribe(() => {
  useLogStore.setState(buildDataState());
});

/** Get the current fetch ID for the active panel (used by App.tsx progress events) */
export function getCurrentFetchId(): number {
  const { activePanelId } = useWorkspaceStore.getState();
  const panel = useWorkspaceStore.getState().panels.get(activePanelId);
  return panel?.currentFetchId ?? 0;
}
