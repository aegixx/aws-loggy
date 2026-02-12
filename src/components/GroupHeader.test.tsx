import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupHeader } from "./GroupHeader";
import type { LogGroupSection } from "../utils/groupLogs";

function createMockGroup(
  overrides: Partial<LogGroupSection> = {},
): LogGroupSection {
  return {
    id: "test-group",
    label: "test-group",
    logs: [],
    collapsed: false,
    metadata: {
      logCount: 5,
      hasError: false,
      firstTimestamp: 1000,
      lastTimestamp: 2000,
    },
    ...overrides,
  };
}

describe("GroupHeader", () => {
  it("should render group label and log count", () => {
    const group = createMockGroup({ label: "my-stream" });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("my-stream")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("should show error indicator when hasError is true", () => {
    const group = createMockGroup({
      metadata: {
        logCount: 3,
        hasError: true,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    // Error indicator should be present (red dot or text)
    const errorIndicator = screen.getByTitle("Contains errors");
    expect(errorIndicator).toBeDefined();
  });

  it("should show invocation metadata when present", () => {
    const group = createMockGroup({
      metadata: {
        logCount: 4,
        hasError: false,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
        requestId: "abc-123",
        duration: 3518.68,
        memoryUsed: 64,
        memoryAllocated: 128,
        inProgress: false,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("abc-123")).toBeDefined();
    // Duration shown as rounded seconds, tooltip has actual ms
    expect(screen.getByText("4s")).toBeDefined();
    expect(screen.getByTitle("3518.68 ms")).toBeDefined();
    // Memory shown as percentage, tooltip has actuals
    expect(screen.getByText(/50%/)).toBeDefined();
    expect(screen.getByTitle("64 / 128 MB")).toBeDefined();
  });

  it("should show in-progress badge when invocation is incomplete", () => {
    const group = createMockGroup({
      metadata: {
        logCount: 2,
        hasError: false,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
        requestId: "abc-123",
        inProgress: true,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("In progress")).toBeDefined();
  });

  it("should show start and end times for non-invocation groups", () => {
    const startTs = new Date("2025-01-15T10:30:45").getTime();
    const endTs = new Date("2025-01-15T10:35:12").getTime();
    const group = createMockGroup({
      label: "stream-group",
      metadata: {
        logCount: 10,
        hasError: false,
        firstTimestamp: startTs,
        lastTimestamp: endTs,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    const expectedStart = new Date(startTs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const expectedEnd = new Date(endTs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const timeRange = screen.getByText(
      new RegExp(`${expectedStart}.*→.*${expectedEnd}`),
    );
    expect(timeRange).toBeDefined();
  });

  it("should call onToggle when clicked", () => {
    let toggled = false;
    const group = createMockGroup();
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {
          toggled = true;
        }}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    fireEvent.click(screen.getByText("test-group"));
    expect(toggled).toBe(true);
  });

  it("should copy group logs to clipboard and show feedback when copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    const log1 = {
      timestamp: 1000,
      message: "first message",
      log_stream_name: "stream-a",
      event_id: "e1",
      level: "info" as const,
      parsedJson: null,
      formattedTime: "Jan 01, 00:00:00",
    };
    const log2 = {
      timestamp: 2000,
      message: "second message",
      log_stream_name: "stream-a",
      event_id: "e2",
      level: "info" as const,
      parsedJson: null,
      formattedTime: "Jan 01, 00:00:01",
    };
    const group = createMockGroup({ logs: [log1, log2] });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    fireEvent.click(screen.getByTitle("Copy group logs"));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("first message\nsecond message");
    });
  });

  it("should show 'x of y' when getVisibleCount returns less than total", () => {
    const group = createMockGroup({
      metadata: {
        logCount: 10,
        hasError: false,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        getVisibleCount={() => 3}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("3 of 10")).toBeDefined();
  });

  it("should show total count when all logs are visible", () => {
    const group = createMockGroup({
      metadata: {
        logCount: 5,
        hasError: false,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        getVisibleCount={() => 5}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("5")).toBeDefined();
  });

  it("should show init duration for cold start groups", () => {
    const group = createMockGroup({
      label: "Init",
      metadata: {
        logCount: 3,
        hasError: false,
        firstTimestamp: 900,
        lastTimestamp: 990,
        initDuration: 3693.9,
      },
    });
    render(
      <GroupHeader
        group={group}
        collapsed={false}
        onToggle={() => {}}
        isDark={true}
        style={{ height: 32, top: 0, position: "absolute", width: "100%" }}
      />,
    );
    expect(screen.getByText("Init")).toBeDefined();
    expect(screen.getByText("4s")).toBeDefined();
    expect(screen.getByTitle("3693.90 ms")).toBeDefined();
  });
});
