import { useCallback } from "react";
import type { ListImperativeAPI } from "react-window";
import type { ParsedLogEvent } from "../types";

interface UseKeyboardNavigationOptions {
  filteredLogs: ParsedLogEvent[];
  selectedLogIndex: number | null;
  expandedLogIndex: number | null;
  setSelectedLogIndex: (index: number | null) => void;
  setExpandedLogIndex: (index: number | null) => void;
  getVisibleRowCount: () => number;
  selectedLogIndices: Set<number>;
  clearSelection: () => void;
  setSelectedLogIndices: (indices: Set<number>) => void;
  findStateIsOpen: boolean;
  findActionsClose: () => void;
  contextMenu: unknown | null;
  setContextMenu: (menu: null) => void;
  listRef: React.RefObject<ListImperativeAPI | null>;
}

/**
 * Hook to handle keyboard navigation for log viewer.
 * Supports:
 * - Arrow keys: Navigate between rows
 * - PageUp/PageDown: Navigate by page
 * - Home/End: Jump to first/last log
 * - Space/Enter: Expand/collapse selected row
 * - Escape: Close expanded row, clear selection, close context menu, close find bar
 * - Cmd/Ctrl+C: Copy selected logs
 * - Cmd/Ctrl+A: Select all logs
 */
export function useKeyboardNavigation({
  filteredLogs,
  selectedLogIndex,
  expandedLogIndex,
  setSelectedLogIndex,
  setExpandedLogIndex,
  getVisibleRowCount,
  selectedLogIndices,
  clearSelection,
  setSelectedLogIndices,
  findStateIsOpen,
  findActionsClose,
  contextMenu,
  setContextMenu,
  listRef,
}: UseKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Close context menu with Escape if it's open
      if (e.key === "Escape" && contextMenu) {
        e.preventDefault();
        setContextMenu(null);
        return;
      }

      // Close find bar with Escape if it's open
      if (e.key === "Escape" && findStateIsOpen) {
        e.preventDefault();
        findActionsClose();
        return;
      }

      // Don't handle other keys when Find dialog is open (allow typing in search input)
      if (findStateIsOpen) {
        return;
      }

      if (filteredLogs.length === 0) return;

      const currentIndex = selectedLogIndex ?? -1;
      let newIndex: number | null = null;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          newIndex = Math.min(currentIndex + 1, filteredLogs.length - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        case "PageDown":
          e.preventDefault();
          newIndex = Math.min(
            currentIndex + getVisibleRowCount(),
            filteredLogs.length - 1,
          );
          break;
        case "PageUp":
          e.preventDefault();
          newIndex = Math.max(currentIndex - getVisibleRowCount(), 0);
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = filteredLogs.length - 1;
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          if (selectedLogIndex !== null) {
            setExpandedLogIndex(
              expandedLogIndex === selectedLogIndex ? null : selectedLogIndex,
            );
          }
          return;
        case "Escape":
          e.preventDefault();
          if (expandedLogIndex !== null) {
            setExpandedLogIndex(null);
          }
          if (selectedLogIndices.size > 0) {
            clearSelection();
          }
          return;
        case "c":
          // Handle Cmd+C / Ctrl+C for copying selected messages
          if ((e.metaKey || e.ctrlKey) && selectedLogIndices.size > 0) {
            e.preventDefault();
            const messages = [...selectedLogIndices]
              .sort((a, b) => a - b)
              .map((i) => filteredLogs[i]?.message)
              .filter(Boolean)
              .join("\n");
            navigator.clipboard.writeText(messages);
          }
          return;
        case "a":
          // Handle Cmd+A / Ctrl+A to select all visible logs
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            const allIndices = new Set<number>(
              Array.from({ length: filteredLogs.length }, (_, i) => i),
            );
            setSelectedLogIndices(allIndices);
            // Collapse any expanded log when selecting all
            if (expandedLogIndex !== null) {
              setExpandedLogIndex(null);
            }
          }
          return;
      }

      if (newIndex !== null && newIndex !== currentIndex) {
        setSelectedLogIndex(newIndex);
        // Scroll to keep selected row visible
        if (listRef.current) {
          listRef.current.scrollToRow({
            index:
              expandedLogIndex !== null && newIndex > expandedLogIndex
                ? newIndex + 1
                : newIndex,
            align: "smart",
          });
        }
      }
    },
    [
      filteredLogs,
      selectedLogIndex,
      expandedLogIndex,
      setSelectedLogIndex,
      setExpandedLogIndex,
      getVisibleRowCount,
      selectedLogIndices,
      clearSelection,
      setSelectedLogIndices,
      findStateIsOpen,
      findActionsClose,
      contextMenu,
      setContextMenu,
      listRef,
    ],
  );

  return { handleKeyDown };
}
