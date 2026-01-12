import { useEffect, useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { LogGroupSelector } from "./components/LogGroupSelector";
import { FilterBar } from "./components/FilterBar";
import { LogViewer } from "./components/LogViewer";
import { StatusBar } from "./components/StatusBar";
import { SettingsDialog } from "./components/SettingsDialog";
import { AboutDialog } from "./components/AboutDialog";
import { useLogStore } from "./stores/logStore";
import { useSettingsStore, getLogLevelCssVars } from "./stores/settingsStore";
import { useSystemTheme } from "./hooks/useSystemTheme";
import "./App.css";

function App() {
  const {
    initializeAws,
    refreshConnection,
    resetState,
    clearLogs,
    setLoadingProgress,
    setSessionExpired,
    isConnected,
    isConnecting,
    connectionError,
    awsInfo,
  } = useLogStore();
  const {
    theme,
    logLevels,
    openSettings,
    awsProfile,
    setAwsProfile,
    setTheme,
  } = useSettingsStore();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [truncationWarning, setTruncationWarning] = useState<{
    count: number;
    sizeBytes: number;
    reason: string;
  } | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<string[]>([
    "default",
  ]);
  const [isChangingProfile, setIsChangingProfile] = useState(false);

  useEffect(() => {
    initializeAws();
    // Load available profiles
    invoke<string[]>("list_aws_profiles")
      .then((profiles) => setAvailableProfiles(profiles))
      .catch((err) => console.error("Failed to load profiles:", err));
  }, [initializeAws]);

  // Sync theme menu checkmarks with persisted theme on startup and when theme changes
  useEffect(() => {
    invoke("sync_theme_menu", { theme }).catch((err) =>
      console.error("Failed to sync theme menu:", err),
    );
  }, [theme]);

  const handleProfileChange = async (newProfile: string) => {
    const profileValue = newProfile === "default" ? null : newProfile;
    const currentProfile = awsProfile ?? awsInfo?.profile ?? "default";
    const isProfileChange = newProfile !== currentProfile;

    setIsChangingProfile(true);
    setAwsProfile(profileValue);

    // Reset state if switching to a different profile
    if (isProfileChange) {
      resetState();
    }

    try {
      await refreshConnection();
    } catch (err) {
      console.error("Failed to switch profile:", err);
    } finally {
      setIsChangingProfile(false);
    }
  };

  // Listen for menu events from Tauri
  useEffect(() => {
    const unlistenSettings = listen("open-settings", () => {
      openSettings();
    });
    const unlistenAbout = listen("open-about", () => {
      setIsAboutOpen(true);
    });
    const unlistenRefresh = listen("refresh-logs", () => {
      // Always refresh connection (picks up credential changes) and re-query logs
      refreshConnection();
    });
    const unlistenTruncated = listen<{
      count: number;
      size_bytes: number;
      reason: string;
    }>("logs-truncated", (event) => {
      setTruncationWarning({
        count: event.payload.count,
        sizeBytes: event.payload.size_bytes,
        reason: event.payload.reason,
      });
      // Auto-dismiss after 10 seconds
      setTimeout(() => setTruncationWarning(null), 10000);
    });
    const unlistenProgress = listen<{ count: number; size_bytes: number }>(
      "logs-progress",
      (event) => {
        setLoadingProgress(event.payload.count, event.payload.size_bytes);
      },
    );
    const unlistenDebug = listen<string>("debug-log", (event) => {
      console.log("[Backend]", event.payload);
    });
    const unlistenSessionRefreshed = listen("aws-session-refreshed", () => {
      // Automatically refresh connection when SSO login is successful
      console.log("SSO session refreshed, reconnecting...");
      refreshConnection();
    });
    const unlistenSessionExpired = listen("aws-session-expired", () => {
      console.log("AWS session expired");
      setSessionExpired();
    });
    const unlistenClear = listen("clear-logs", () => {
      clearLogs();
    });
    const unlistenTheme = listen<string>("set-theme", (event) => {
      const newTheme = event.payload as "dark" | "light" | "system";
      setTheme(newTheme);
    });
    const unlistenFind = listen("open-find", () => {
      // Dispatch synthetic keyboard event to trigger find bar in LogViewer
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          metaKey: true,
          bubbles: true,
        }),
      );
    });

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenAbout.then((fn) => fn());
      unlistenRefresh.then((fn) => fn());
      unlistenTruncated.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenDebug.then((fn) => fn());
      unlistenSessionRefreshed.then((fn) => fn());
      unlistenSessionExpired.then((fn) => fn());
      unlistenClear.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
      unlistenFind.then((fn) => fn());
    };
  }, [
    openSettings,
    refreshConnection,
    setLoadingProgress,
    setSessionExpired,
    clearLogs,
    setTheme,
  ]);

  // Handle keyboard shortcuts (fallback for non-menu shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // CMD-, (or Ctrl-,) to open settings
        if (e.key === ",") {
          e.preventDefault();
          openSettings();
        }
        // CMD-R (or Ctrl-R) to refresh - prevent default browser reload
        if (e.key === "r") {
          e.preventDefault();
          // Always refresh connection (picks up credential changes) and re-query logs
          refreshConnection();
        }
        // CMD-K (or Ctrl-K) to clear logs
        if (e.key === "k") {
          e.preventDefault();
          clearLogs();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettings, refreshConnection, clearLogs]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start dragging on left mouse button and if not clicking interactive elements
    if (e.buttons === 1) {
      getCurrentWindow().startDragging();
    }
  }, []);

  // Get effective dark mode from theme setting
  const isDark = useSystemTheme();

  // Get CSS variables for log level colors (theme-adaptive via color-mix)
  const cssVars = getLogLevelCssVars(logLevels, isDark);

  return (
    <div
      className={`h-screen flex flex-col ${isDark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"}`}
      style={cssVars as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
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
        {/* Profile selector - always visible */}
        <div
          className="flex items-center gap-2 text-sm relative z-10"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Connection status indicator */}
          {isConnecting ? (
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          ) : isConnected ? (
            <span className="w-2 h-2 bg-green-400 rounded-full" />
          ) : (
            <span className="w-2 h-2 bg-red-400 rounded-full" />
          )}

          {/* Profile dropdown */}
          <select
            value={awsProfile ?? awsInfo?.profile ?? "default"}
            onChange={(e) => handleProfileChange(e.target.value)}
            disabled={isChangingProfile || isConnecting}
            className={`px-2 py-1 rounded text-sm cursor-pointer disabled:opacity-50 ${
              isDark
                ? "bg-gray-700 border-gray-600"
                : "bg-gray-200 border-gray-300"
            } ${
              isConnected
                ? isDark
                  ? "text-green-400"
                  : "text-green-600"
                : connectionError
                  ? "text-red-400"
                  : "text-yellow-400"
            } border`}
          >
            {availableProfiles.map((profile) => (
              <option key={profile} value={profile}>
                {profile}
              </option>
            ))}
          </select>

          {/* Region */}
          {awsInfo?.region && (
            <span className={`${isDark ? "text-gray-500" : "text-gray-600"}`}>
              ({awsInfo.region})
            </span>
          )}

          {/* Status text */}
          {(isChangingProfile || isConnecting) && (
            <span className="text-yellow-400 text-xs">
              {isChangingProfile ? "Switching..." : "Connecting..."}
            </span>
          )}
        </div>
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

      {/* Truncation warning */}
      {truncationWarning && (
        <div className="flex items-center justify-between px-3 py-2 bg-yellow-600 text-yellow-100 text-sm">
          <span>
            Results limited to {truncationWarning.count.toLocaleString()} logs (
            {(truncationWarning.sizeBytes / 1024 / 1024).toFixed(1)} MB) due to{" "}
            {truncationWarning.reason === "count" ? "count" : "size"} limit.
            Narrow your time range for complete results.
          </span>
          <button
            onClick={() => setTruncationWarning(null)}
            className="ml-4 px-2 py-0.5 rounded bg-yellow-700 hover:bg-yellow-800 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Log viewer or connection error */}
      {connectionError && !isConnected ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className={`text-center max-w-md px-6 py-8 rounded-lg ${isDark ? "bg-gray-800" : "bg-white shadow-lg"}`}
          >
            <div className="text-red-400 mb-4">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2
              className={`text-lg font-semibold mb-2 ${isDark ? "text-gray-100" : "text-gray-900"}`}
            >
              Connection Error
            </h2>
            <p
              className={`text-sm mb-4 select-text cursor-text ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              {connectionError}
            </p>
            <p
              className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
            >
              Select a profile above to reconnect, or press{" "}
              <kbd
                className={`px-1.5 py-0.5 rounded text-xs ${isDark ? "bg-gray-700" : "bg-gray-200"}`}
              >
                ⌘R
              </kbd>{" "}
              to retry
            </p>
          </div>
        </div>
      ) : (
        <LogViewer />
      )}

      {/* Status bar */}
      <StatusBar />

      {/* Portal for DatePicker popups */}
      <div id="datepicker-portal" className={isDark ? "datepicker-dark" : ""} />
    </div>
  );
}

export default App;
