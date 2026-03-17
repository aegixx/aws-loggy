import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "./workspaceStore";
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
