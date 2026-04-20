import { useEffect, useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke as directInvoke } from "@tauri-apps/api/core";
import { invoke } from "./demo/demoInvoke";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { PanelContainer } from "./components/PanelContainer";
import { SettingsDialog } from "./components/SettingsDialog";
import { AboutDialog } from "./components/AboutDialog";
import { UpdateDialog, UpdateInfo } from "./components/UpdateDialog";
import { useConnectionStore } from "./stores/connectionStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useGroupStore, initializeGroups } from "./stores/groupStore";
import type { WorkspaceConfig } from "./types/workspace";
import {
  subscribeSettingsChanged,
  flushPendingSettingsWrites,
} from "./stores/settingsStore";
import type {
  LiveTailEventPayload,
  LiveTailErrorPayload,
  LiveTailEndedPayload,
  LogsProgressPayload,
  LogsTruncatedPayload,
} from "./types";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useSettingsStore, getLogLevelCssVars } from "./stores/settingsStore";
import { useDemoStore } from "./demo/demoStore";
import { useSystemTheme } from "./hooks/useSystemTheme";
import "./App.css";

interface ToastProps {
  message: string;
  isDark: boolean;
  onDismiss: () => void;
}

function Toast({ message, isDark, onDismiss }: ToastProps) {
  return (
    <div
      className={`absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
        isDark
          ? "bg-gray-700 text-gray-100 border border-gray-600"
          : "bg-white text-gray-800 border border-gray-300"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className={`ml-2 ${
          isDark
            ? "text-gray-400 hover:text-gray-200"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        &#x2715;
      </button>
    </div>
  );
}

// Track whether groups have been initialized (survives re-renders, not HMR)
let groupsInitialized = false;

function App() {
  // Initialize group panels in workspaceStore synchronously on first render.
  // Uses module-level flag so it runs exactly once, even in StrictMode.
  if (!groupsInitialized) {
    initializeGroups();
    groupsInitialized = true;
  }

  const {
    initializeAws,
    refreshConnection,
    isConnected,
    isConnecting,
    connectionError,
    awsInfo,
    setSessionExpired,
  } = useConnectionStore();
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

  // Toast from active panel's tail manager — select primitives to avoid re-render loops
  const activePanelId = useGroupStore((s) => s.getActivePanelId());
  const tailToast = useWorkspaceStore(
    (s) => s.panels.get(activePanelId)?.tailToast ?? null,
  );

  const { update: availableUpdate, noUpdateCount, checkNow } = useUpdateCheck();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showUpToDate, setShowUpToDate] = useState(false);

  // Show update dialog when update is available
  useEffect(() => {
    if (availableUpdate) {
      setShowUpdateDialog(true);
    }
  }, [availableUpdate]);

  // Show "up to date" toast when manual check finds no update
  useEffect(() => {
    if (noUpdateCount > 0) {
      setShowUpToDate(true);
      const timer = setTimeout(() => setShowUpToDate(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [noUpdateCount]);

  useEffect(() => {
    initializeAws();
    // Load available profiles
    invoke<string[]>("list_aws_profiles")
      .then((profiles) => setAvailableProfiles(profiles))
      .catch((err) => console.error("Failed to load profiles:", err));
  }, [initializeAws]);

  // Multi-process: subscribe to cross-process settings changes.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    subscribeSettingsChanged().then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Multi-process: block the window close long enough to flush pending
  // debounced settings writes and auto-save the bound workspace. We must
  // use `onCloseRequested` (not the generic `listen` API) because that's
  // the only path that lets us `preventDefault()` and call `win.close()`
  // explicitly after the async work finishes. Using `listen` here races
  // the close and silently drops writes made in the last ~300ms.
  useEffect(() => {
    const win = getCurrentWindow();
    let closing = false;
    const unlistenPromise = win.onCloseRequested(async (event) => {
      if (closing) return; // our own `win.close()` below re-fires the event
      closing = true;
      event.preventDefault();
      try {
        useWorkspaceStore.getState().autoSaveLoadedWorkspace();
      } catch (e) {
        console.warn("close: autoSaveLoadedWorkspace failed:", e);
      }
      try {
        await flushPendingSettingsWrites();
      } catch (e) {
        console.warn("close: flushPendingSettingsWrites failed:", e);
      }
      try {
        await win.close();
      } catch (e) {
        console.warn("close: win.close() failed:", e);
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Multi-process: update the window title when the active AWS profile
  // changes so multiple Loggy windows are distinguishable in cmd-tab / dock.
  useEffect(() => {
    const profile = awsInfo?.profile;
    const title = profile ? `Loggy — ${profile}` : "Loggy";
    getCurrentWindow()
      .setTitle(title)
      .catch((e) => console.warn("setTitle failed:", e));
  }, [awsInfo?.profile]);

  // Multi-process: if this process was spawned with LOGGY_LOAD_WORKSPACE, load
  // that saved workspace once AWS is connected.
  const [bootWorkspaceLoaded, setBootWorkspaceLoaded] = useState(false);
  useEffect(() => {
    if (bootWorkspaceLoaded || !isConnected) return;
    directInvoke<string | null>("get_boot_workspace")
      .then((id) => {
        if (typeof id !== "string" || id.length === 0) {
          setBootWorkspaceLoaded(true);
          return;
        }
        const { savedWorkspaces } = useSettingsStore.getState();
        const config = savedWorkspaces.find((w) => w.id === id) as
          | WorkspaceConfig
          | undefined;
        if (config) {
          // Boot path: bind for auto-save so the window's changes persist
          // back to the catalog entry on close.
          useWorkspaceStore
            .getState()
            .loadWorkspace(config, { bindForAutoSave: true });
          console.info(`[boot] loaded workspace ${config.name} (${id})`);
        } else {
          console.warn(
            `[boot] LOGGY_LOAD_WORKSPACE=${id} but no matching saved workspace`,
          );
        }
        setBootWorkspaceLoaded(true);
      })
      .catch((e) => {
        console.warn("get_boot_workspace failed:", e);
        setBootWorkspaceLoaded(true);
      });
  }, [isConnected, bootWorkspaceLoaded]);

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

    // Reset state on all panels if switching to a different profile
    if (isProfileChange) {
      const { panels, panelAction } = useWorkspaceStore.getState();
      for (const panelId of panels.keys()) {
        panelAction(panelId).resetState();
      }
    }

    try {
      await refreshConnection();
    } catch (err) {
      console.error("Failed to switch profile:", err);
    } finally {
      setIsChangingProfile(false);
    }
  };

  // Listen for menu events from Tauri and global backend events (skip when running outside the Tauri shell, e.g. Playwright E2E)
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

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

    // ─── Per-panel event routing ─────────────────────────────────────
    // Backend events now include panel_id; route to the correct panel.

    const unlistenTruncated = listen<LogsTruncatedPayload>(
      "logs-truncated",
      (event) => {
        const { panel_id, count, size_bytes, reason } = event.payload;
        // Only show truncation warning for the active panel
        const currentActive = useGroupStore.getState().getActivePanelId();
        if (panel_id === currentActive) {
          setTruncationWarning({
            count,
            sizeBytes: size_bytes,
            reason,
          });
          setTimeout(() => setTruncationWarning(null), 10000);
        }
      },
    );

    const unlistenProgress = listen<LogsProgressPayload>(
      "logs-progress",
      (event) => {
        const { panel_id, fetch_id, count, size_bytes } = event.payload;
        // Route progress to the correct panel
        const { panels, panelAction } = useWorkspaceStore.getState();
        const panel = panels.get(panel_id);
        if (panel && panel.currentFetchId === fetch_id) {
          panelAction(panel_id).setLoadingProgress(count, size_bytes);
        }
      },
    );

    // ─── Live tail event routing ─────────────────────────────────────
    // Single global listener per event type, dispatches by panel_id
    // to the correct panel's LiveTailManager.

    const unlistenTailEvent = listen<LiveTailEventPayload>(
      "live-tail-event",
      (event) => {
        const { panel_id } = event.payload;
        const { panels } = useWorkspaceStore.getState();
        const panel = panels.get(panel_id);
        if (panel?.tailManager) {
          panel.tailManager.onTailEvent(event.payload);
        } else {
          console.warn(
            `[App] Received live-tail-event for unknown/inactive panel: ${panel_id}`,
          );
        }
      },
    );

    const unlistenTailError = listen<LiveTailErrorPayload>(
      "live-tail-error",
      (event) => {
        const { panel_id } = event.payload;
        const { panels } = useWorkspaceStore.getState();
        const panel = panels.get(panel_id);
        if (panel?.tailManager) {
          panel.tailManager.onTailError(event.payload);
        } else {
          console.warn(
            `[App] Received live-tail-error for unknown/inactive panel: ${panel_id}`,
          );
        }
      },
    );

    const unlistenTailEnded = listen<LiveTailEndedPayload>(
      "live-tail-ended",
      (event) => {
        const { panel_id } = event.payload;
        const { panels } = useWorkspaceStore.getState();
        const panel = panels.get(panel_id);
        if (panel?.tailManager) {
          panel.tailManager
            .onTailEnded()
            .catch((e) =>
              console.error("[App] onTailEnded failed for panel", panel_id, e),
            );
        } else {
          console.warn(
            `[App] Received live-tail-ended for unknown/inactive panel: ${panel_id}`,
          );
        }
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
      const currentActive = useGroupStore.getState().getActivePanelId();
      const { panels, panelAction } = useWorkspaceStore.getState();
      const panel = panels.get(currentActive);
      if (panel?.isTailing) {
        panelAction(currentActive).clearLogs();
      }
    });
    const unlistenTheme = listen<string>("set-theme", (event) => {
      const newTheme = event.payload as "dark" | "light" | "system";
      setTheme(newTheme);
    });
    const unlistenCheckUpdates = listen("check-for-updates", () => {
      checkNow();
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
    const unlistenDemoMode = listen<boolean>("toggle-demo-mode", (event) => {
      const enabled = event.payload;
      // Stop all active tails before switching modes
      const { panels, panelAction } = useWorkspaceStore.getState();
      for (const [panelId, panel] of panels) {
        if (panel.isTailing) {
          panelAction(panelId).stopTail();
        }
      }
      useDemoStore.getState().setDemoMode(enabled);
      // Reset all panels
      for (const panelId of panels.keys()) {
        panelAction(panelId).resetState();
      }
      // Refresh profiles (demo wrapper returns ["demo"], real returns AWS profiles)
      invoke<string[]>("list_aws_profiles")
        .then((profiles) => setAvailableProfiles(profiles))
        .catch((err) => console.error("Failed to load profiles:", err));
      useConnectionStore.getState().initializeAws();
    });

    // Tab & pane management menu events
    const unlistenNewTab = listen("new-tab", () => {
      const { activeGroupId, addPanelToGroup } = useGroupStore.getState();
      addPanelToGroup(activeGroupId);
    });
    const unlistenCloseTab = listen("close-tab", () => {
      const store = useGroupStore.getState();
      const leaf = store.getLeaf(store.activeGroupId);
      if (leaf) {
        store.removePanelFromGroup(store.activeGroupId, leaf.activePanelId);
      }
    });
    const unlistenNextTab = listen("next-tab", () => {
      const store = useGroupStore.getState();
      const leaf = store.getLeaf(store.activeGroupId);
      if (leaf) {
        const ids = leaf.panelIds;
        const idx = ids.indexOf(leaf.activePanelId);
        if (idx < ids.length - 1) {
          store.setActiveGroupPanel(store.activeGroupId, ids[idx + 1]);
        } else if (ids.length > 1) {
          store.setActiveGroupPanel(store.activeGroupId, ids[0]);
        }
      }
    });
    const unlistenPrevTab = listen("prev-tab", () => {
      const store = useGroupStore.getState();
      const leaf = store.getLeaf(store.activeGroupId);
      if (leaf) {
        const ids = leaf.panelIds;
        const idx = ids.indexOf(leaf.activePanelId);
        if (idx > 0) {
          store.setActiveGroupPanel(store.activeGroupId, ids[idx - 1]);
        } else if (ids.length > 1) {
          store.setActiveGroupPanel(store.activeGroupId, ids[ids.length - 1]);
        }
      }
    });
    const unlistenSplitRight = listen("split-right", () => {
      const store = useGroupStore.getState();
      store.splitGroup(store.activeGroupId, "horizontal");
    });
    const unlistenSplitDown = listen("split-down", () => {
      const store = useGroupStore.getState();
      store.splitGroup(store.activeGroupId, "vertical");
    });
    const unlistenMergeTabs = listen("merge-tabs", () => {
      const store = useGroupStore.getState();
      store.toggleGroupMerged(store.activeGroupId);
    });
    const unlistenToggleTimeSync = listen("toggle-time-sync", () => {
      const store = useGroupStore.getState();
      store.setTimeSyncEnabled(!store.timeSyncEnabled);
    });
    const unlistenNewWindow = listen("new-window-requested", () => {
      directInvoke("open_new_window", { workspaceId: null }).catch(
        (err: unknown) => {
          console.error("open_new_window failed:", err);
          // TODO: replace with a tail-style status-bar toast once Loggy grows
          // a toast system. For now, `alert()` is a blocking modal, which is
          // rough UX but acceptable for this dev-only error path (spawning a
          // non-bundled binary). See TODOS.md "Multi-process follow-ups".
          const msg = typeof err === "string" ? err : String(err);
          alert(`Could not open new window:\n\n${msg}`);
        },
      );
    });

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenAbout.then((fn) => fn());
      unlistenRefresh.then((fn) => fn());
      unlistenTruncated.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenTailEvent.then((fn) => fn());
      unlistenTailError.then((fn) => fn());
      unlistenTailEnded.then((fn) => fn());
      unlistenDebug.then((fn) => fn());
      unlistenSessionRefreshed.then((fn) => fn());
      unlistenSessionExpired.then((fn) => fn());
      unlistenClear.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
      unlistenCheckUpdates.then((fn) => fn());
      unlistenFind.then((fn) => fn());
      unlistenDemoMode.then((fn) => fn());
      unlistenNewTab.then((fn) => fn());
      unlistenCloseTab.then((fn) => fn());
      unlistenNextTab.then((fn) => fn());
      unlistenPrevTab.then((fn) => fn());
      unlistenSplitRight.then((fn) => fn());
      unlistenSplitDown.then((fn) => fn());
      unlistenMergeTabs.then((fn) => fn());
      unlistenToggleTimeSync.then((fn) => fn());
      unlistenNewWindow.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand store actions are stable refs; register listeners once to prevent race conditions on re-render
  }, []);

  // Handle keyboard shortcuts (fallback for non-menu shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to clear correlation highlight (when no other dialog is open)
      if (e.key === "Escape") {
        const { correlationHighlight, clearCorrelation } =
          useWorkspaceStore.getState();
        if (correlationHighlight) {
          clearCorrelation();
          // Don't prevent default — let other Escape handlers also fire
        }
      }

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
        // CMD-K (or Ctrl-K) to clear logs (only during live tail)
        if (e.key === "k") {
          e.preventDefault();
          const currentActive = useGroupStore.getState().getActivePanelId();
          const { panels, panelAction } = useWorkspaceStore.getState();
          const panel = panels.get(currentActive);
          if (panel?.isTailing) {
            panelAction(currentActive).clearLogs();
          }
        }
        // CMD-\ to split horizontal (VS Code convention, no menu accelerator)
        if (e.key === "\\" && !e.shiftKey) {
          e.preventDefault();
          const store = useGroupStore.getState();
          store.splitGroup(store.activeGroupId, "horizontal");
        }
        // CMD-1 through CMD-9 to jump to tab by index in active group
        if (e.key >= "1" && e.key <= "9" && !e.shiftKey) {
          e.preventDefault();
          const store = useGroupStore.getState();
          const leaf = store.getLeaf(store.activeGroupId);
          if (leaf) {
            const targetIdx = parseInt(e.key) - 1;
            if (targetIdx < leaf.panelIds.length) {
              store.setActiveGroupPanel(
                store.activeGroupId,
                leaf.panelIds[targetIdx],
              );
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettings, refreshConnection]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start dragging on left mouse button and if not clicking interactive elements
    if (e.buttons === 1 && "__TAURI_INTERNALS__" in window) {
      getCurrentWindow().startDragging();
    }
  }, []);

  // Get effective dark mode from theme setting
  const isDark = useSystemTheme();

  // Get CSS variables for log level colors (theme-adaptive via color-mix)
  const cssVars = getLogLevelCssVars(logLevels, isDark);

  return (
    <div
      className={`h-screen flex flex-col ${
        isDark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"
      }`}
      style={cssVars as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dialogs */}
      <SettingsDialog />
      <AboutDialog isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <UpdateDialog
        isOpen={showUpdateDialog}
        onClose={() => setShowUpdateDialog(false)}
        update={availableUpdate as UpdateInfo | null}
      />

      {/* Header - with padding for macOS traffic lights */}
      <header
        className={`relative flex items-center gap-4 px-3 py-3 pl-25 border-b select-none ${
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
        }`}
        onMouseDown={handleDragStart}
      >
        {/* Profile selector - always visible */}
        <div
          className="flex items-center gap-2 text-sm relative z-10 ml-auto"
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
          className={`p-1.5 rounded transition-colors relative z-10 ${
            isDark
              ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
              : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
          }`}
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

      {/* Workspace tab bar (only visible with multiple panels) */}
      <WorkspaceBar />

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

      {/* Up to date toast */}
      {showUpToDate && (
        <Toast
          message="Loggy is up to date"
          isDark={isDark}
          onDismiss={() => setShowUpToDate(false)}
        />
      )}

      {/* Tail toast notification */}
      {tailToast && (
        <Toast
          message={tailToast}
          isDark={isDark}
          onDismiss={() =>
            useWorkspaceStore
              .getState()
              .panelAction(activePanelId)
              .setTailToast(null)
          }
        />
      )}

      {/* Connection error or panel container */}
      {connectionError && !isConnected ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            className={`text-center max-w-md px-6 py-8 rounded-lg ${
              isDark ? "bg-gray-800" : "bg-white shadow-lg"
            }`}
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
              className={`text-lg font-semibold mb-2 ${
                isDark ? "text-gray-100" : "text-gray-900"
              }`}
            >
              Connection Error
            </h2>
            <p
              className={`text-sm mb-4 select-text cursor-text ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {connectionError}
            </p>
            <p
              className={`text-xs ${
                isDark ? "text-gray-500" : "text-gray-500"
              }`}
            >
              Select a profile above to reconnect, or press{" "}
              <kbd
                className={`px-1.5 py-0.5 rounded text-xs ${
                  isDark ? "bg-gray-700" : "bg-gray-200"
                }`}
              >
                ⌘R
              </kbd>{" "}
              to retry
            </p>
          </div>
        </div>
      ) : (
        <PanelContainer />
      )}

      {/* Portal for DatePicker popups */}
      <div id="datepicker-portal" className={isDark ? "datepicker-dark" : ""} />
    </div>
  );
}

export default App;
