import { describe, it, expect, beforeEach } from "vitest";
import { useLogStore } from "./logStore";
import type { ParsedLogEvent } from "../types";

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
