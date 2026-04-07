import { createContext, useContext } from "react";
import {
  useWorkspaceStore,
  usePanelState as _usePanelState,
} from "../stores/workspaceStore";
import { useGroupStore } from "../stores/groupStore";
import type { PanelState, PanelActions } from "../stores/panelSlice";

/**
 * PanelContext provides the current panel ID to child components.
 * Used by PanelView to scope all state reads/writes to a specific panel.
 */
export const PanelContext = createContext<string>("");

/**
 * GroupContext provides the current group ID to child components.
 * Used by EditorGroupView to scope group-level operations.
 */
export const GroupContext = createContext<string>("");

/** Get the current panel ID from context */
export function usePanelId(): string {
  return useContext(PanelContext);
}

/** Get the current group ID from context */
export function useGroupId(): string {
  return useContext(GroupContext);
}

/**
 * Get the current panel ID, falling back to active group's active panel when not inside a PanelContext.
 * Use this in components that may be rendered either inside or outside PanelView.
 */
export function useCurrentPanelId(): string {
  const contextId = usePanelId();
  const activeId = useGroupStore((s) => {
    return s.getActivePanelId();
  });
  return contextId || activeId;
}

/** Get the current panel's state (works with or without PanelContext) */
export function useCurrentPanelState(): PanelState {
  const panelId = useCurrentPanelId();
  return _usePanelState(panelId);
}

/** Get the current panel's actions (works with or without PanelContext) */
export function useCurrentPanelActions(): PanelActions {
  const panelId = useCurrentPanelId();
  return useWorkspaceStore((s) => s.panelAction(panelId));
}
