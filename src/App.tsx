import { useEffect, useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { LogGroupSelector } from "./components/LogGroupSelector";
import { FilterBar } from "./components/FilterBar";
import { LogViewer } from "./components/LogViewer";
import { SettingsDialog } from "./components/SettingsDialog";
import { AboutDialog } from "./components/AboutDialog";
import { useLogStore } from "./stores/logStore";
import { useSettingsStore, getLogLevelCssVars } from "./stores/settingsStore";
import LoggyName from "./assets/loggy-name.png";
import LoggyMascot from "./assets/loggy-mascot.png";
import "./App.css";

function App() {
  const { initializeAws, isConnected, isConnecting, connectionError, awsInfo } =
    useLogStore();
  const { theme, logLevels, openSettings } = useSettingsStore();
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  useEffect(() => {
    initializeAws();
  }, [initializeAws]);

  // Listen for menu events from Tauri
  useEffect(() => {
    const unlistenSettings = listen("open-settings", () => {
      openSettings();
    });
    const unlistenAbout = listen("open-about", () => {
      setIsAboutOpen(true);
    });

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenAbout.then((fn) => fn());
    };
  }, [openSettings]);

  // Handle CMD-, (or Ctrl-,) to open settings (fallback for keyboard shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettings]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start dragging on left mouse button and if not clicking interactive elements
    if (e.buttons === 1) {
      getCurrentWindow().startDragging();
    }
  }, []);

  // Get CSS variables for log level colors
  const cssVars = getLogLevelCssVars(logLevels);

  // Track system preference for theme
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Compute effective dark mode
  const isDark = theme === "system" ? systemPrefersDark : theme === "dark";

  return (
    <div
      className={`h-screen flex flex-col ${isDark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"}`}
      style={cssVars as React.CSSProperties}
    >
      {/* Dialogs */}
      <SettingsDialog />
      <AboutDialog isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      {/* Header - with padding for macOS traffic lights */}
      <header
        className={`relative flex items-center gap-4 px-3 py-3 pl-25 border-b select-none ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"}`}
        onMouseDown={handleDragStart}
      >
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
                <span
                  className={`ml-1 ${isDark ? "text-gray-500" : "text-gray-600"}`}
                >
                  ({awsInfo.region})
                </span>
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
                  className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
                >
                  Retry
                </button>
              </>
            )}
          </div>
        )}
        {/* Settings button */}
        <button
          onClick={openSettings}
          onMouseDown={(e) => e.stopPropagation()}
          className={`p-1.5 rounded transition-colors relative z-10 ${isDark ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"}`}
          title="Settings (Cmd-,)"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </header>

      {/* Filter bar */}
      <FilterBar />

      {/* Log viewer */}
      <LogViewer />
    </div>
  );
}

export default App;
