import { useWorkspaceStore, usePanelIds } from "../stores/workspaceStore";
import { PanelView } from "./PanelView";

const MAX_SPLIT_PANELS = 3;

export function PanelContainer() {
  const panelIds = usePanelIds();
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  const layoutMode = useWorkspaceStore((s) => s.layoutMode);

  if (layoutMode === "split-horizontal" || layoutMode === "split-vertical") {
    const visibleIds = panelIds.slice(0, MAX_SPLIT_PANELS);
    const hiddenIds = panelIds.slice(MAX_SPLIT_PANELS);
    const isHorizontal = layoutMode === "split-horizontal";

    return (
      <div
        className={`flex flex-1 min-h-0 ${isHorizontal ? "flex-row" : "flex-col"}`}
      >
        {visibleIds.map((panelId, idx) => (
          <div
            key={panelId}
            className={`flex flex-col min-h-0 min-w-0 ${
              isHorizontal ? "flex-1" : "flex-1"
            } ${
              idx < visibleIds.length - 1
                ? isHorizontal
                  ? "border-r border-gray-700"
                  : "border-b border-gray-700"
                : ""
            }`}
            onClick={() => useWorkspaceStore.getState().setActivePanel(panelId)}
          >
            <PanelView panelId={panelId} />
          </div>
        ))}
        {/* Render hidden panels off-screen to preserve state */}
        {hiddenIds.map((panelId) => (
          <div key={panelId} className="hidden">
            <PanelView panelId={panelId} />
          </div>
        ))}
      </div>
    );
  }

  // Default: tabs layout — show active, hide rest with CSS
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {panelIds.map((panelId) => (
        <div
          key={panelId}
          className={`flex flex-col flex-1 min-h-0 ${
            panelId === activePanelId ? "" : "hidden"
          }`}
        >
          <PanelView panelId={panelId} />
        </div>
      ))}
    </div>
  );
}
