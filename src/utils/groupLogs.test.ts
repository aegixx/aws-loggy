import { describe, it, expect } from "vitest";
import { groupLogsByStream, groupLogsByInvocation } from "./groupLogs";
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

describe("groupLogsByStream", () => {
  it("should group logs by log_stream_name", () => {
    const logs = [
      createMockLog("msg1", { log_stream_name: "stream-a", timestamp: 1000 }),
      createMockLog("msg2", { log_stream_name: "stream-b", timestamp: 2000 }),
      createMockLog("msg3", { log_stream_name: "stream-a", timestamp: 3000 }),
    ];
    const groups = groupLogsByStream(logs);
    expect(groups).toHaveLength(2);
    expect(groups[0].id).toBe("stream-a");
    expect(groups[0].logs).toHaveLength(2);
    expect(groups[1].id).toBe("stream-b");
    expect(groups[1].logs).toHaveLength(1);
  });

  it("should sort groups by most recent activity (descending)", () => {
    const logs = [
      createMockLog("old", { log_stream_name: "stream-a", timestamp: 1000 }),
      createMockLog("new", { log_stream_name: "stream-b", timestamp: 5000 }),
    ];
    const groups = groupLogsByStream(logs);
    expect(groups[0].id).toBe("stream-b");
    expect(groups[1].id).toBe("stream-a");
  });

  it("should set metadata correctly", () => {
    const logs = [
      createMockLog("msg1", {
        log_stream_name: "stream-a",
        timestamp: 1000,
        level: "info",
      }),
      createMockLog("msg2", {
        log_stream_name: "stream-a",
        timestamp: 2000,
        level: "error",
      }),
    ];
    const groups = groupLogsByStream(logs);
    expect(groups[0].metadata.logCount).toBe(2);
    expect(groups[0].metadata.hasError).toBe(true);
    expect(groups[0].metadata.firstTimestamp).toBe(1000);
    expect(groups[0].metadata.lastTimestamp).toBe(2000);
  });

  it("should handle logs with null log_stream_name", () => {
    const logs = [createMockLog("msg1", { log_stream_name: null })];
    const groups = groupLogsByStream(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("(unknown stream)");
  });
});

describe("groupLogsByInvocation", () => {
  it("should group logs by Lambda invocation START/END markers", () => {
    const logs = [
      createMockLog("START RequestId: abc-123 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "2024/01/01/[$LATEST]abc",
      }),
      createMockLog("Processing event...", {
        timestamp: 1001,
        log_stream_name: "2024/01/01/[$LATEST]abc",
      }),
      createMockLog("END RequestId: abc-123", {
        timestamp: 1002,
        log_stream_name: "2024/01/01/[$LATEST]abc",
      }),
      createMockLog(
        "REPORT RequestId: abc-123\tDuration: 45.67 ms\tBilled Duration: 46 ms\tMemory Size: 128 MB\tMax Memory Used: 64 MB",
        {
          timestamp: 1003,
          log_stream_name: "2024/01/01/[$LATEST]abc",
        },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].metadata.requestId).toBe("abc-123");
    expect(groups[0].metadata.duration).toBe(45.67);
    expect(groups[0].metadata.billedDuration).toBe(46);
    expect(groups[0].metadata.memoryUsed).toBe(64);
    expect(groups[0].metadata.memoryAllocated).toBe(128);
    expect(groups[0].metadata.inProgress).toBe(false);
    expect(groups[0].logs).toHaveLength(4);
  });

  it("should mark in-progress invocations (START without REPORT)", () => {
    const logs = [
      createMockLog("START RequestId: abc-123 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "2024/01/01/[$LATEST]abc",
      }),
      createMockLog("Processing...", {
        timestamp: 1001,
        log_stream_name: "2024/01/01/[$LATEST]abc",
      }),
    ];
    const groups = groupLogsByInvocation(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].metadata.inProgress).toBe(true);
    expect(groups[0].metadata.duration).toBeUndefined();
  });

  it("should handle multiple invocations in same stream", () => {
    const logs = [
      createMockLog("START RequestId: req-1 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: req-1\tDuration: 10 ms\tBilled Duration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 50 MB",
        { timestamp: 1001, log_stream_name: "stream-a" },
      ),
      createMockLog("START RequestId: req-2 Version: $LATEST", {
        timestamp: 2000,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: req-2\tDuration: 20 ms\tBilled Duration: 20 ms\tMemory Size: 128 MB\tMax Memory Used: 60 MB",
        { timestamp: 2001, log_stream_name: "stream-a" },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    expect(groups).toHaveLength(2);
    expect(groups[0].metadata.requestId).toBe("req-2");
    expect(groups[1].metadata.requestId).toBe("req-1");
  });

  it("should put orphan logs (no START marker) in an ungrouped section", () => {
    const logs = [
      createMockLog("random log without START", {
        timestamp: 500,
        log_stream_name: "stream-a",
      }),
      createMockLog("START RequestId: abc-123 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "stream-a",
      }),
      createMockLog("END RequestId: abc-123", {
        timestamp: 1001,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: abc-123\tDuration: 10 ms\tBilled Duration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 50 MB",
        { timestamp: 1002, log_stream_name: "stream-a" },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    // Should have the invocation group + orphan group
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const orphanGroup = groups.find((g) => g.id.includes("ungrouped"));
    expect(orphanGroup).toBeDefined();
    expect(orphanGroup!.logs).toHaveLength(1);
  });

  it("should group cold start init logs into an Init group", () => {
    const logs = [
      createMockLog(
        "[AWS Parameters and Secrets Lambda Extension] Log level set to warn.",
        { timestamp: 900, log_stream_name: "stream-a" },
      ),
      createMockLog(
        "EXTENSION Name: aws-parameters-and-secrets-extension State: Ready Events: [INVOKE, SHUTDOWN]",
        { timestamp: 950, log_stream_name: "stream-a" },
      ),
      createMockLog("INIT_REPORT Init Duration: 3693.90 ms", {
        timestamp: 990,
        log_stream_name: "stream-a",
      }),
      createMockLog("START RequestId: abc-123 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "stream-a",
      }),
      createMockLog("END RequestId: abc-123", {
        timestamp: 1001,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: abc-123\tDuration: 10 ms\tBilled Duration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 50 MB",
        { timestamp: 1002, log_stream_name: "stream-a" },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    const initGroup = groups.find((g) => g.label === "Init");
    expect(initGroup).toBeDefined();
    expect(initGroup!.logs).toHaveLength(3);
    expect(initGroup!.metadata.initDuration).toBe(3693.9);
    const invGroup = groups.find((g) => g.metadata.requestId === "abc-123");
    expect(invGroup).toBeDefined();
  });

  it("should handle multiple cold starts across a time window", () => {
    const logs = [
      // First cold start
      createMockLog("INIT_REPORT Init Duration: 2000.00 ms", {
        timestamp: 900,
        log_stream_name: "stream-a",
      }),
      createMockLog("START RequestId: req-1 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: req-1\tDuration: 10 ms\tBilled Duration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 50 MB",
        { timestamp: 1001, log_stream_name: "stream-a" },
      ),
      // Second cold start (new container)
      createMockLog("INIT_REPORT Init Duration: 1500.00 ms", {
        timestamp: 5000,
        log_stream_name: "stream-a",
      }),
      createMockLog("START RequestId: req-2 Version: $LATEST", {
        timestamp: 5500,
        log_stream_name: "stream-a",
      }),
      createMockLog(
        "REPORT RequestId: req-2\tDuration: 20 ms\tBilled Duration: 20 ms\tMemory Size: 128 MB\tMax Memory Used: 60 MB",
        { timestamp: 5501, log_stream_name: "stream-a" },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    const initGroups = groups.filter((g) => g.label === "Init");
    expect(initGroups).toHaveLength(2);
    expect(initGroups[0].metadata.initDuration).toBe(1500.0);
    expect(initGroups[1].metadata.initDuration).toBe(2000.0);
  });

  it("should keep init logs at end of window when no START follows", () => {
    const logs = [
      createMockLog(
        "[AWS Parameters and Secrets Lambda Extension] Initializing...",
        { timestamp: 9000, log_stream_name: "stream-a" },
      ),
      createMockLog("INIT_REPORT Init Duration: 1000.00 ms", {
        timestamp: 9500,
        log_stream_name: "stream-a",
      }),
    ];
    const groups = groupLogsByInvocation(logs);
    const initGroup = groups.find((g) => g.label === "Init");
    expect(initGroup).toBeDefined();
    expect(initGroup!.logs).toHaveLength(2);
    expect(initGroup!.metadata.initDuration).toBe(1000.0);
  });

  it("should detect errors within invocations", () => {
    const logs = [
      createMockLog("START RequestId: abc-123 Version: $LATEST", {
        timestamp: 1000,
        log_stream_name: "stream-a",
      }),
      createMockLog("ERROR: something broke", {
        timestamp: 1001,
        log_stream_name: "stream-a",
        level: "error",
      }),
      createMockLog(
        "REPORT RequestId: abc-123\tDuration: 10 ms\tBilled Duration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 50 MB",
        { timestamp: 1002, log_stream_name: "stream-a" },
      ),
    ];
    const groups = groupLogsByInvocation(logs);
    expect(groups[0].metadata.hasError).toBe(true);
  });
});
