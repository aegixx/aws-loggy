import { PanelContext } from "../contexts/PanelContext";
import { LogGroupSelector } from "./LogGroupSelector";
import { FilterBar } from "./FilterBar";
import { LogViewer } from "./LogViewer";
import { StatusBar } from "./StatusBar";

interface PanelViewProps {
  panelId: string;
}

export function PanelView({ panelId }: PanelViewProps) {
  return (
    <PanelContext.Provider value={panelId}>
      {/* Toolbar area: log group selector + filter bar */}
      <LogGroupSelector />
      <FilterBar />

      {/* Main area: log viewer + status bar */}
      <LogViewer />
      <StatusBar />
    </PanelContext.Provider>
  );
}
