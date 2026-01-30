import { invoke } from "@tauri-apps/api/core";
import type { LogEvent } from "../types";

/** Polling interval in milliseconds */
const POLL_INTERVAL_MS = 1000;

/**
 * Encapsulates live tail polling logic.
 * Uses recursive setTimeout to prevent poll queueing if requests take longer than interval.
 */
export class TailPoller {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private startTimestamp: number | null = null;
  private isPolling = false;

  constructor(
    private logGroupName: string,
    private onNewLogs: (logs: LogEvent[]) => void,
    private onError: (error: unknown) => void,
    private getLastLogTimestamp: () => number | null,
  ) {}

  /**
   * Start polling for new logs.
   * Uses recursive setTimeout to ensure polls don't queue up if requests are slow.
   */
  start(): void {
    if (this.isPolling) {
      console.warn("[TailPoller] Already polling, stopping first");
      this.stop();
    }

    console.log("[User Activity] Start live tail");

    // Track when tail started - used to filter out older logs
    this.startTimestamp = Date.now();
    this.isPolling = true;

    // Start the polling loop
    this.scheduleNextPoll();
  }

  /**
   * Stop polling and clean up.
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.isPolling) {
      console.log("[User Activity] Stop live tail");
    }
    this.isPolling = false;
    this.startTimestamp = null;
  }

  /**
   * Schedule the next poll after the interval.
   * Uses setTimeout instead of setInterval to prevent queueing.
   */
  private scheduleNextPoll(): void {
    if (!this.isPolling) return;

    this.timeoutId = setTimeout(async () => {
      await this.poll();
      // Schedule next poll only after current one completes
      this.scheduleNextPoll();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Reset the start timestamp to current time.
   * Used when clearing logs during an active tail.
   */
  resetStartTimestamp(): void {
    this.startTimestamp = Date.now();
  }

  /**
   * Check if currently polling.
   */
  isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Poll for new logs and invoke callback.
   * Checks if poller is still active after async operations to prevent
   * callbacks on stopped/unmounted state.
   */
  private async poll(): Promise<void> {
    try {
      const lastTimestamp = this.calculatePollTimestamp();

      console.log("[Backend Activity] Polling from timestamp:", lastTimestamp);

      const logs = await invoke<LogEvent[]>("fetch_logs", {
        logGroupName: this.logGroupName,
        startTime: lastTimestamp,
        endTime: null,
        filterPattern: null,
        maxCount: null,
        maxSizeMb: null,
      });

      // Check if we were stopped during the async operation
      if (!this.isActive()) {
        console.log("[Backend Activity] Poll cancelled - poller stopped");
        return;
      }

      if (logs.length > 0) {
        // Filter out logs older than when the tail started (handles lookback window)
        const filteredByTime = this.startTimestamp
          ? logs.filter((log) => log.timestamp >= this.startTimestamp!)
          : logs;

        if (filteredByTime.length === 0) {
          return;
        }

        // Once we've received logs past our start timestamp, we've caught up - disable filter for performance
        if (this.startTimestamp) {
          console.log(
            "[Backend Activity] Caught up to tail start, disabling time filter",
          );
          this.startTimestamp = null;
        }

        console.log(
          "[Backend Activity] Fetched",
          filteredByTime.length,
          "new logs",
        );

        // Return raw logs - let the store handle merging and parsing
        this.onNewLogs(filteredByTime);
      }
    } catch (error) {
      // Only report errors if we're still active
      if (this.isActive()) {
        console.error("[Backend Activity] Tail fetch error:", error);
        this.onError(error);
      }
    }
  }

  /**
   * Calculate the timestamp to poll from.
   * Returns last log timestamp if available, otherwise start timestamp with lookback.
   */
  private calculatePollTimestamp(): number {
    const lastTimestamp = this.getLastLogTimestamp();
    if (lastTimestamp) {
      // Add 1ms to exclude logs we already have (CloudWatch uses >= for startTime)
      return lastTimestamp + 1;
    }
    return this.startTimestamp ? this.startTimestamp - 1 : Date.now() - 30000;
  }

  /**
   * Update the log group name if it changes.
   */
  updateLogGroup(logGroupName: string): void {
    this.logGroupName = logGroupName;
  }
}
