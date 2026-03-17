import { useWorkspaceStore, usePanelIds } from "../stores/workspaceStore";
import { PanelView } from "./PanelView";

export function PanelContainer() {
  const panelIds = usePanelIds();
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);

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
