import { createContext, useContext } from "react";

/**
 * PanelContext provides the current panel ID to child components.
 * Used by PanelView to scope all state reads/writes to a specific panel.
 */
export const PanelContext = createContext<string>("");

/** Get the current panel ID from context */
export function usePanelId(): string {
  return useContext(PanelContext);
}
