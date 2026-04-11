/**
 * Tests that `groupStore`'s role-aware storage adapter discards writes
 * when the process is a secondary. We can't cheaply observe hydrate-time
 * reads (zustand's getItem runs before we can swap the role), so this test
 * focuses on the post-hydrate write path, which is where a secondary could
 * accidentally overwrite the primary's layout.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { __setInstanceRoleForTests } from "./instanceRole";
import { useGroupStore } from "./groupStore";

describe("groupStore role-aware persistence", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
