import { useState, useCallback, useRef } from "react";
import { useGroupStore } from "../stores/groupStore";
import { usePanelState } from "../stores/workspaceStore";
import { GroupContext } from "../contexts/PanelContext";
import { PanelView } from "./PanelView";
import { MergedPanelView } from "./MergedPanelView";
import { useSystemTheme } from "../hooks/useSystemTheme";
import type { PanelState } from "../stores/panelSlice";
import type { LeafNode } from "../types/workspace";

// Drag data shape for tab drags
interface TabDragData {
  panelId: string;
  groupId: string;
}

function parseDragData(e: React.DragEvent): TabDragData | null {
  try {
    const raw = e.dataTransfer.getData("text/plain");
    const data = JSON.parse(raw);
    if (data.panelId && data.groupId) return data as TabDragData;
  } catch {
    // not our drag
  }
  return null;
}

function getStatusDot(panel: PanelState): { color: string; title: string } {
  if (panel.error) {
    return { color: "bg-red-400", title: "Error" };
  } else if (panel.isTailing && panel.activeTransport === "stream") {
    return { color: "bg-green-400", title: "Streaming" };
  } else if (panel.isTailing && panel.activeTransport === "poll") {
    return { color: "bg-blue-400", title: "Polling" };
  } else if (panel.isLoading) {
    return { color: "bg-yellow-400", title: "Loading" };
  } else {
    return { color: "bg-gray-400", title: "Idle" };
  }
}

function getTabLabel(panel: PanelState): string {
  if (panel.logGroupName) {
    const parts = panel.logGroupName.split("/");
    return parts[parts.length - 1] || panel.logGroupName;
  }
  return "New Tab";
}

// ─── Tab Item ───────────────────────────────────────────────────────────────

function TabItem({
  panelId,
  groupId,
  isActive,
  isDark,
  dropPosition,
  onDragOverTab,
  onDragLeaveTab,
  onDropOnTab,
}: {
  panelId: string;
  groupId: string;
  isActive: boolean;
  isDark: boolean;
  dropPosition: "before" | "after" | null;
  onDragOverTab: (panelId: string, side: "before" | "after") => void;
  onDragLeaveTab: () => void;
  onDropOnTab: (targetPanelId: string) => void;
}) {
  const panel = usePanelState(panelId);
  const setActiveGroupPanel = useGroupStore((s) => s.setActiveGroupPanel);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const removePanelFromGroup = useGroupStore((s) => s.removePanelFromGroup);
  const tabRef = useRef<HTMLDivElement>(null);

  const status = getStatusDot(panel);
  const label = getTabLabel(panel);

  const handleClick = useCallback(() => {
    setActiveGroupPanel(groupId, panelId);
    setActiveGroup(groupId);
  }, [groupId, panelId, setActiveGroupPanel, setActiveGroup]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removePanelFromGroup(groupId, panelId);
    },
    [groupId, panelId, removePanelFromGroup],
  );

  return (
    <div
      ref={tabRef}
      draggable
      onClick={handleClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ panelId, groupId }),
        );
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Determine left/right half for insertion indicator
        const rect = tabRef.current?.getBoundingClientRect();
        if (rect) {
          const midX = rect.left + rect.width / 2;
          onDragOverTab(panelId, e.clientX < midX ? "before" : "after");
        }
      }}
      onDragLeave={onDragLeaveTab}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnTab(panelId);
      }}
      className={`relative flex items-center gap-1.5 px-2.5 h-7 text-xs cursor-pointer transition-colors max-w-48 min-w-0 border-t-2 ${
        isActive
          ? isDark
            ? "bg-gray-900 text-gray-100 border-t-blue-500"
            : "bg-white text-gray-900 border-t-blue-500"
          : isDark
            ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 border-t-transparent"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 border-t-transparent"
      }`}
      title={panel.logGroupName || "New Tab"}
    >
      {/* Drop indicator - left side */}
      {dropPosition === "before" && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-full" />
      )}
      {/* Drop indicator - right side */}
      {dropPosition === "after" && (
        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-full" />
      )}

      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.color}`}
        title={status.title}
      />
      <span className="truncate">{label}</span>
      <button
        onClick={handleClose}
        className={`ml-auto shrink-0 w-4 h-4 flex items-center justify-center rounded text-xs transition-colors ${
          isDark
            ? "hover:bg-gray-600 text-gray-500 hover:text-gray-200"
            : "hover:bg-gray-300 text-gray-400 hover:text-gray-700"
        }`}
        title="Close tab"
      >
        &times;
      </button>
    </div>
  );
}

// ─── Pane Drop Zones ────────────────────────────────────────────────────────

type PaneDropEdge = "left" | "right" | "top" | "bottom" | null;

function PaneDropOverlay({
  activeEdge,
  isDark,
}: {
  activeEdge: PaneDropEdge;
  isDark: boolean;
}) {
  if (!activeEdge) return null;

  const edgeClasses: Record<string, string> = {
    left: "left-0 top-0 bottom-0 w-1/3",
    right: "right-0 top-0 bottom-0 w-1/3",
    top: "left-0 top-0 right-0 h-1/3",
    bottom: "left-0 bottom-0 right-0 h-1/3",
  };

  return (
    <div
      className={`absolute ${edgeClasses[activeEdge]} ${
        isDark ? "bg-blue-500/15" : "bg-blue-500/10"
      } border-2 border-blue-500/50 rounded pointer-events-none z-10 transition-all`}
    />
  );
}

function detectPaneEdge(e: React.DragEvent, rect: DOMRect): PaneDropEdge {
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  // Edge zone is the outer 25% on each side
  const edgeThreshold = 0.25;

  const relX = x / w;
  const relY = y / h;

  // Check edges in priority order (corners go to the nearest edge)
  if (relX < edgeThreshold) return "left";
  if (relX > 1 - edgeThreshold) return "right";
  if (relY < edgeThreshold) return "top";
  if (relY > 1 - edgeThreshold) return "bottom";

  return null; // Center area = drop into tab bar (move to group)
}

// ─── Editor Group View ──────────────────────────────────────────────────────

interface EditorGroupViewProps {
  groupId: string;
  isActiveGroup: boolean;
}

export function EditorGroupView({
  groupId,
  isActiveGroup,
}: EditorGroupViewProps) {
  const isDark = useSystemTheme();
  const group = useGroupStore((s) => s.getLeaf(groupId)) as
    | LeafNode
    | undefined;
  const addPanelToGroup = useGroupStore((s) => s.addPanelToGroup);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const splitGroup = useGroupStore((s) => s.splitGroup);
  const toggleGroupMerged = useGroupStore((s) => s.toggleGroupMerged);

  // Tab bar drag state
  const [dropTarget, setDropTarget] = useState<{
    panelId: string;
    side: "before" | "after";
  } | null>(null);

  // Pane content drag state
  const [paneDropEdge, setPaneDropEdge] = useState<PaneDropEdge>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!group) return null;

  const handleAddTab = useCallback(() => {
    addPanelToGroup(groupId);
  }, [groupId, addPanelToGroup]);

  const handleSplitH = useCallback(() => {
    splitGroup(groupId, "horizontal");
  }, [groupId, splitGroup]);

  const handleSplitV = useCallback(() => {
    splitGroup(groupId, "vertical");
  }, [groupId, splitGroup]);

  const handleToggleMerged = useCallback(() => {
    toggleGroupMerged(groupId);
  }, [groupId, toggleGroupMerged]);

  const handleFocus = useCallback(() => {
    if (!isActiveGroup) {
      setActiveGroup(groupId);
    }
  }, [groupId, isActiveGroup, setActiveGroup]);

  // Tab bar drag handlers
  const handleDragOverTab = useCallback(
    (panelId: string, side: "before" | "after") => {
      setDropTarget({ panelId, side });
    },
    [],
  );

  const handleDragLeaveTab = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDropOnTab = useCallback((_targetPanelId: string) => {
    setDropTarget(null);
    // Actual drop logic uses the last known dropTarget
    // (handled in the tab bar's onDrop since we need the drag data)
  }, []);

  // Handle the actual tab bar drop (fires on the tab bar container)
  const handleTabBarDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = parseDragData(e);
      if (!data) {
        setDropTarget(null);
        return;
      }

      const store = useGroupStore.getState();
      const targetLeaf = store.getLeaf(groupId);
      if (!targetLeaf) return;

      if (dropTarget) {
        // Dropped on a specific tab: insert at that position
        const targetIdx = targetLeaf.panelIds.indexOf(dropTarget.panelId);
        const insertAt =
          dropTarget.side === "after" ? targetIdx + 1 : targetIdx;

        if (data.groupId === groupId) {
          const ids = [...targetLeaf.panelIds];
          const fromIdx = ids.indexOf(data.panelId);
          if (
            fromIdx === -1 ||
            fromIdx === insertAt ||
            fromIdx === insertAt - 1
          )
            return;
          ids.splice(fromIdx, 1);
          const adjustedInsert = fromIdx < insertAt ? insertAt - 1 : insertAt;
          ids.splice(adjustedInsert, 0, data.panelId);
          store.reorderPanelsInGroup(groupId, ids);
        } else {
          store.movePanel(data.panelId, data.groupId, groupId, insertAt);
        }
      } else {
        // Dropped on tab bar empty space: append to end
        if (data.groupId === groupId) {
          // Move to end within same group
          const ids = [...targetLeaf.panelIds];
          const fromIdx = ids.indexOf(data.panelId);
          if (fromIdx === -1 || fromIdx === ids.length - 1) return;
          ids.splice(fromIdx, 1);
          ids.push(data.panelId);
          store.reorderPanelsInGroup(groupId, ids);
        } else {
          store.movePanel(data.panelId, data.groupId, groupId);
        }
      }

      setDropTarget(null);
    },
    [groupId, dropTarget],
  );

  // Pane content drop handlers
  const handlePaneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = contentRef.current?.getBoundingClientRect();
    if (rect) {
      setPaneDropEdge(detectPaneEdge(e, rect));
    }
  }, []);

  const handlePaneDragLeave = useCallback(() => {
    setPaneDropEdge(null);
  }, []);

  const handlePaneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = parseDragData(e);
      const edge = paneDropEdge;
      setPaneDropEdge(null);

      if (!data) return;

      const store = useGroupStore.getState();

      if (edge) {
        // Drop on an edge = split panel into new group in that direction
        const splitDir =
          edge === "left" || edge === "right" ? "horizontal" : "vertical";

        store.splitPanelToNewGroup(data.panelId, data.groupId, splitDir);
      } else {
        // Drop in center = move tab to this group
        if (data.groupId !== groupId) {
          store.movePanel(data.panelId, data.groupId, groupId);
        }
      }
    },
    [groupId, paneDropEdge],
  );

  return (
    <GroupContext.Provider value={groupId}>
      <div
        className={`flex flex-col flex-1 min-w-0 min-h-0 ${
          isActiveGroup
            ? isDark
              ? "ring-1 ring-blue-500/30"
              : "ring-1 ring-blue-500/20"
            : ""
        }`}
        onClick={handleFocus}
      >
        {/* Per-group tab bar */}
        <div
          className={`flex items-center h-7 px-0.5 gap-0.5 shrink-0 select-none border-b ${
            isDark
              ? "bg-gray-800/80 border-gray-700"
              : "bg-gray-100 border-gray-300"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleTabBarDrop}
          onDragLeave={handleDragLeaveTab}
        >
          {group.panelIds.map((panelId) => (
            <TabItem
              key={panelId}
              panelId={panelId}
              groupId={groupId}
              isActive={panelId === group.activePanelId}
              isDark={isDark}
              dropPosition={
                dropTarget?.panelId === panelId ? dropTarget.side : null
              }
              onDragOverTab={handleDragOverTab}
              onDragLeaveTab={handleDragLeaveTab}
              onDropOnTab={handleDropOnTab}
            />
          ))}

          {/* Add tab button */}
          <button
            onClick={handleAddTab}
            className={`flex items-center justify-center w-5 h-5 rounded text-sm transition-colors shrink-0 ${
              isDark
                ? "hover:bg-gray-700 text-gray-500 hover:text-gray-200"
                : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
            }`}
            title="New tab in this group"
          >
            +
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Merge toggle (only show when 2+ tabs) */}
          {group.panelIds.length > 1 && (
            <button
              onClick={handleToggleMerged}
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 ${
                group.merged
                  ? "bg-blue-600 text-white"
                  : isDark
                    ? "hover:bg-gray-700 text-gray-500 hover:text-gray-200"
                    : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
              }`}
              title={
                group.merged ? "Unmerge tabs" : "Merge tabs chronologically"
              }
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <rect
                  x="1"
                  y="1"
                  width="12"
                  height="12"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="3"
                  y1="4.5"
                  x2="11"
                  y2="4.5"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.6"
                />
                <line
                  x1="3"
                  y1="7"
                  x2="11"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.6"
                />
                <line
                  x1="3"
                  y1="9.5"
                  x2="11"
                  y2="9.5"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.6"
                />
              </svg>
            </button>
          )}

          {/* Split horizontal */}
          <button
            onClick={handleSplitH}
            className={`flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 ${
              isDark
                ? "hover:bg-gray-700 text-gray-500 hover:text-gray-200"
                : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
            }`}
            title="Split right"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect
                x="1"
                y="1"
                width="12"
                height="12"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="7"
                y1="1"
                x2="7"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>

          {/* Split vertical */}
          <button
            onClick={handleSplitV}
            className={`flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 mr-0.5 ${
              isDark
                ? "hover:bg-gray-700 text-gray-500 hover:text-gray-200"
                : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
            }`}
            title="Split down"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect
                x="1"
                y="1"
                width="12"
                height="12"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="1"
                y1="7"
                x2="13"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>

        {/* Panel content with pane drop zones */}
        <div
          ref={contentRef}
          className="flex-1 min-h-0 relative"
          onDragOver={handlePaneDragOver}
          onDragLeave={handlePaneDragLeave}
          onDrop={handlePaneDrop}
        >
          {group.merged ? (
            /* Merged mode: chronological view of all tabs in this group */
            <div className="absolute inset-0">
              <MergedPanelView scopedPanelIds={group.panelIds} />
            </div>
          ) : (
            /* Normal mode: show active tab, hide others for state preservation */
            group.panelIds.map((panelId) => (
              <div
                key={panelId}
                className={`absolute inset-0 ${
                  panelId === group.activePanelId ? "" : "hidden"
                }`}
              >
                <PanelView panelId={panelId} />
              </div>
            ))
          )}

          {/* Drop zone overlay */}
          <PaneDropOverlay activeEdge={paneDropEdge} isDark={isDark} />
        </div>
      </div>
    </GroupContext.Provider>
  );
}
