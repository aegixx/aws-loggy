import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "./workspaceStore";
import { useSettingsStore } from "./settingsStore";
import type { PanelState } from "./panelSlice";
import type { ParsedLogEvent, GroupByMode } from "../types";

function createMockLog(
  message: string,
  overrides: Partial<ParsedLogEvent> = {},
): ParsedLogEvent {
  return {
    timestamp: Date.now(),
    message,
    log_stream_name: "test-stream",
    event_id: `event-${Math.random()}`,
    level: "info",
    parsedJson: null,
    formattedTime: "Jan 01, 00:00:00",
    ...overrides,
  };
}

/** Get the active panel's state */
function getActivePanel(): PanelState {
  const { panels, activePanelId } = useWorkspaceStore.getState();
  return panels.get(activePanelId)!;
}

/** Get the active panel's actions */
function getActiveActions() {
  const { activePanelId, panelAction } = useWorkspaceStore.getState();
  return panelAction(activePanelId);
}

/** Set partial state on the active panel in workspaceStore */
function setActivePanelState(partial: Partial<PanelState>): void {
  const { panels, activePanelId } = useWorkspaceStore.getState();
  const existing = panels.get(activePanelId);
  if (!existing) return;
  const updated = new Map(panels);
  updated.set(activePanelId, { ...existing, ...partial });
  useWorkspaceStore.setState({ panels: updated });
}

describe("workspaceStore - filterText", () => {
  beforeEach(() => {
    setActivePanelState({
      logs: [
        createMockLog("Application server started on port 3000"),
        createMockLog("Database connection established"),
        createMockLog("Application server handling request"),
        createMockLog("Error: server timeout"),
        createMockLog("Database server restarted"),
      ],
      filterText: "",
      disabledLevels: new Set(),
    });
  });

  it("should match on a single term", () => {
    getActiveActions().setFilterText("Database");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(2);
    expect(filteredLogs[0].message).toContain("Database");
    expect(filteredLogs[1].message).toContain("Database");
  });

  it("should treat space-separated terms as AND (all must match)", () => {
    getActiveActions().setFilterText("application server");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(2);
    expect(filteredLogs[0].message).toContain("Application");
    expect(filteredLogs[0].message).toContain("server");
    expect(filteredLogs[1].message).toContain("Application");
    expect(filteredLogs[1].message).toContain("server");
  });

  it("should match AND terms in any order", () => {
    getActiveActions().setFilterText("server database");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(1);
    expect(filteredLogs[0].message).toContain("Database");
    expect(filteredLogs[0].message).toContain("server");
  });

  it("should be case-insensitive", () => {
    getActiveActions().setFilterText("APPLICATION SERVER");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(2);
  });

  it("should return all logs when filter is empty", () => {
    getActiveActions().setFilterText("");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(5);
  });

  it("should return no results when AND terms don't co-occur", () => {
    getActiveActions().setFilterText("Database Application");
    const { filteredLogs } = getActivePanel();
    expect(filteredLogs).toHaveLength(0);
  });
});

describe("workspaceStore - groupByMode", () => {
  beforeEach(() => {
    setActivePanelState({
      groupByMode: "none" as GroupByMode | "auto",
      collapsedGroups: new Set<string>(),
      effectiveGroupByMode: "none" as GroupByMode,
      logGroupName: null,
    });
  });

  it("should default to 'none'", () => {
    expect(getActivePanel().groupByMode).toBe("none");
  });

  it("should update groupByMode via setGroupByMode", () => {
    getActiveActions().setGroupByMode("stream");
    expect(getActivePanel().groupByMode).toBe("stream");
  });

  it("should set effectiveGroupByMode to the explicit mode when not auto", () => {
    getActiveActions().setGroupByMode("stream");
    expect(getActivePanel().effectiveGroupByMode).toBe("stream");

    getActiveActions().setGroupByMode("invocation");
    expect(getActivePanel().effectiveGroupByMode).toBe("invocation");

    getActiveActions().setGroupByMode("none");
    expect(getActivePanel().effectiveGroupByMode).toBe("none");
  });

  it("should auto-detect invocation mode for Lambda log groups", () => {
    setActivePanelState({ logGroupName: "/aws/lambda/my-function" });
    getActiveActions().setGroupByMode("auto");
    expect(getActivePanel().effectiveGroupByMode).toBe("invocation");
  });

  it("should auto-detect stream mode for non-Lambda log groups", () => {
    setActivePanelState({ logGroupName: "/ecs/my-service" });
    getActiveActions().setGroupByMode("auto");
    expect(getActivePanel().effectiveGroupByMode).toBe("stream");
  });

  it("should auto-detect stream mode when no log group is selected", () => {
    getActiveActions().setGroupByMode("auto");
    expect(getActivePanel().effectiveGroupByMode).toBe("stream");
  });

  it("should reset collapsed state when mode changes", () => {
    getActiveActions().toggleGroupCollapsed("group-1");
    getActiveActions().toggleGroupCollapsed("group-2");
    expect(getActivePanel().collapsedGroups.size).toBe(2);

    getActiveActions().setGroupByMode("stream");
    expect(getActivePanel().collapsedGroups.size).toBe(0);
  });

  it("should toggle group collapsed state", () => {
    getActiveActions().toggleGroupCollapsed("group-1");
    expect(getActivePanel().collapsedGroups.has("group-1")).toBe(true);

    getActiveActions().toggleGroupCollapsed("group-1");
    expect(getActivePanel().collapsedGroups.has("group-1")).toBe(false);
  });

  it("should toggle multiple groups independently", () => {
    getActiveActions().toggleGroupCollapsed("group-1");
    getActiveActions().toggleGroupCollapsed("group-2");
    expect(getActivePanel().collapsedGroups.has("group-1")).toBe(true);
    expect(getActivePanel().collapsedGroups.has("group-2")).toBe(true);

    getActiveActions().toggleGroupCollapsed("group-1");
    expect(getActivePanel().collapsedGroups.has("group-1")).toBe(false);
    expect(getActivePanel().collapsedGroups.has("group-2")).toBe(true);
  });
});

describe("workspaceStore - groupFilter", () => {
  beforeEach(() => {
    setActivePanelState({
      groupFilter: true,
      groupByMode: "stream" as GroupByMode | "auto",
      effectiveGroupByMode: "stream" as GroupByMode,
    });
  });

  it("should default to true", () => {
    const panel = getActivePanel();
    expect(panel.groupFilter).toBe(true);
    expect(typeof panel.groupFilter).toBe("boolean");
  });

  it("should toggle groupFilter via toggleGroupFilter", () => {
    expect(getActivePanel().groupFilter).toBe(true);
    getActiveActions().toggleGroupFilter();
    expect(getActivePanel().groupFilter).toBe(false);
    getActiveActions().toggleGroupFilter();
    expect(getActivePanel().groupFilter).toBe(true);
  });

  it("should reset groupFilter to false when groupByMode set to none", () => {
    setActivePanelState({ groupFilter: true });
    getActiveActions().setGroupByMode("none");
    expect(getActivePanel().groupFilter).toBe(false);
  });

  it("should NOT reset groupFilter when groupByMode set to stream", () => {
    setActivePanelState({ groupFilter: true });
    getActiveActions().setGroupByMode("stream");
    expect(getActivePanel().groupFilter).toBe(true);
  });
});

describe("workspaceStore - panel management", () => {
  it("should start with one panel", () => {
    const { panels } = useWorkspaceStore.getState();
    expect(panels.size).toBe(1);
  });

  it("should add a panel and set it active", () => {
    const newId = useWorkspaceStore.getState().addPanel();
    const { panels, activePanelId } = useWorkspaceStore.getState();
    expect(panels.size).toBe(2);
    expect(activePanelId).toBe(newId);
  });

  it("should remove a panel and auto-create if last", () => {
    const { activePanelId } = useWorkspaceStore.getState();
    useWorkspaceStore.getState().removePanel(activePanelId);
    const { panels } = useWorkspaceStore.getState();
    // Should auto-create a new panel when last one is removed
    expect(panels.size).toBe(1);
  });

  it("should enforce max 10 panels", () => {
    // Add 9 more to reach 10 total (started with 2 from previous test)
    const { panels } = useWorkspaceStore.getState();
    const toAdd = 10 - panels.size;
    for (let i = 0; i < toAdd; i++) {
      useWorkspaceStore.getState().addPanel();
    }
    expect(useWorkspaceStore.getState().panels.size).toBe(10);

    // 11th should be rejected
    const rejected = useWorkspaceStore.getState().addPanel();
    expect(useWorkspaceStore.getState().panels.size).toBe(10);
    expect(rejected).toBe(useWorkspaceStore.getState().activePanelId);
  });

  it("should reorder panels", () => {
    // Start fresh — remove all and add 3
    const { panels } = useWorkspaceStore.getState();
    for (const id of [...panels.keys()]) {
      useWorkspaceStore.getState().removePanel(id);
    }
    const id1 = useWorkspaceStore.getState().activePanelId; // auto-created
    const id2 = useWorkspaceStore.getState().addPanel();
    const id3 = useWorkspaceStore.getState().addPanel();

    useWorkspaceStore.getState().reorderPanels([id3, id1, id2]);
    const reorderedIds = [...useWorkspaceStore.getState().panels.keys()];
    expect(reorderedIds).toEqual([id3, id1, id2]);
  });
});

describe("workspaceStore - saveWorkspace", () => {
  it("should create a workspace config from current state", () => {
    setActivePanelState({
      logGroupName: "/aws/lambda/test",
      filterText: "error",
      groupByMode: "invocation",
    });

    const config = useWorkspaceStore.getState().saveWorkspace("Test Workspace");
    expect(config.name).toBe("Test Workspace");
    expect(config.panels.length).toBeGreaterThan(0);
    expect(config.layoutMode).toBe("tabs");

    // Verify panel config captures state
    const panelConfig = config.panels.find(
      (p) => p.logGroupName === "/aws/lambda/test",
    );
    expect(panelConfig).toBeDefined();
    expect(panelConfig!.filterText).toBe("error");
    expect(panelConfig!.groupByMode).toBe("invocation");
  });
});

describe("settingsStore - savedWorkspaces", () => {
  beforeEach(() => {
    useSettingsStore.setState({ savedWorkspaces: [] });
  });

  it("should add a saved workspace", () => {
    const config = useWorkspaceStore.getState().saveWorkspace("My Workspace");
    useSettingsStore.getState().addSavedWorkspace(config);
    expect(useSettingsStore.getState().savedWorkspaces).toHaveLength(1);
    expect(useSettingsStore.getState().savedWorkspaces[0].name).toBe(
      "My Workspace",
    );
  });

  it("should replace workspace with same id", () => {
    const config = useWorkspaceStore.getState().saveWorkspace("V1");
    useSettingsStore.getState().addSavedWorkspace(config);

    const updated = { ...config, name: "V2" };
    useSettingsStore.getState().addSavedWorkspace(updated);

    expect(useSettingsStore.getState().savedWorkspaces).toHaveLength(1);
    expect(useSettingsStore.getState().savedWorkspaces[0].name).toBe("V2");
  });

  it("should remove a saved workspace", () => {
    const config = useWorkspaceStore.getState().saveWorkspace("Delete Me");
    useSettingsStore.getState().addSavedWorkspace(config);
    expect(useSettingsStore.getState().savedWorkspaces).toHaveLength(1);

    useSettingsStore.getState().removeSavedWorkspace(config.id);
    expect(useSettingsStore.getState().savedWorkspaces).toHaveLength(0);
  });

  it("should rename a saved workspace", () => {
    const config = useWorkspaceStore.getState().saveWorkspace("Old Name");
    useSettingsStore.getState().addSavedWorkspace(config);

    useSettingsStore.getState().renameSavedWorkspace(config.id, "New Name");
    expect(useSettingsStore.getState().savedWorkspaces[0].name).toBe(
      "New Name",
    );
  });
});
