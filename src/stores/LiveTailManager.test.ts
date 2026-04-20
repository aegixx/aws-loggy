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
    it("uses streaming transport when ARN is available", async () => {
      const manager = createManager();
      await manager.start();

      expect(manager.getTransportType()).toBe("stream");
      expect(manager.isActive()).toBe(true);
      expect(onTransportChange).toHaveBeenCalledWith("stream");

      manager.stop();
    });

    it("stays idle (no transport) when ARN is null", async () => {
      const manager = createManager({ logGroupArn: null });
      await manager.start();

      expect(manager.getTransportType()).toBeNull();
      expect(manager.isActive()).toBe(false);
      expect(onTransportChange).not.toHaveBeenCalled();

      manager.stop();
    });

    it("start/stop race: stop while invoke pending tears down pending session", async () => {
      const { invoke } = await import("../demo/demoInvoke");
      let resolveInvoke!: () => void;
      vi.mocked(invoke).mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveInvoke = resolve;
        }),
      );

      const manager = createManager();
      const startPromise = manager.start();
      // stop() bumps startGen before invoke resolves
      manager.stop();
      resolveInvoke();
      await startPromise;

      // Transport should not be set (stop won the race)
      expect(manager.getTransportType()).toBeNull();
      // stop_live_tail should have been called to cancel the orphaned backend session
      expect(invoke).toHaveBeenCalledWith("stop_live_tail", {
        panelId: "panel-1",
      });
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
      const { invoke } = await import("../demo/demoInvoke");
      const manager = createManager();
      await manager.start();

      // Reset to track subsequent invokes
      vi.mocked(invoke).mockClear();
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
      // Should switch to polling
      expect(manager.getTransportType()).toBe("poll");
      // Should have stopped the backend stream session
      expect(invoke).toHaveBeenCalledWith("stop_live_tail", {
        panelId: "panel-1",
      });

      manager.stop();
    });
  });

  describe("onTailError", () => {
    it("falls back to polling on SessionLimitExceeded with specific toast", async () => {
      const manager = createManager();
      await manager.start();
      vi.mocked(onTransportChange).mockClear();

      manager.onTailError({
        panel_id: "panel-1",
        kind: "sessionLimitExceeded",
        message: "Limit exceeded",
      });

      expect(manager.getTransportType()).toBe("poll");
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining("session limit"),
      );
    });

    it("falls back to polling on StreamError", async () => {
      const manager = createManager();
      await manager.start();
      vi.mocked(onTransportChange).mockClear();

      manager.onTailError({
        panel_id: "panel-1",
        kind: "streamError",
        message: "Stream failed",
      });

      expect(manager.getTransportType()).toBe("poll");
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("polling"));
    });

    it("surfaces PermissionDenied to onError and stops without fallback", async () => {
      const manager = createManager();
      await manager.start();

      manager.onTailError({
        panel_id: "panel-1",
        kind: "permissionDenied",
        message: "Access denied",
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Permission denied"),
        }),
      );
      expect(manager.isActive()).toBe(false);
    });

    it("falls back to polling on kind=other", async () => {
      const manager = createManager();
      await manager.start();
      vi.mocked(onTransportChange).mockClear();

      manager.onTailError({
        panel_id: "panel-1",
        kind: "other",
        message: "Unknown error",
      });

      expect(manager.getTransportType()).toBe("poll");
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("polling"));
    });
  });

  describe("onTailEnded", () => {
    it("reconnects stream after timeout", async () => {
      const { invoke } = await import("../demo/demoInvoke");
      const manager = createManager();
      await manager.start();
      vi.mocked(invoke).mockClear();
      vi.mocked(onTransportChange).mockClear();

      await manager.onTailEnded();

      expect(manager.getTransportType()).toBe("stream");
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining("reconnected"),
      );
      // Should have re-invoked start_live_tail for the reconnect
      expect(invoke).toHaveBeenCalledWith(
        "start_live_tail",
        expect.any(Object),
      );

      manager.stop();
    });
  });

  describe("IPC error fallback", () => {
    it("falls back to polling when start_live_tail invoke rejects", async () => {
      const { invoke } = await import("../demo/demoInvoke");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("IPC failure"));

      const manager = createManager();
      await manager.start();

      expect(manager.getTransportType()).toBe("poll");
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("polling"));

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
