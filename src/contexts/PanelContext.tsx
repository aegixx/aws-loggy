import { createContext, useContext } from "react";
import {
  useWorkspaceStore,
  usePanelState as _usePanelState,
} from "../stores/workspaceStore";
import type { PanelState, PanelActions } from "../stores/panelSlice";

/**
 * PanelContext provides the current panel ID to child components.
 * Used by PanelView to scope all state reads/writes to a specific panel.
 */
export const PanelContext = createContext<string>("");

/** Get the current panel ID from context */
export function usePanelId(): string {
  return useContext(PanelContext);
}

/**
 * Get the current panel ID, falling back to activePanelId when not inside a PanelContext.
 * Use this in components that may be rendered either inside or outside PanelView.
 */
export function useCurrentPanelId(): string {
  const contextId = usePanelId();
  const activeId = useWorkspaceStore((s) => s.activePanelId);
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
