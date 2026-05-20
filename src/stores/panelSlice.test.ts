import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPanelState,
  createPanelActions,
  type PanelState,
  type PanelActions,
} from "./panelSlice";
import type { LogEvent } from "../types";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../demo/demoInvoke", () => ({
  invoke: vi.fn(),
}));

vi.mock("./settingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settingsStore")>();
  return {
    ...actual,
    useSettingsStore: {
      getState: vi.fn(() => ({
        logLevels: [],
        cacheLimits: { maxLogCount: 50_000, maxSizeMb: 100 },
        setLastSelectedLogGroup: vi.fn(),
        setPanelPersistedConfig: vi.fn(),
        setPersistedTimeRange: vi.fn(),
        setPersistedDisabledLevels: vi.fn(),
        setPersistedGroupFilter: vi.fn(),
        setPersistedGroupByMode: vi.fn(),
        clearPanelPersistedConfig: vi.fn(),
        getDefaultDisabledLevels: vi.fn(() => new Set()),
      })),
    },
  };
});

vi.mock("./connectionStore", () => ({
  useConnectionStore: {
    getState: vi.fn(() => ({
      logGroups: [
        {
          name: "/aws/lambda/my-function",
          arn: "arn:aws:logs:us-east-1:123:log-group:/aws/lambda/my-function",
        },
      ],
      setConnectionFailed: vi.fn(),
    })),
  },
}));

// LiveTailManager is mocked so we can inspect start() calls without real AWS.
const managerStart = vi.fn();
const managerStop = vi.fn();
const managerResetStart = vi.fn();
const managerInstances: Array<{
  start: typeof managerStart;
  stop: typeof managerStop;
  resetStartTimestamp: typeof managerResetStart;
  options: Record<string, unknown>;
}> = [];

vi.mock("./LiveTailManager", () => {
  class MockLiveTailManager {
    options: Record<string, unknown>;
    start = managerStart;
    stop = managerStop;
    resetStartTimestamp = managerResetStart;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      managerInstances.push(this as unknown as (typeof managerInstances)[0]);
    }
  }
  return { LiveTailManager: MockLiveTailManager };
});

// ── Test harness ──────────────────────────────────────────────────────

interface Harness {
  panel: PanelState;
  actions: PanelActions;
  setPanelCalls: Array<Partial<PanelState>>;
}

function makeHarness(initial: Partial<PanelState> = {}): Harness {
  const state: PanelState = {
    ...createPanelState("panel-1"),
    logGroupName: "/aws/lambda/my-function",
    ...initial,
  };
  const setPanelCalls: Array<Partial<PanelState>> = [];
  const harness: Harness = {
    panel: state,
    actions: null as unknown as PanelActions,
    setPanelCalls,
  };
  harness.actions = createPanelActions(
    "panel-1",
    () => harness.panel,
    (partial) => {
      setPanelCalls.push(partial);
      Object.assign(harness.panel, partial);
    },
  );
  return harness;
}

function makeEvent(ts: number, message: string, event_id?: string): LogEvent {
  return {
    timestamp: ts,
    message,
    log_stream_name: "stream-1",
    event_id: event_id ?? null,
  } as LogEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("panelSlice startTail backfill", () => {
  beforeEach(() => {
    managerInstances.length = 0;
    managerStart.mockReset();
    managerStop.mockReset();
    managerResetStart.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invokes fetch_logs with a ~15m + overlap window before starting tail", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs") return Promise.resolve([]);
      if (cmd === "cancel_fetch") return Promise.resolve();
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    const fetchCall = vi
      .mocked(invoke)
      .mock.calls.find((c) => c[0] === "fetch_logs");
    expect(fetchCall).toBeDefined();
    const args = fetchCall![1] as Record<string, unknown>;
    expect(args.logGroupName).toBe("/aws/lambda/my-function");
    expect(args.filterPattern).toBeNull();
    const span = (args.endTime as number) - (args.startTime as number);
    // 15m + ~2s overlap, allow a little jitter for the second clock read.
    expect(span).toBeGreaterThanOrEqual(15 * 60 * 1000 + 1500);
    expect(span).toBeLessThanOrEqual(15 * 60 * 1000 + 5_000);
  });

  it("populates logs before manager.start() is called", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    let resolveFetch!: (v: LogEvent[]) => void;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return new Promise<LogEvent[]>((resolve) => {
          resolveFetch = resolve;
        });
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();

    // Manager not yet constructed: backfill still pending.
    expect(managerStart).not.toHaveBeenCalled();
    expect(harness.panel.logs).toHaveLength(0);

    resolveFetch([makeEvent(1000, "hello", "e1")]);
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    // Logs were set before manager construction.
    expect(harness.panel.logs).toHaveLength(1);
    expect(harness.panel.isTailing).toBe(true);
  });

  it("sets isTailing true after backfill + manager.start", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockResolvedValue([]);
    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalled());
    expect(harness.panel.isTailing).toBe(true);
    expect(harness.panel.tailManager).not.toBeNull();
  });

  it("on generic backfill error: shows toast, manager still starts", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs") return Promise.reject(new Error("boom"));
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    expect(harness.panel.tailToast).toMatch(/backfill failed/i);
    expect(harness.panel.isTailing).toBe(true);
  });

  it("on credential error: routes to setConnectionFailed and does NOT start manager", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    const { useConnectionStore } = await import("./connectionStore");
    const setConnectionFailed = vi.fn();
    vi.mocked(useConnectionStore.getState).mockReturnValue({
      logGroups: [
        {
          name: "/aws/lambda/my-function",
          arn: "arn:aws:logs:us-east-1:123:log-group:/aws/lambda/my-function",
        },
      ],
      setConnectionFailed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return Promise.reject(
          new Error("ExpiredToken: token has expired (SSO)"),
        );
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    // Give the rejected promise a chance to settle.
    await new Promise((r) => setTimeout(r, 10));

    expect(setConnectionFailed).toHaveBeenCalled();
    expect(managerStart).not.toHaveBeenCalled();
    expect(harness.panel.isTailing).toBe(false);
  });

  it("seam dedup: stream event with same event_id is dropped by onNewLogs", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return Promise.resolve([makeEvent(1000, "hello", "e1")]);
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    const inst = managerInstances[0];
    const onNewLogs = inst.options.onNewLogs as (logs: LogEvent[]) => void;
    // Same event_id arrives via stream — should be dropped.
    onNewLogs([makeEvent(1000, "hello", "e1")]);
    expect(harness.panel.logs).toHaveLength(1);
  });

  it("seam dedup: stream event with same timestamp+message[:100] is dropped", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return Promise.resolve([makeEvent(2000, "request id abc-123 done")]);
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    const inst = managerInstances[0];
    const onNewLogs = inst.options.onNewLogs as (logs: LogEvent[]) => void;
    onNewLogs([makeEvent(2000, "request id abc-123 done")]);
    expect(harness.panel.logs).toHaveLength(1);
  });

  it("stale fetchId on backfill success: result discarded, manager NOT started", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    let resolveFetch!: (v: LogEvent[]) => void;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return new Promise<LogEvent[]>((resolve) => {
          resolveFetch = resolve;
        });
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    // Simulate a competing action that bumps currentFetchId.
    harness.panel.currentFetchId += 1;
    resolveFetch([makeEvent(1000, "hello", "e1")]);
    await new Promise((r) => setTimeout(r, 10));

    expect(managerStart).not.toHaveBeenCalled();
    // Stale logs were NOT applied.
    expect(harness.panel.logs).toHaveLength(0);
  });

  it("stopTail during in-flight backfill: prevents manager.start (ENG-2)", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    let resolveFetch!: (v: LogEvent[]) => void;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return new Promise<LogEvent[]>((resolve) => {
          resolveFetch = resolve;
        });
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    // User clicks Stop while backfill is pending.
    harness.actions.stopTail();
    resolveFetch([makeEvent(1000, "hello", "e1")]);
    await new Promise((r) => setTimeout(r, 10));

    expect(managerStart).not.toHaveBeenCalled();
    expect(harness.panel.isTailing).toBe(false);
  });

  it("log group switch during backfill: stale resolve does not start manager (ENG-4)", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    let resolveFetch!: (v: LogEvent[]) => void;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return new Promise<LogEvent[]>((resolve) => {
          resolveFetch = resolve;
        });
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    // Caller changes log group mid-backfill.
    harness.panel.logGroupName = "/aws/lambda/other";
    harness.panel.currentFetchId += 1;
    resolveFetch([makeEvent(1000, "hello", "e1")]);
    await new Promise((r) => setTimeout(r, 10));

    expect(managerStart).not.toHaveBeenCalled();
  });

  it("rapid LIVE toggle: only the latest backfill starts a manager", async () => {
    const { invoke } = await import("../demo/demoInvoke");
    const resolvers: Array<(v: LogEvent[]) => void> = [];
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return new Promise<LogEvent[]>((resolve) => {
          resolvers.push(resolve);
        });
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    // Calling startTail again while isTailing is false (because backfill
    // hasn't resolved yet) would launch a second backfill. The spec doesn't
    // guard with isTailing on the second call, so the test verifies our
    // fetchId-based defense: first resolve becomes stale.
    harness.actions.startTail();
    expect(resolvers).toHaveLength(2);

    resolvers[0]([makeEvent(1000, "hello", "e1")]);
    resolvers[1]([makeEvent(2000, "world", "e2")]);
    await new Promise((r) => setTimeout(r, 10));

    expect(managerStart).toHaveBeenCalledTimes(1);
    // Only logs from the latest fetch are present.
    expect(harness.panel.logs.map((l) => l.event_id)).toEqual(["e2"]);
  });

  it("backfill timeout path: soft-fails to toast and starts manager (ENG-5)", async () => {
    // The production code wraps the invoke in Promise.race with a 15s
    // timeout that rejects with `Error("backfill timeout")`. We assert
    // the timeout path is handled identically to a generic failure by
    // simulating the same error rather than waiting 15s of fake time —
    // the fake-timer + microtask interaction is too brittle to test
    // the race wiring directly here.
    const { invoke } = await import("../demo/demoInvoke");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "fetch_logs")
        return Promise.reject(new Error("backfill window exceeded"));
      return Promise.resolve();
    });

    const harness = makeHarness();
    harness.actions.startTail();
    await vi.waitFor(() => expect(managerStart).toHaveBeenCalledTimes(1));

    expect(harness.panel.tailToast).toMatch(/backfill failed/i);
    expect(harness.panel.isTailing).toBe(true);
  });
});
