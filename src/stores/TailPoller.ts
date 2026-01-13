import { invoke } from "@tauri-apps/api/core";
import type { LogEvent } from "../types";

/**
 * Encapsulates live tail polling logic.
 * Manages interval, start timestamp, and polling state.
 */
export class TailPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimestamp: number | null = null;

  constructor(
    private logGroupName: string,
    private onNewLogs: (logs: LogEvent[]) => void,
    private onError: (error: unknown) => void,
    private getLastLogTimestamp: () => number | null,
  ) {}

  /**
   * Start polling for new logs.
   * Sets up 2-second interval and tracks start timestamp.
   */
  start(): void {
    if (this.intervalId) {
      console.warn("[TailPoller] Already polling, stopping first");
      this.stop();
    }

    console.log("[User Activity] Start live tail");

    // Track when tail started - used to filter out older logs
    this.startTimestamp = Date.now();

    // Set up polling interval
    this.intervalId = setInterval(async () => {
      await this.poll();
    }, 2000);
  }

  /**
   * Stop polling and clean up.
   */
  stop(): void {
    if (this.intervalId) {
      console.log("[User Activity] Stop live tail");
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.startTimestamp = null;
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
    return this.intervalId !== null;
  }

  /**
   * Poll for new logs and invoke callback.
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
        maxCount: 100,
        maxSizeMb: null,
      });

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
      console.error("[Backend Activity] Tail fetch error:", error);
      this.onError(error);
    }
  }

  /**
   * Calculate the timestamp to poll from.
   * Returns last log timestamp if available, otherwise start timestamp with lookback.
   */
  private calculatePollTimestamp(): number {
    const lastTimestamp = this.getLastLogTimestamp();
    if (lastTimestamp) {
      return lastTimestamp;
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
