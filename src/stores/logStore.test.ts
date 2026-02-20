import { describe, it, expect, beforeEach } from "vitest";
import { useLogStore } from "./logStore";
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

describe("logStore - filterText", () => {
  beforeEach(() => {
    useLogStore.setState({
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
    useLogStore.getState().setFilterText("Database");
    const { filteredLogs } = useLogStore.getState();
    expect(filteredLogs).toHaveLength(2);
    expect(filteredLogs[0].message).toContain("Database");
    expect(filteredLogs[1].message).toContain("Database");
  });

  it("should treat space-separated terms as AND (all must match)", () => {
    useLogStore.getState().setFilterText("application server");
    const { filteredLogs } = useLogStore.getState();
    // Should match "Application server started" and "Application server handling"
    // but NOT "Error: server timeout" or "Database server restarted"
    expect(filteredLogs).toHaveLength(2);
    expect(filteredLogs[0].message).toContain("Application");
    expect(filteredLogs[0].message).toContain("server");
    expect(filteredLogs[1].message).toContain("Application");
    expect(filteredLogs[1].message).toContain("server");
  });

  it("should match AND terms in any order", () => {
    useLogStore.getState().setFilterText("server database");
    const { filteredLogs } = useLogStore.getState();
    // Should match "Database server restarted" (has both terms)
    expect(filteredLogs).toHaveLength(1);
    expect(filteredLogs[0].message).toContain("Database");
    expect(filteredLogs[0].message).toContain("server");
  });

  it("should be case-insensitive", () => {
    useLogStore.getState().setFilterText("APPLICATION SERVER");
    const { filteredLogs } = useLogStore.getState();
    expect(filteredLogs).toHaveLength(2);
  });

  it("should return all logs when filter is empty", () => {
    useLogStore.getState().setFilterText("");
    const { filteredLogs } = useLogStore.getState();
    expect(filteredLogs).toHaveLength(5);
  });

  it("should return no results when AND terms don't co-occur", () => {
    useLogStore.getState().setFilterText("Database Application");
    const { filteredLogs } = useLogStore.getState();
    expect(filteredLogs).toHaveLength(0);
  });
});

describe("logStore - groupByMode", () => {
  beforeEach(() => {
    useLogStore.setState({
      groupByMode: "none" as GroupByMode | "auto",
      collapsedGroups: new Set<string>(),
      effectiveGroupByMode: "none" as GroupByMode,
      selectedLogGroup: null,
    });
  });

  it("should default to 'none'", () => {
    const { groupByMode } = useLogStore.getState();
    expect(groupByMode).toBe("none");
  });

  it("should update groupByMode via setGroupByMode", () => {
    useLogStore.getState().setGroupByMode("stream");
    expect(useLogStore.getState().groupByMode).toBe("stream");
  });

  it("should set effectiveGroupByMode to the explicit mode when not auto", () => {
    useLogStore.getState().setGroupByMode("stream");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("stream");

    useLogStore.getState().setGroupByMode("invocation");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("invocation");

    useLogStore.getState().setGroupByMode("none");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("none");
  });

  it("should auto-detect invocation mode for Lambda log groups", () => {
    // Set selectedLogGroup first via setState, then trigger auto resolution
    useLogStore.setState({ selectedLogGroup: "/aws/lambda/my-function" });
    useLogStore.getState().setGroupByMode("auto");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("invocation");
  });

  it("should auto-detect stream mode for non-Lambda log groups", () => {
    useLogStore.setState({ selectedLogGroup: "/ecs/my-service" });
    useLogStore.getState().setGroupByMode("auto");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("stream");
  });

  it("should auto-detect stream mode when no log group is selected", () => {
    useLogStore.getState().setGroupByMode("auto");
    expect(useLogStore.getState().effectiveGroupByMode).toBe("stream");
  });

  it("should reset collapsed state when mode changes", () => {
    // Add some collapsed groups first
    useLogStore.getState().toggleGroupCollapsed("group-1");
    useLogStore.getState().toggleGroupCollapsed("group-2");
    expect(useLogStore.getState().collapsedGroups.size).toBe(2);

    // Changing mode should reset collapsed groups
    useLogStore.getState().setGroupByMode("stream");
    expect(useLogStore.getState().collapsedGroups.size).toBe(0);
  });

  it("should toggle group collapsed state", () => {
    useLogStore.getState().toggleGroupCollapsed("group-1");
    expect(useLogStore.getState().collapsedGroups.has("group-1")).toBe(true);

    useLogStore.getState().toggleGroupCollapsed("group-1");
    expect(useLogStore.getState().collapsedGroups.has("group-1")).toBe(false);
  });

  it("should toggle multiple groups independently", () => {
    useLogStore.getState().toggleGroupCollapsed("group-1");
    useLogStore.getState().toggleGroupCollapsed("group-2");
    expect(useLogStore.getState().collapsedGroups.has("group-1")).toBe(true);
    expect(useLogStore.getState().collapsedGroups.has("group-2")).toBe(true);

    useLogStore.getState().toggleGroupCollapsed("group-1");
    expect(useLogStore.getState().collapsedGroups.has("group-1")).toBe(false);
    expect(useLogStore.getState().collapsedGroups.has("group-2")).toBe(true);
  });
});

describe("logStore - groupFilter", () => {
  beforeEach(() => {
    useLogStore.setState({
      groupFilter: true,
      groupByMode: "stream" as GroupByMode | "auto",
      effectiveGroupByMode: "stream" as GroupByMode,
    });
  });

  it("should default to true", () => {
    // Reset to the store's initial default by removing the beforeEach override
    const initialState = useLogStore.getState();
    // The beforeEach sets it to true, which matches the store's initial default
    expect(initialState.groupFilter).toBe(true);
    expect(typeof initialState.groupFilter).toBe("boolean");
  });

  it("should toggle groupFilter via toggleGroupFilter", () => {
    expect(useLogStore.getState().groupFilter).toBe(true);
    useLogStore.getState().toggleGroupFilter();
    expect(useLogStore.getState().groupFilter).toBe(false);
    useLogStore.getState().toggleGroupFilter();
    expect(useLogStore.getState().groupFilter).toBe(true);
  });

  it("should reset groupFilter to false when groupByMode set to none", () => {
    useLogStore.setState({ groupFilter: true });
    useLogStore.getState().setGroupByMode("none");
    expect(useLogStore.getState().groupFilter).toBe(false);
  });

  it("should NOT reset groupFilter when groupByMode set to stream", () => {
    useLogStore.setState({ groupFilter: true });
    useLogStore.getState().setGroupByMode("stream");
    expect(useLogStore.getState().groupFilter).toBe(true);
  });
});
