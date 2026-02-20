import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeRangePicker } from "./TimeRangePicker";
import { useSettingsStore } from "../stores/settingsStore";
import { useLogStore } from "../stores/logStore";

// Mock useSystemTheme
vi.mock("../hooks/useSystemTheme", () => ({
  useSystemTheme: () => true,
}));

describe("TimeRangePicker - custom presets", () => {
  beforeEach(() => {
    useSettingsStore.setState({ timePresets: null });
    useLogStore.setState({ selectedLogGroup: "test-group" });
  });

  it("should render default preset labels when timePresets is null", () => {
    render(<TimeRangePicker />);
    expect(screen.getByText("15m")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(screen.getByText("6h")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
  });

  it("should render custom preset labels from store", () => {
    useSettingsStore.setState({
      timePresets: [
        { id: "test-30m", label: "30m", ms: 30 * 60 * 1000 },
        { id: "test-2h", label: "2h", ms: 2 * 60 * 60 * 1000 },
      ],
    });
    render(<TimeRangePicker />);
    expect(screen.getByText("30m")).toBeInTheDocument();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.queryByText("15m")).not.toBeInTheDocument();
  });
});
