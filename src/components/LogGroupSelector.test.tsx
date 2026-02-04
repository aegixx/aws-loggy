import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogGroupSelector } from "./LogGroupSelector";
import { useLogStore } from "../stores/logStore";

// Mock useSystemTheme
vi.mock("../hooks/useSystemTheme", () => ({
  useSystemTheme: () => false, // light mode
}));

const MOCK_LOG_GROUPS = [
  { name: "/aws/lambda/user-service", arn: null, stored_bytes: null },
  { name: "/aws/lambda/payment-handler", arn: null, stored_bytes: null },
  {
    name: "/aws/lambda/notification-worker",
    arn: null,
    stored_bytes: null,
  },
  { name: "/aws/ecs/api-gateway", arn: null, stored_bytes: null },
  { name: "/aws/ecs/web-frontend", arn: null, stored_bytes: null },
];

function setStoreState(overrides: Record<string, unknown> = {}) {
  useLogStore.setState({
    logGroups: MOCK_LOG_GROUPS,
    selectedLogGroup: null,
    isConnected: true,
    connectionError: null,
    ...overrides,
  });
}

describe("LogGroupSelector", () => {
  beforeEach(() => {
    setStoreState();
  });

  it("should render with placeholder when no group selected", () => {
    render(<LogGroupSelector />);
    const input = screen.getByPlaceholderText("Search log groups...");
    expect(input).toBeInTheDocument();
  });

  it("should show selected log group name when one is selected", () => {
    setStoreState({ selectedLogGroup: "/aws/lambda/user-service" });
    render(<LogGroupSelector />);
    const input = screen.getByDisplayValue("/aws/lambda/user-service");
    expect(input).toBeInTheDocument();
  });

  it("should show connecting placeholder when not connected", () => {
    setStoreState({ isConnected: false });
    render(<LogGroupSelector />);
    expect(screen.getByPlaceholderText("Connecting...")).toBeInTheDocument();
  });

  it("should show not connected placeholder on connection error", () => {
    setStoreState({ isConnected: false, connectionError: "timeout" });
    render(<LogGroupSelector />);
    expect(screen.getByPlaceholderText("Not connected")).toBeInTheDocument();
  });

  it("should be disabled when not connected", () => {
    setStoreState({ isConnected: false });
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("should open dropdown on focus and show all groups", async () => {
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);

    for (const group of MOCK_LOG_GROUPS) {
      expect(screen.getByText(group.name)).toBeInTheDocument();
    }
  });

  it("should filter groups with fuzzy search", async () => {
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    await userEvent.type(input, "user");

    expect(screen.getByText("/aws/lambda/user-service")).toBeInTheDocument();
    expect(
      screen.queryByText("/aws/lambda/payment-handler"),
    ).not.toBeInTheDocument();
  });

  it("should support space-separated AND search terms", async () => {
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    await userEvent.type(input, "lambda pay");

    expect(screen.getByText("/aws/lambda/payment-handler")).toBeInTheDocument();
    expect(screen.queryByText("/aws/ecs/api-gateway")).not.toBeInTheDocument();
  });

  it("should show no results message for unmatched search", async () => {
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    await userEvent.type(input, "zzzznonexistent");

    expect(screen.getByText("No matching log groups")).toBeInTheDocument();
  });

  it("should select group on click", async () => {
    const selectLogGroup = vi.fn();
    useLogStore.setState({ selectLogGroup });

    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    await userEvent.click(screen.getByText("/aws/lambda/payment-handler"));

    expect(selectLogGroup).toHaveBeenCalledWith("/aws/lambda/payment-handler");
  });

  it("should select highlighted group on Enter", async () => {
    const selectLogGroup = vi.fn();
    useLogStore.setState({ selectLogGroup });

    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    // Arrow down to second item, then Enter
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(selectLogGroup).toHaveBeenCalledWith(MOCK_LOG_GROUPS[1].name);
  });

  it("should close dropdown on Escape", async () => {
    render(<LogGroupSelector />);
    const input = screen.getByRole("textbox");

    await userEvent.click(input);
    expect(screen.getByText(MOCK_LOG_GROUPS[0].name)).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(MOCK_LOG_GROUPS[0].name)).not.toBeInTheDocument();
  });
});
