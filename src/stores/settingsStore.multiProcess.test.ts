/**
 * Tests for the multi-process settings split: legacy v17 migration, field
 * routing between the shared file and per-window localStorage, and
 * cross-process re-hydration on `settings-changed` events.
 *
 * These tests import the store module after mocking `@tauri-apps/api/core`
 * and `./instanceRole` so we can control `isPrimary()` and observe what
 * `set_settings` invocations are made with.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { __setInstanceRoleForTests } from "./instanceRole";

// The shared setup.ts already mocks `@tauri-apps/api/core` with an
// `invoke` that returns `[]`. We re-cast it here to control it per test.
// The cast chain takes the vitest Mock through `unknown` and out to a
// plain async function so tests can both call it (`await mockInvoke(...)`)
// and configure it (`mockInvoke.mockImplementation(...)`).
type MockFn = ((cmd: string, args?: unknown) => Promise<unknown>) & {
  mockReset: () => void;
  mockImplementation: (
    fn: (cmd: string, args?: unknown) => Promise<unknown>,
  ) => void;
  mock: { calls: unknown[][] };
};
const mockInvoke = invoke as unknown as MockFn;

// Event listener handler type from @tauri-apps/api/event
type EventHandler = (event: { payload: unknown }) => void | Promise<void>;
type ListenMockFn = ((
  eventName: string,
  handler: EventHandler,
) => Promise<() => void>) & {
  mockReset: () => void;
  mockImplementation: (
    fn: (eventName: string, handler: EventHandler) => Promise<() => void>,
  ) => void;
  mock: { calls: unknown[][] };
};
const mockListen = listen as unknown as ListenMockFn;

describe("settingsStore multi-process split", () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    // Default: instance role already resolved as Primary so we don't pick up
    // the cached default from a previous test.
    __setInstanceRoleForTests("Primary");
  });

  it("splitState routes UI-pref fields to the shared file and workspace fields to localStorage", async () => {
    // Fresh-install file read: no state, no version.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_instance_role") return "Primary";
      if (cmd === "get_settings") return {};
      if (cmd === "set_settings") return undefined;
      return [];
    });

    // Fresh import of the store so its hydration picks up our mocks.
    vi.resetModules();
    const mod = await import("./settingsStore");
    // Let the async hydrate settle.
    await new Promise((r) => setTimeout(r, 10));

    mod.useSettingsStore.setState({
      theme: "dark",
      awsProfile: "prod",
    });

    // Wait past the 300ms debounce in scheduleFileWrite.
    await new Promise((r) => setTimeout(r, 400));

    // Workspace slice → localStorage["loggy-workspace"] contains awsProfile
    // but NOT theme (theme is a shared field).
    const raw = localStorage.getItem("loggy-workspace");
    expect(raw).toBeTruthy();
    const envelope = JSON.parse(raw as string);
    expect(envelope.state.awsProfile).toBe("prod");
    expect(envelope.state.theme).toBeUndefined();

    // Shared slice → set_settings was called with a payload containing theme
    // but NOT awsProfile.
    const setCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "set_settings",
    );
    expect(setCalls.length).toBeGreaterThan(0);
    const lastShared = setCalls[setCalls.length - 1][1] as {
      value: { state: Record<string, unknown> };
    };
    expect(lastShared.value.state.theme).toBe("dark");
    expect(lastShared.value.state.awsProfile).toBeUndefined();
  });

  it("secondary windows do not write the workspace slice to localStorage", async () => {
    __setInstanceRoleForTests("Secondary");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_instance_role") return "Secondary";
      if (cmd === "get_settings") return {};
      return undefined;
    });

    vi.resetModules();
    const mod = await import("./settingsStore");
    await new Promise((r) => setTimeout(r, 10));

    mod.useSettingsStore.setState({ awsProfile: "prod" });
    await new Promise((r) => setTimeout(r, 50));

    // Secondary should not have written to loggy-workspace.
    expect(localStorage.getItem("loggy-workspace")).toBeNull();
  });

  it("migrates a legacy v17 loggy-settings blob into the split destinations", async () => {
    // Seed legacy blob.
    localStorage.setItem(
      "loggy-settings",
      JSON.stringify({
        version: 17,
        state: {
          theme: "light",
          logLevels: [
            {
              id: "error",
              name: "Error",
              style: { baseColor: "#ff0000" },
              keywords: ["error"],
              priority: 0,
              defaultEnabled: true,
            },
          ],
          awsProfile: "dev",
          panelPersistedConfigs: { "panel-1": { logGroupName: "fg" } },
          cacheLimits: { maxLogCount: 100, maxSizeMb: 10 },
          savedWorkspaces: [],
        },
      }),
    );

    let sharedWritten: Record<string, unknown> | null = null;
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "get_instance_role") return "Primary";
      if (cmd === "get_settings") return {};
      if (cmd === "set_settings") {
        sharedWritten = (args as { value: Record<string, unknown> }).value;
        return undefined;
      }
      return undefined;
    });

    vi.resetModules();
    await import("./settingsStore");
    // Legacy migration is sync within the getItem call chain.
    await new Promise((r) => setTimeout(r, 50));

    // Legacy key should be removed.
    expect(localStorage.getItem("loggy-settings")).toBeNull();

    // Workspace side should hold awsProfile + panelPersistedConfigs.
    const wsRaw = localStorage.getItem("loggy-workspace");
    expect(wsRaw).toBeTruthy();
    const wsEnvelope = JSON.parse(wsRaw as string);
    expect(wsEnvelope.state.awsProfile).toBe("dev");
    expect(wsEnvelope.state.panelPersistedConfigs).toEqual({
      "panel-1": { logGroupName: "fg" },
    });

    // Shared side should have received theme + logLevels + cacheLimits.
    expect(sharedWritten).not.toBeNull();
    const sharedState = (
      sharedWritten as unknown as {
        state: Record<string, unknown>;
      }
    ).state;
    expect(sharedState.theme).toBe("light");
    expect(sharedState.logLevels).toBeDefined();
    expect(sharedState.cacheLimits).toEqual({
      maxLogCount: 100,
      maxSizeMb: 10,
    });
    // awsProfile should NOT be on the shared side.
    expect(sharedState.awsProfile).toBeUndefined();
  });

  it("subscribeSettingsChanged does not fire setState when remote state matches current", async () => {
    // Regression test: if every shared field in the incoming file state
    // already matches current store state, setState must NOT be called.
    // Otherwise zustand's persist middleware would schedule another file
    // write, triggering the sibling's watcher, triggering another
    // re-hydrate, in an infinite cross-window loop.
    //
    // This test actually drives subscribeSettingsChanged end-to-end by
    // capturing the handler it registers with listen() and invoking it
    // directly.
    let capturedHandler: EventHandler | null = null;
    mockListen.mockReset();
    mockListen.mockImplementation(async (_name: string, handler) => {
      capturedHandler = handler;
      return () => {};
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_instance_role") return "Primary";
      if (cmd === "get_settings") return {};
      return undefined;
    });

    vi.resetModules();
    const mod = await import("./settingsStore");
    await new Promise((r) => setTimeout(r, 10));

    // Seed a known shared-field state that we want the incoming event to
    // match exactly.
    mod.useSettingsStore.setState({ theme: "dark" });

    // Subscribe and count setState fires triggered by the watcher path.
    let setStateCalls = 0;
    const unsubscribe = mod.useSettingsStore.subscribe(() => {
      setStateCalls++;
    });

    // Start the real subscriber, which registers our captured handler.
    const unlisten = await mod.subscribeSettingsChanged();
    expect(capturedHandler).not.toBeNull();

    // Configure get_settings to return an incoming payload with the same
    // theme as current state.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") {
        return { state: { theme: "dark" }, version: 18 };
      }
      return undefined;
    });

    // Fire the event. This exercises the real diff-check guard.
    await (capturedHandler as unknown as EventHandler)({ payload: null });

    // No setState fire → guard held; no cross-window feedback loop.
    expect(setStateCalls).toBe(0);

    unsubscribe();
    unlisten();
  });

  it("subscribeSettingsChanged applies only differing shared fields", async () => {
    // Companion test: when the incoming file differs, setState IS called,
    // but only with the fields that actually changed. This confirms the
    // guard is a filter, not a kill-switch.
    let capturedHandler: EventHandler | null = null;
    mockListen.mockReset();
    mockListen.mockImplementation(async (_name: string, handler) => {
      capturedHandler = handler;
      return () => {};
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_instance_role") return "Primary";
      if (cmd === "get_settings") return {};
      return undefined;
    });

    vi.resetModules();
    const mod = await import("./settingsStore");
    await new Promise((r) => setTimeout(r, 10));

    mod.useSettingsStore.setState({ theme: "dark" });

    const unlisten = await mod.subscribeSettingsChanged();
    expect(capturedHandler).not.toBeNull();

    // Incoming file has a different theme AND a non-shared field.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") {
        return {
          state: {
            theme: "light", // shared, differs → should apply
            awsProfile: "prod", // NOT shared → should NOT apply
          },
          version: 18,
        };
      }
      return undefined;
    });

    await (capturedHandler as unknown as EventHandler)({ payload: null });
    // Let the async setState settle.
    await new Promise((r) => setTimeout(r, 10));

    const after = mod.useSettingsStore.getState();
    expect(after.theme).toBe("light");
    // awsProfile should NOT have been overwritten by a non-shared incoming
    // field. (It starts null from the default state.)
    expect(after.awsProfile).toBeNull();

    unlisten();
  });
});
