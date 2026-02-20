import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./FilterBar";
import { useLogStore } from "../stores/logStore";

// Mock useSystemTheme
vi.mock("../hooks/useSystemTheme", () => ({
  useSystemTheme: () => true,
}));

describe("FilterBar - Group by dropdown", () => {
  beforeEach(() => {
    useLogStore.setState({
      selectedLogGroup: "/aws/lambda/my-function",
      logs: [],
      filterText: "",
      disabledLevels: new Set(),
      isTailing: false,
      groupByMode: "none",
    });
  });

  it("should render a Group by dropdown", () => {
    render(<FilterBar />);
    expect(screen.getByTitle("Group by")).toBeDefined();
  });

  it("should show Invocation option for Lambda log groups", () => {
    render(<FilterBar />);
    const select = screen.getByTitle("Group by") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("invocation");
  });

  it("should not show Invocation option for non-Lambda log groups", () => {
    useLogStore.setState({ selectedLogGroup: "/ecs/my-service" });
    render(<FilterBar />);
    const select = screen.getByTitle("Group by") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).not.toContain("invocation");
  });
});

describe("FilterBar - Group filter toggle", () => {
  beforeEach(() => {
    useLogStore.setState({
      selectedLogGroup: "/aws/lambda/my-function",
      logs: [],
      filterText: "",
      disabledLevels: new Set(),
      isTailing: false,
      groupByMode: "stream",
      effectiveGroupByMode: "stream",
      groupFilter: true,
    });
  });

  it("should show group filter toggle when grouping is active", () => {
    render(<FilterBar />);
    expect(screen.getByTitle("Group filter ON")).toBeDefined();
  });

  it("should hide group filter toggle when grouping is none", () => {
    useLogStore.setState({ effectiveGroupByMode: "none" });
    render(<FilterBar />);
    expect(screen.queryByTitle("Group filter ON")).toBeNull();
    expect(screen.queryByTitle("Group filter OFF")).toBeNull();
  });

  it("should toggle groupFilter on click", async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    const toggle = screen.getByTitle("Group filter ON");
    await user.click(toggle);
    expect(useLogStore.getState().groupFilter).toBe(false);
  });
});
