import type { TailTransport } from "../stores/TailTransport";
import type { LogEvent } from "../types";
import { generateMockTailBatch } from "./mockData";

const TICK_INTERVAL_MS = 1500;

export class DemoTailTransport implements TailTransport {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private logGroupName: string;
  private onNewLogs: (logs: LogEvent[]) => void;

  constructor(logGroupName: string, onNewLogs: (logs: LogEvent[]) => void) {
    this.logGroupName = logGroupName;
    this.onNewLogs = onNewLogs;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      const batch = generateMockTailBatch(this.logGroupName);
      if (batch.length > 0) {
        this.onNewLogs(batch);
      }
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isActive(): boolean {
    return this.intervalId !== null;
  }

  resetStartTimestamp(): void {
    // No-op for demo transport
  }
}
