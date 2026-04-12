/**
 * Tests that `groupStore`'s role-aware storage adapter discards writes
 * when the process is a secondary. We can't cheaply observe hydrate-time
 * reads (zustand's getItem runs before we can swap the role), so this test
 * focuses on the post-hydrate write path, which is where a secondary could
 * accidentally overwrite the primary's layout.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __setInstanceRoleForTests } from "./instanceRole";
import { useGroupStore } from "./groupStore";

describe("groupStore role-aware persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // Reset the module-level cached role so a stale value can't leak into
    // other test files that run in the same Vitest worker.
    __setInstanceRoleForTests(null);
  });

  it("primary writes groupStore state to localStorage", () => {
    __setInstanceRoleForTests("Primary");
    // Trigger any state mutation that zustand will persist.
    useGroupStore.getState().setTimeSyncEnabled(true);
    const raw = localStorage.getItem("loggy-groups");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.timeSyncEnabled).toBe(true);
  });

  it("secondary does not write groupStore state to localStorage", () => {
    __setInstanceRoleForTests("Secondary");
    // Make sure no stale key from a prior test leaks in.
    localStorage.removeItem("loggy-groups");
    useGroupStore.getState().setTimeSyncEnabled(false);
    // The role-aware adapter short-circuits setItem for secondaries.
    expect(localStorage.getItem("loggy-groups")).toBeNull();
  });

  it("hydration is synchronous so initializeGroups sees persisted panel IDs", () => {
    // Regression test: when groupStore used async storage, initializeGroups()
    // ran before hydration completed, creating panels for fresh default IDs.
    // After hydration replaced the root with persisted panel IDs, workspaceStore
    // had no record of them — resulting in a blank screen.
    __setInstanceRoleForTests("Primary");

    // Seed localStorage with a known layout containing a specific panel ID.
    const seededPanelId = "panel-regression-test";
    const seededLeaf = {
      type: "leaf",
      id: "leaf-regression-test",
      panelIds: [seededPanelId],
      activePanelId: seededPanelId,
      merged: false,
    };
    localStorage.setItem(
      "loggy-groups",
      JSON.stringify({
        state: {
          root: seededLeaf,
          activeGroupId: seededLeaf.id,
          timeSyncEnabled: false,
        },
        version: 2,
      }),
    );

    // Force zustand to re-read from storage by replacing its state.
    // In the real app, this happens on module load. Here we simulate by
    // calling rehydrate (zustand persist exposes this).
    useGroupStore.persist.rehydrate();

    // The root should now have the seeded panel ID — synchronously, before
    // any async tick. This is what initializeGroups() reads at startup.
    const panelIds =
      useGroupStore.getState().root.type === "leaf"
        ? (useGroupStore.getState().root as { panelIds: string[] }).panelIds
        : [];
    expect(panelIds).toContain(seededPanelId);
  });
});
