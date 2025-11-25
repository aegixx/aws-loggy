import { useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogGroupSelector } from "./components/LogGroupSelector";
import { FilterBar } from "./components/FilterBar";
import { LogViewer } from "./components/LogViewer";
import { useLogStore } from "./stores/logStore";
import LoggyMascot from "./assets/loggy-name-only.png";
import "./App.css";

function App() {
  const { initializeAws, isConnected, isConnecting, connectionError, awsInfo } =
    useLogStore();

  useEffect(() => {
    initializeAws();
  }, [initializeAws]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start dragging on left mouse button and if not clicking interactive elements
    if (e.buttons === 1) {
      getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header - with padding for macOS traffic lights */}
      <header
        className="relative flex items-center gap-4 px-3 pl-25 bg-gray-800 border-b border-gray-700 select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 relative z-10">
          <img src={LoggyMascot} alt="Loggy" className="w-30" draggable={false} />
        </div>
        <div
          className="flex-1 relative z-10"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <LogGroupSelector />
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 text-sm text-green-400 relative z-10">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <span>
              {awsInfo?.profile || "default"}
              {awsInfo?.region && (
                <span className="text-gray-500 ml-1">({awsInfo.region})</span>
              )}
            </span>
          </div>
        )}
        {(connectionError || isConnecting) && (
          <div
            className="flex items-center gap-2 text-sm relative z-10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {isConnecting ? (
              <>
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-yellow-400">Connecting...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 bg-red-400 rounded-full" />
                <span className="text-red-400">Disconnected</span>
                <button
                  onClick={() => initializeAws()}
                  className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* Filter bar */}
      <FilterBar />

      {/* Log viewer */}
      <LogViewer />
    </div>
  );
}

export default App;
