import { useState, useCallback, useRef } from "react";

interface UseDragSelectionOptions {
  setSelectedLogIndices: (indices: Set<number>) => void;
  clearSelection: () => void;
  onRowClick: (index: number) => void;
  expandedLogIndex: number | null;
  setExpandedLogIndex: (index: number | null) => void;
  setSelectedLogIndex: (index: number | null) => void;
}

interface UseDragSelectionReturn {
  isDragging: boolean;
  handleRowMouseDown: (index: number, e: React.MouseEvent) => void;
  handleRowMouseEnter: (index: number) => void;
  handleContainerMouseMove: (e: React.MouseEvent) => void;
  handleContainerMouseUp: () => void;
  handleContainerMouseLeave: () => void;
}

/**
 * Hook to handle drag-to-select functionality for log rows.
 * Supports:
 * - Single click to select/expand
 * - Drag to select multiple rows
 * - Click on empty space to clear selection
 */
export function useDragSelection({
  setSelectedLogIndices,
  clearSelection,
  onRowClick,
  expandedLogIndex,
  setExpandedLogIndex,
  setSelectedLogIndex,
}: UseDragSelectionOptions): UseDragSelectionReturn {
  const [dragStart, setDragStart] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCurrentIndex = useRef<number | null>(null);

  const handleRowMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      // Only start drag on left mouse button
      if (e.button !== 0) return;
      setDragStart({ index, x: e.clientX, y: e.clientY });
      dragCurrentIndex.current = index;
    },
    [],
  );

  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Start dragging once threshold is exceeded
      if (!isDragging && distance > 5) {
        setIsDragging(true);
        clearSelection();
      }

      if (isDragging && dragCurrentIndex.current !== null) {
        // Calculate selection range
        const startIdx = dragStart.index;
        const endIdx = dragCurrentIndex.current;
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);

        const newSelection = new Set<number>();
        for (let i = minIdx; i <= maxIdx; i++) {
          newSelection.add(i);
        }
        setSelectedLogIndices(newSelection);
      }
    },
    [dragStart, isDragging, clearSelection, setSelectedLogIndices],
  );

  const handleContainerMouseUp = useCallback(() => {
    if (!isDragging && dragStart) {
      // Was a click on a row, not a drag - clear any multi-selection and trigger row expansion
      clearSelection();
      onRowClick(dragStart.index);
    } else if (!dragStart && !isDragging) {
      // Clicked on empty space (not on any row) - clear selection
      clearSelection();
      if (expandedLogIndex !== null) {
        setExpandedLogIndex(null);
      }
      setSelectedLogIndex(null);
    }
    setDragStart(null);
    setIsDragging(false);
    dragCurrentIndex.current = null;
  }, [
    isDragging,
    dragStart,
    onRowClick,
    clearSelection,
    expandedLogIndex,
    setExpandedLogIndex,
    setSelectedLogIndex,
  ]);

  // Handle mouse leaving the container - only clean up drag state, don't collapse expanded row
  const handleContainerMouseLeave = useCallback(() => {
    setDragStart(null);
    setIsDragging(false);
    dragCurrentIndex.current = null;
  }, []);

  // Track which row the mouse is over during drag
  const handleRowMouseEnter = useCallback(
    (index: number) => {
      if (dragStart && isDragging) {
        dragCurrentIndex.current = index;
        // Update selection range
        const startIdx = dragStart.index;
        const minIdx = Math.min(startIdx, index);
        const maxIdx = Math.max(startIdx, index);

        const newSelection = new Set<number>();
        for (let i = minIdx; i <= maxIdx; i++) {
          newSelection.add(i);
        }
        setSelectedLogIndices(newSelection);
      }
    },
    [dragStart, isDragging, setSelectedLogIndices],
  );

  return {
    isDragging,
    handleRowMouseDown,
    handleRowMouseEnter,
    handleContainerMouseMove,
    handleContainerMouseUp,
    handleContainerMouseLeave,
  };
}
