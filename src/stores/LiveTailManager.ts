import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TailPoller } from "./TailPoller";
import type { TailTransport } from "./TailTransport";
import type {
  LogEvent,
  LiveTailEventPayload,
  LiveTailErrorPayload,
} from "../types";

export type TransportType = "stream" | "poll";

const SAMPLING_THRESHOLD = 500;

export class LiveTailManager {
  private transport: TailTransport | null = null;
  private transportType: TransportType | null = null;
  private lastCleanTimestamp: number | null = null;
  private unlisteners: UnlistenFn[] = [];
  private logGroupName: string;
  private onNewLogs: (logs: LogEvent[]) => void;
  private onError: (error: unknown) => void;
  private onTransportChange: (type: TransportType) => void;
  private onToast: (message: string) => void;
  private getLastLogTimestamp: () => number | null;

  constructor(options: {
    logGroupName: string;
    onNewLogs: (logs: LogEvent[]) => void;
    onError: (error: unknown) => void;
    onTransportChange: (type: TransportType) => void;
    onToast: (message: string) => void;
    getLastLogTimestamp: () => number | null;
  }) {
    this.logGroupName = options.logGroupName;
    this.onNewLogs = options.onNewLogs;
    this.onError = options.onError;
    this.onTransportChange = options.onTransportChange;
    this.onToast = options.onToast;
    this.getLastLogTimestamp = options.getLastLogTimestamp;
  }

  async start(): Promise<void> {
    // Try streaming first, fall back to polling
    try {
      await this.startStream();
    } catch {
      console.log(
        "[LiveTailManager] Streaming unavailable, falling back to polling",
      );
      this.startPolling(null);
    }
  }

  stop(): void {
    if (this.transportType === "stream") {
      invoke("stop_live_tail").catch((e) =>
        console.debug("[LiveTailManager] stop_live_tail:", e),
      );
    }
    if (this.transport) {
      this.transport.stop();
    }
    this.cleanup();
  }

  isActive(): boolean {
    return this.transport?.isActive() ?? false;
  }

  getTransportType(): TransportType | null {
    return this.transportType;
  }

  resetStartTimestamp(): void {
    this.transport?.resetStartTimestamp();
  }

  private async startStream(): Promise<void> {
    // Set up event listeners before starting the stream
    const unlistenEvent = await listen<LiveTailEventPayload>(
      "live-tail-event",
      (event) => {
        const { logs, count } = event.payload;

        // Sampling detection: if we receive exactly 500 events, sampling is likely
        if (count >= SAMPLING_THRESHOLD) {
          console.log(
            "[LiveTailManager] Sampling detected (count:",
            count,
            "), switching to polling",
          );
          this.switchToPolling();
          return;
        }

        // Track last clean timestamp for sampling fallback
        if (logs.length > 0) {
          this.lastCleanTimestamp = Math.max(...logs.map((l) => l.timestamp));
        }

        if (logs.length > 0) {
          this.onNewLogs(logs);
        }
      },
    );

    const unlistenError = await listen<LiveTailErrorPayload>(
      "live-tail-error",
      (event) => {
        console.error("[LiveTailManager] Stream error:", event.payload.message);
        this.handleStreamError(event.payload.message);
      },
    );

    const unlistenEnded = await listen<Record<string, never>>(
      "live-tail-ended",
      () => {
        console.log("[LiveTailManager] Stream ended (timeout), reconnecting");
        this.handleStreamEnded();
      },
    );

    this.unlisteners = [unlistenEvent, unlistenError, unlistenEnded];

    // Start the stream on the backend
    await invoke("start_live_tail", {
      logGroupName: this.logGroupName,
      filterPattern: null,
    });

    // Create a minimal transport wrapper for stream (start/stop/isActive/resetStartTimestamp)
    this.transport = {
      start: () => {},
      stop: () => {},
      isActive: () => true,
      resetStartTimestamp: () => {},
    };
    this.transportType = "stream";
    this.onTransportChange("stream");
  }

  private startPolling(fromTimestamp: number | null): void {
    // Clean up any existing stream listeners
    this.cleanupListeners();

    const getTimestamp = fromTimestamp
      ? (() => {
          let used = false;
          return () => {
            if (!used) {
              used = true;
              return fromTimestamp;
            }
            return this.getLastLogTimestamp();
          };
        })()
      : this.getLastLogTimestamp;

    const poller = new TailPoller(
      this.logGroupName,
      this.onNewLogs,
      this.onError,
      getTimestamp,
    );
    poller.start();

    this.transport = poller;
    this.transportType = "poll";
    this.onTransportChange("poll");
  }

  private async switchToPolling(): Promise<void> {
    // Stop the stream
    invoke("stop_live_tail").catch((e) =>
      console.debug("[LiveTailManager] stop_live_tail:", e),
    );

    // Start polling from last clean timestamp to backfill sampled gaps
    const replayFrom = this.lastCleanTimestamp
      ? this.lastCleanTimestamp + 1
      : null;

    this.startPolling(replayFrom);
    this.onToast(
      "High log volume \u2014 switched to polling for complete results",
    );
  }

  private async handleStreamError(message: string): Promise<void> {
    // Check if SSO expired
    const isSsoError =
      message.toLowerCase().includes("expired") ||
      message.toLowerCase().includes("sso") ||
      message.toLowerCase().includes("token");

    if (isSsoError) {
      // Let the existing SSO refresh flow handle it
      this.onError(new Error(message));
      this.stop();
      return;
    }

    // Try to reconnect streaming
    try {
      this.cleanupListeners();
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch {
      // Fall back to polling
      console.log(
        "[LiveTailManager] Reconnect failed, falling back to polling",
      );
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private async handleStreamEnded(): Promise<void> {
    // 3-hour timeout — auto-reconnect
    try {
      this.cleanupListeners();
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch {
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private cleanupListeners(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }

  private cleanup(): void {
    this.cleanupListeners();
    this.transport = null;
    this.transportType = null;
    this.lastCleanTimestamp = null;
  }
}
