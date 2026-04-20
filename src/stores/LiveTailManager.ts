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
// Overlap window when switching from stream to poll to avoid event gaps at cutover.
const FALLBACK_OVERLAP_MS = 2000;

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
  // Generation counter guards start/stop races: if startGen advances while
  // an invoke is in flight, the resolved invoke is stale and we abort it.
  private startGen = 0;

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

    // Null ARN means the log group isn't resolved yet — stay idle until
    // the caller re-invokes start() once the ARN is available.
    if (!this.logGroupArn) {
      return;
    }

    await this.startStream();
  }

  stop(): void {
    this.startGen++;
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

    // Track last clean timestamp for fallback cutover
    if (logs.length > 0) {
      this.lastCleanTimestamp = Math.max(...logs.map((l) => l.timestamp));
    }

    if (logs.length > 0) {
      this.onNewLogs(logs);
    }
  }

  /** Handle a live tail error dispatched from App.tsx's global listener. */
  onTailError(payload: LiveTailErrorPayload): void {
    console.error(
      "[LiveTailManager] Stream error:",
      payload.kind,
      payload.message,
    );

    if (payload.kind === "sessionLimitExceeded") {
      // Bump startGen so any in-flight startStream() invoke won't overwrite the fallback.
      this.startGen++;
      this.startPolling(null);
      this.onTransportChange("poll");
      this.onToast(
        "AWS session limit reached \u2014 using polling. Close other Loggy windows to restore streaming.",
      );
    } else if (payload.kind === "permissionDenied") {
      // Surface to UI; do not silently fall back — user action required.
      this.onError(new Error(`Permission denied: ${payload.message}`));
      this.stop();
    } else {
      // StreamError or Other: fall back to polling.
      // Bump startGen so any in-flight startStream() invoke won't overwrite the fallback.
      this.startGen++;
      this.startPolling(null);
      this.onTransportChange("poll");
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  /** Handle a live tail ended event dispatched from App.tsx's global listener. */
  onTailEnded(): Promise<void> {
    console.log("[LiveTailManager] Stream ended (timeout), reconnecting");
    return this.handleStreamEnded();
  }

  private async startStream(): Promise<void> {
    const myGen = this.startGen;

    // Start the stream on the backend (uses ARN — required by StartLiveTail API)
    try {
      await invoke("start_live_tail", {
        panelId: this.panelId,
        logGroupArn: this.logGroupArn,
        filterPattern: null,
      });
    } catch (e) {
      // invoke() itself errored (IPC failure, not a live-tail-error event)
      if (this.startGen !== myGen) return;
      console.error("[LiveTailManager] start_live_tail invoke failed:", e);
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
      return;
    }

    // If stop() was called while invoke was in-flight, abort the backend session.
    if (this.startGen !== myGen) {
      invoke("stop_live_tail", { panelId: this.panelId }).catch((e) =>
        console.debug("[LiveTailManager] stale stop_live_tail:", e),
      );
      return;
    }

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
      fromTimestamp ?? undefined,
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

    // Use a 2s overlap window so dedupe in panelSlice can handle any same-ms events.
    const replayFrom = this.lastCleanTimestamp
      ? this.lastCleanTimestamp - FALLBACK_OVERLAP_MS
      : null;

    this.startPolling(replayFrom);
    this.onToast(
      "High log volume \u2014 switched to polling for complete results",
    );
  }

  private async handleStreamEnded(): Promise<void> {
    // 3-hour timeout — auto-reconnect
    try {
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch (e) {
      console.error("[LiveTailManager] Stream reconnect failed:", e);
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
