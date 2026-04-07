import { create } from "zustand";
import { invoke } from "../demo/demoInvoke";
import type { LogGroup } from "../types";
import type { AwsConnectionInfo } from "../types/workspace";
import { useSettingsStore } from "./settingsStore";

interface ConnectionStore {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  awsInfo: AwsConnectionInfo | null;

  // Log groups (shared across all panels)
  logGroups: LogGroup[];

  // Actions
  initializeAws: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  loadLogGroups: () => Promise<void>;
  setSessionExpired: () => void;
  setConnectionFailed: (message: string) => void;
}

// One-shot auto-refresh after connection failure (avoid multiple timers)
let connectionFailedAutoRefreshScheduled = false;

// Callback for post-connection initialization (set by workspaceStore)
let onConnectionEstablished: (() => void) | null = null;

/** Register a callback to run after successful AWS connection */
export function setOnConnectionEstablished(cb: () => void): void {
  onConnectionEstablished = cb;
}

// Callback for post-refresh actions (set by workspaceStore)
let onConnectionRefreshed: (() => void) | null = null;

/** Register a callback to run after successful connection refresh */
export function setOnConnectionRefreshed(cb: () => void): void {
  onConnectionRefreshed = cb;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  awsInfo: null,
  logGroups: [],

  initializeAws: async () => {
    set({ isConnecting: true, connectionError: null });
    try {
      const { awsProfile } = useSettingsStore.getState();
      const awsInfo = await invoke<AwsConnectionInfo>("init_aws_client", {
        profile: awsProfile,
      });
      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null,
        awsInfo,
      });
      await get().loadLogGroups();
      onConnectionEstablished?.();
    } catch (error) {
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: error instanceof Error ? error.message : String(error),
        awsInfo: null,
      });
    }
  },

  refreshConnection: async () => {
    set({ isConnecting: true, connectionError: null });
    try {
      const { awsProfile } = useSettingsStore.getState();
      const awsInfo = await invoke<AwsConnectionInfo>("reconnect_aws", {
        profile: awsProfile,
      });
      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null,
        awsInfo,
      });
      await get().loadLogGroups();
      onConnectionRefreshed?.();
    } catch (error) {
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: error instanceof Error ? error.message : String(error),
        awsInfo: null,
      });
    }
  },

  loadLogGroups: async () => {
    try {
      const groups = await invoke<LogGroup[]>("list_log_groups");
      set({ logGroups: groups });
    } catch (error) {
      // Don't set connectionError — this is a non-fatal error
      console.error(
        "[ConnectionStore] Failed to load log groups:",
        error instanceof Error ? error.message : String(error),
      );
    }
  },

  setSessionExpired: () => {
    set({
      isConnected: false,
      connectionError:
        "Your AWS session has expired. Please complete SSO login in your browser.",
    });
  },

  setConnectionFailed: (message: string) => {
    set({
      isConnected: false,
      connectionError: message,
    });
    if (!connectionFailedAutoRefreshScheduled) {
      connectionFailedAutoRefreshScheduled = true;
      setTimeout(() => {
        connectionFailedAutoRefreshScheduled = false;
        get().refreshConnection();
      }, 2000);
    }
  },
}));
