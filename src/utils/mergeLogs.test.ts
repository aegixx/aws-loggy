import { describe, it, expect } from "vitest";
import {
  makeEventKey,
  mergePanelLogs,
  buildEventKeyMap,
  appendToMergedRefs,
} from "./mergeLogs";
import type { ParsedLogEvent } from "../types";

function makLog(
  timestamp: number,
  message: string,
  stream: string | null = "stream-1",
): ParsedLogEvent {
  return {
    timestamp,
    message,
    log_stream_name: stream,
    event_id: null,
    level: "info",
    parsedJson: null,
    formattedTime: new Date(timestamp).toISOString(),
  };
}

describe("makeEventKey", () => {
  it("creates stable key from timestamp, stream, and index", () => {
    const log = makLog(1000, "hello", "my-stream");
    expect(makeEventKey(log, 0)).toBe("1000|my-stream|0");
    expect(makeEventKey(log, 5)).toBe("1000|my-stream|5");
  });

  it("handles null stream name", () => {
    const log = makLog(2000, "test", null);
    expect(makeEventKey(log, 0)).toBe("2000||0");
  });
});

describe("mergePanelLogs", () => {
  it("returns empty array for no panels", () => {
    const result = mergePanelLogs(new Map());
    expect(result).toEqual([]);
  });

  it("returns single panel logs unchanged", () => {
    const logs = [makLog(100, "a"), makLog(200, "b"), makLog(300, "c")];
    const panelLogs = new Map([["p1", logs]]);
    const result = mergePanelLogs(panelLogs);

    expect(result).toHaveLength(3);
    expect(result[0].panelId).toBe("p1");
    expect(result[0].timestamp).toBe(100);
    expect(result[2].timestamp).toBe(300);
  });

  it("merges two panels chronologically", () => {
    const logsA = [makLog(100, "a1"), makLog(300, "a2"), makLog(500, "a3")];
    const logsB = [makLog(200, "b1"), makLog(400, "b2")];
    const panelLogs = new Map([
      ["pA", logsA],
      ["pB", logsB],
    ]);
    const result = mergePanelLogs(panelLogs);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.timestamp)).toEqual([100, 200, 300, 400, 500]);
    expect(result.map((r) => r.panelId)).toEqual([
      "pA",
      "pB",
      "pA",
      "pB",
      "pA",
    ]);
  });

  it("handles equal timestamps (stable ordering)", () => {
    const logsA = [makLog(100, "a1")];
    const logsB = [makLog(100, "b1")];
    const panelLogs = new Map([
      ["pA", logsA],
      ["pB", logsB],
    ]);
    const result = mergePanelLogs(panelLogs);

    expect(result).toHaveLength(2);
    // Both have timestamp 100, first panel's entry comes first
    expect(result[0].panelId).toBe("pA");
    expect(result[1].panelId).toBe("pB");
  });

  it("merges three panels", () => {
    const logsA = [makLog(100, "a"), makLog(400, "a")];
    const logsB = [makLog(200, "b")];
    const logsC = [makLog(300, "c"), makLog(500, "c")];
    const panelLogs = new Map([
      ["pA", logsA],
      ["pB", logsB],
      ["pC", logsC],
    ]);
    const result = mergePanelLogs(panelLogs);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.timestamp)).toEqual([100, 200, 300, 400, 500]);
  });

  it("handles empty panel logs", () => {
    const logsA = [makLog(100, "a")];
    const panelLogs = new Map([
      ["pA", logsA],
      ["pB", []],
    ]);
    const result = mergePanelLogs(panelLogs);

    expect(result).toHaveLength(1);
    expect(result[0].panelId).toBe("pA");
  });
});

describe("buildEventKeyMap", () => {
  it("builds lookup map from panel logs", () => {
    const logA = makLog(100, "hello");
    const logB = makLog(200, "world");
    const panelLogs = new Map([
      ["p1", [logA]],
      ["p2", [logB]],
    ]);
    const map = buildEventKeyMap(panelLogs);

    expect(map.size).toBe(2);
    expect(map.get(`p1:${makeEventKey(logA, 0)}`)).toBe(logA);
    expect(map.get(`p2:${makeEventKey(logB, 0)}`)).toBe(logB);
  });
});

describe("appendToMergedRefs", () => {
  it("fast-path appends in-order logs", () => {
    const existing = [
      { panelId: "p1", eventKey: "p1:100|s|0", timestamp: 100 },
      { panelId: "p1", eventKey: "p1:200|s|1", timestamp: 200 },
    ];
    const newLogs = [makLog(300, "new1"), makLog(400, "new2")];
    const { refs, fastPath } = appendToMergedRefs(existing, "p1", newLogs, 2);

    expect(fastPath).toBe(true);
    expect(refs).toHaveLength(4);
    expect(refs[2].timestamp).toBe(300);
    expect(refs[3].timestamp).toBe(400);
  });

  it("signals full re-merge needed for out-of-order logs", () => {
    const existing = [
      { panelId: "p1", eventKey: "p1:200|s|0", timestamp: 200 },
    ];
    const newLogs = [makLog(100, "old")];
    const { refs, fastPath } = appendToMergedRefs(existing, "p1", newLogs, 1);

    expect(fastPath).toBe(false);
    // Returns existing unchanged — caller should do full re-merge
    expect(refs).toBe(existing);
  });

  it("handles empty new logs", () => {
    const existing = [
      { panelId: "p1", eventKey: "p1:100|s|0", timestamp: 100 },
    ];
    const { refs, fastPath } = appendToMergedRefs(existing, "p1", [], 1);

    expect(fastPath).toBe(true);
    expect(refs).toBe(existing);
  });

  it("handles empty existing refs", () => {
    const newLogs = [makLog(100, "first")];
    const { refs, fastPath } = appendToMergedRefs([], "p1", newLogs, 0);

    expect(fastPath).toBe(true);
    expect(refs).toHaveLength(1);
    expect(refs[0].timestamp).toBe(100);
  });
});
