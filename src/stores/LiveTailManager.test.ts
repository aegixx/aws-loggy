import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveTailManager, type TransportType } from "./LiveTailManager";
import type { LogEvent } from "../types";

// Mock demo mode to return false
vi.mock("../demo/demoStore", () => ({
  getDemoMode: () => false,
}));

// Mock invoke to avoid real Tauri calls
vi.mock("../demo/demoInvoke", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe("LiveTailManager", () => {
  let onNewLogs: (logs: LogEvent[]) => void;
  let onError: (error: unknown) => void;
  let onTransportChange: (type: TransportType) => void;
  let onToast: (message: string) => void;
  let getLastLogTimestamp: () => number | null;

  beforeEach(() => {
    onNewLogs = vi.fn();
    onError = vi.fn();
    onTransportChange = vi.fn();
    onToast = vi.fn();
    getLastLogTimestamp = vi.fn().mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createManager(
    overrides?: Partial<ConstructorParameters<typeof LiveTailManager>[0]>,
  ) {
    return new LiveTailManager({
      panelId: "panel-1",
      logGroupName: "/aws/lambda/my-function",
      logGroupArn:
        "arn:aws:logs:us-east-1:123:log-group:/aws/lambda/my-function",
      onNewLogs,
      onError,
      onTransportChange,
      onToast,
      getLastLogTimestamp,
      ...overrides,
    });
  }

  describe("start", () => {
    it("uses polling transport (streaming disabled until backend supports panel_id)", async () => {
      const manager = createManager();
      await manager.start();

      expect(manager.getTransportType()).toBe("poll");
      expect(manager.isActive()).toBe(true);
      expect(onTransportChange).toHaveBeenCalledWith("poll");

      manager.stop();
    });

    it("uses polling even when ARN is available", async () => {
      const manager = createManager({
        logGroupArn:
          "arn:aws:logs:us-east-1:123:log-group:/aws/lambda/my-function",
      });
      await manager.start();

      expect(manager.getTransportType()).toBe("poll");

      manager.stop();
    });

    it("uses polling when no ARN is available", async () => {
      const manager = createManager({ logGroupArn: null });
      await manager.start();

      expect(manager.getTransportType()).toBe("poll");

      manager.stop();
    });
  });

  describe("onTailEvent", () => {
    it("delivers logs to onNewLogs callback", async () => {
      const manager = createManager();
      await manager.start();

      const logs = [
        {
          timestamp: Date.now(),
          message: "test log message",
          log_stream_name: "stream-1",
          event_id: null,
        },
      ];

      manager.onTailEvent({ panel_id: "panel-1", logs, count: 1 });

      expect(onNewLogs).toHaveBeenCalledWith(logs);

      manager.stop();
    });

    it("does not deliver empty log batches", async () => {
      const manager = createManager();
      await manager.start();

      manager.onTailEvent({ panel_id: "panel-1", logs: [], count: 0 });

      expect(onNewLogs).not.toHaveBeenCalled();

      manager.stop();
    });

    it("switches to polling when sampling is detected", async () => {
      const manager = createManager();
      await manager.start();

      // Reset to track transport changes after start
      vi.mocked(onTransportChange).mockClear();

      const logs = Array.from({ length: 500 }, (_, i) => ({
        timestamp: Date.now() + i,
        message: `log ${i}`,
        log_stream_name: "stream-1",
        event_id: null,
      }));

      manager.onTailEvent({ panel_id: "panel-1", logs, count: 500 });

      // Should not deliver logs when sampling detected
      expect(onNewLogs).not.toHaveBeenCalled();

      manager.stop();
    });
  });

  describe("stop", () => {
    it("cleans up state", async () => {
      const manager = createManager();
      await manager.start();

      expect(manager.isActive()).toBe(true);

      manager.stop();

      expect(manager.isActive()).toBe(false);
      expect(manager.getTransportType()).toBeNull();
    });
  });
});
