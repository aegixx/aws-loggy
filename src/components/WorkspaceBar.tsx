import { useState, useCallback } from "react";
import { useWorkspaceStore, usePanelIds } from "../stores/workspaceStore";
import type { PanelState } from "../stores/panelSlice";
import type { LayoutMode } from "../types/workspace";
import { useSystemTheme } from "../hooks/useSystemTheme";

const MAX_PANELS = 10;

function getStatusDot(panel: PanelState): {
  color: string;
  title: string;
} {
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
    // Show last segment of log group name for brevity
    const parts = panel.logGroupName.split("/");
    return parts[parts.length - 1] || panel.logGroupName;
  }
  return "New Tab";
}

const LAYOUT_OPTIONS: { mode: LayoutMode; label: string; title: string }[] = [
  { mode: "tabs", label: "Tabs", title: "Tab view" },
  { mode: "split-horizontal", label: "H", title: "Split horizontal" },
  { mode: "split-vertical", label: "V", title: "Split vertical" },
  { mode: "merged", label: "M", title: "Merged chronological view" },
];

export function WorkspaceBar() {
  const isDark = useSystemTheme();
  const panelIds = usePanelIds();
  const panels = useWorkspaceStore((s) => s.panels);
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  const addPanel = useWorkspaceStore((s) => s.addPanel);
  const removePanel = useWorkspaceStore((s) => s.removePanel);
  const setActivePanel = useWorkspaceStore((s) => s.setActivePanel);
  const reorderPanels = useWorkspaceStore((s) => s.reorderPanels);
  const layoutMode = useWorkspaceStore((s) => s.layoutMode);
  const setLayoutMode = useWorkspaceStore((s) => s.setLayoutMode);
  const timeSyncEnabled = useWorkspaceStore((s) => s.timeSyncEnabled);
  const setTimeSyncEnabled = useWorkspaceStore((s) => s.setTimeSyncEnabled);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleAddPanel = useCallback(() => {
    if (panelIds.length >= MAX_PANELS) {
      console.warn(
        `[Workspace] Maximum ${MAX_PANELS} panels reached, cannot add more`,
      );
      return;
    }
    addPanel();
  }, [panelIds.length, addPanel]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, panelId: string) => {
      setDraggedId(panelId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", panelId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, panelId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(panelId);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      setDraggedId(null);

      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) return;

      const currentIds = [...panelIds];
      const sourceIndex = currentIds.indexOf(sourceId);
      const targetIndex = currentIds.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      currentIds.splice(sourceIndex, 1);
      currentIds.splice(targetIndex, 0, sourceId);
      reorderPanels(currentIds);
    },
    [panelIds, reorderPanels],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  // Only show workspace bar when there are multiple panels
  // (single panel mode doesn't need tabs)
  if (panelIds.length <= 1) {
    return null;
  }

  return (
    <div
      className={`flex items-center h-8 px-1 gap-0.5 border-b select-none ${
        isDark
          ? "bg-gray-800/80 border-gray-700"
          : "bg-gray-100 border-gray-300"
      }`}
    >
      {panelIds.map((panelId) => {
        const panel = panels.get(panelId);
        if (!panel) return null;

        const isActive = panelId === activePanelId;
        const isDragOver = panelId === dragOverId && panelId !== draggedId;
        const isDragging = panelId === draggedId;
        const status = getStatusDot(panel);
        const label = getTabLabel(panel);

        return (
          <div
            key={panelId}
            draggable
            onDragStart={(e) => handleDragStart(e, panelId)}
            onDragOver={(e) => handleDragOver(e, panelId)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, panelId)}
            onDragEnd={handleDragEnd}
            onClick={() => setActivePanel(panelId)}
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-t text-xs cursor-pointer transition-colors max-w-48 min-w-0 ${
              isDragging ? "opacity-40" : ""
            } ${
              isDragOver
                ? isDark
                  ? "border-l-2 border-l-blue-400"
                  : "border-l-2 border-l-blue-500"
                : "border-l-2 border-l-transparent"
            } ${
              isActive
                ? isDark
                  ? "bg-gray-900 text-gray-100 border-t-2 border-t-blue-500"
                  : "bg-white text-gray-900 border-t-2 border-t-blue-500"
                : isDark
                  ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 border-t-2 border-t-transparent"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 border-t-2 border-t-transparent"
            }`}
            title={panel.logGroupName || "New Tab"}
          >
            {/* Status dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.color}`}
              title={status.title}
            />

            {/* Tab label */}
            <span className="truncate">{label}</span>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removePanel(panelId);
              }}
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
      })}

      {/* Add panel button */}
      <button
        onClick={handleAddPanel}
        className={`flex items-center justify-center w-6 h-6 rounded text-sm transition-colors shrink-0 ${
          isDark
            ? "hover:bg-gray-700 text-gray-500 hover:text-gray-200"
            : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
        }`}
        title="New tab"
      >
        +
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout mode toggle */}
      <div
        className={`flex items-center rounded overflow-hidden border ${
          isDark ? "border-gray-600" : "border-gray-300"
        }`}
      >
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            onClick={() => setLayoutMode(opt.mode)}
            className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              layoutMode === opt.mode
                ? "bg-blue-600 text-white"
                : isDark
                  ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
            }`}
            title={opt.title}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Time sync toggle */}
      <button
        onClick={() => setTimeSyncEnabled(!timeSyncEnabled)}
        className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors border ${
          timeSyncEnabled
            ? "bg-blue-600 text-white border-blue-600"
            : isDark
              ? "text-gray-400 hover:text-gray-200 border-gray-600 hover:bg-gray-700"
              : "text-gray-500 hover:text-gray-800 border-gray-300 hover:bg-gray-200"
        }`}
        title={
          timeSyncEnabled
            ? "Time sync enabled — time range changes apply to all panels"
            : "Time sync disabled — each panel has independent time ranges"
        }
      >
        Sync
      </button>
    </div>
  );
}
