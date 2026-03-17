import { invoke } from "../demo/demoInvoke";
import { TailPoller } from "./TailPoller";
import { DemoTailTransport } from "../demo/DemoTailTransport";
import { getDemoMode } from "../demo/demoStore";
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
  private panelId: string;
  private logGroupName: string;
  private logGroupArn: string | null;
  private onNewLogs: (logs: LogEvent[]) => void;
  private onError: (error: unknown) => void;
  private onTransportChange: (type: TransportType) => void;
  private onToast: (message: string) => void;
  private getLastLogTimestamp: () => number | null;

  constructor(options: {
    panelId: string;
    logGroupName: string;
    logGroupArn: string | null;
    onNewLogs: (logs: LogEvent[]) => void;
    onError: (error: unknown) => void;
    onTransportChange: (type: TransportType) => void;
    onToast: (message: string) => void;
    getLastLogTimestamp: () => number | null;
  }) {
    this.panelId = options.panelId;
    this.logGroupName = options.logGroupName;
    this.logGroupArn = options.logGroupArn;
    this.onNewLogs = options.onNewLogs;
    this.onError = options.onError;
    this.onTransportChange = options.onTransportChange;
    this.onToast = options.onToast;
    this.getLastLogTimestamp = options.getLastLogTimestamp;
  }

  async start(): Promise<void> {
    // In demo mode, use the demo transport instead of real streaming/polling
    if (getDemoMode()) {
      const demo = new DemoTailTransport(this.logGroupName, this.onNewLogs);
      demo.start();
      this.transport = demo;
      this.transportType = "stream";
      this.onTransportChange("stream");
      return;
    }

    // Streaming requires an ARN — fall back to polling if unavailable
    if (!this.logGroupArn) {
      console.log("[LiveTailManager] No ARN available, using polling");
      this.startPolling(null);
    } else {
      try {
        await this.startStream();
      } catch {
        console.log(
          "[LiveTailManager] Streaming unavailable, falling back to polling",
        );
        this.startPolling(null);
      }
    }
  }

  stop(): void {
    if (this.transportType === "stream") {
      invoke("stop_live_tail", { panelId: this.panelId }).catch((e) =>
        console.debug("[LiveTailManager] stop_live_tail:", e),
      );
    }
    if (this.transport) {
      this.transport.stop();
    }
    this.cleanup();
  }

  /** Get the panel ID this manager is associated with */
  getPanelId(): string {
    return this.panelId;
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

  /**
   * Handle a live tail event dispatched from App.tsx's global listener.
   * Called instead of per-instance listen() to support multi-panel routing.
   */
  onTailEvent(payload: LiveTailEventPayload): void {
    const { logs, count } = payload;

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
  }

  /** Handle a live tail error dispatched from App.tsx's global listener. */
  onTailError(payload: LiveTailErrorPayload): void {
    console.error("[LiveTailManager] Stream error:", payload.message);
    this.handleStreamError(payload.message);
  }

  /** Handle a live tail ended event dispatched from App.tsx's global listener. */
  onTailEnded(): void {
    console.log("[LiveTailManager] Stream ended (timeout), reconnecting");
    this.handleStreamEnded();
  }

  private async startStream(): Promise<void> {
    // Start the stream on the backend (uses ARN — required by StartLiveTail API)
    await invoke("start_live_tail", {
      panelId: this.panelId,
      logGroupArn: this.logGroupArn,
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
      this.panelId,
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
    invoke("stop_live_tail", { panelId: this.panelId }).catch((e) =>
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

  private handleStreamError(message: string): void {
    const lower = message.toLowerCase();
    const isConnectionOrCredentialError =
      lower.includes("expired") ||
      lower.includes("sso") ||
      lower.includes("token") ||
      lower.includes("credential") ||
      lower.includes("connection") ||
      lower.includes("connector") ||
      lower.includes("network") ||
      lower.includes("timeout") ||
      lower.includes("unable to connect");

    if (isConnectionOrCredentialError) {
      this.onError(new Error(message));
      this.stop();
    } else {
      // Fall back to polling — don't retry streaming (it just failed)
      console.log(
        "[LiveTailManager] Stream error, falling back to polling:",
        message,
      );
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private async handleStreamEnded(): Promise<void> {
    // 3-hour timeout — auto-reconnect
    try {
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch {
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private cleanup(): void {
    this.transport = null;
    this.transportType = null;
    this.lastCleanTimestamp = null;
  }
}
