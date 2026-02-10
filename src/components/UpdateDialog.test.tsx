import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { UpdateDialog } from "./UpdateDialog";
import { useSettingsStore } from "../stores/settingsStore";

// Mock the hooks
vi.mock("../hooks/useSystemTheme", () => ({
  useSystemTheme: () => true, // dark mode
}));

const mockUpdate = {
  version: "2.1.0",
  currentVersion: "2.0.2",
  body: "Release notes here",
  downloadAndInstall: vi.fn(() => Promise.resolve()),
};

describe("UpdateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ autoUpdateEnabled: true });
  });

  it("should not render when isOpen is false", () => {
    render(
      <UpdateDialog isOpen={false} onClose={vi.fn()} update={mockUpdate} />,
    );

    expect(screen.queryByText("Update Available")).not.toBeInTheDocument();
  });

  it("should render version info when open", () => {
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={mockUpdate} />,
    );

    expect(screen.getByText("Update Available")).toBeInTheDocument();
    expect(screen.getByText(/2\.0\.2/)).toBeInTheDocument();
    expect(screen.getByText(/2\.1\.0/)).toBeInTheDocument();
  });

  it("should call onClose when Skip is clicked", () => {
    const onClose = vi.fn();
    render(
      <UpdateDialog isOpen={true} onClose={onClose} update={mockUpdate} />,
    );

    fireEvent.click(screen.getByText("Skip"));

    expect(onClose).toHaveBeenCalled();
  });

  it("should disable auto-updates when checkbox is checked", () => {
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={mockUpdate} />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(useSettingsStore.getState().autoUpdateEnabled).toBe(false);
  });

  it("should show Update Now and Skip buttons", () => {
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={mockUpdate} />,
    );

    expect(screen.getByText("Update Now")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("should render changelog body as markdown", () => {
    const updateWithBody = {
      ...mockUpdate,
      body: "### Bug Fixes\n\n* Fixed a crash on startup",
    };
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={updateWithBody} />,
    );

    expect(screen.getByText("Bug Fixes")).toBeInTheDocument();
    expect(screen.getByText(/Fixed a crash on startup/)).toBeInTheDocument();
  });

  it("should not render changelog section when body is empty", () => {
    const updateNoBody = {
      ...mockUpdate,
      body: "",
    };
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={updateNoBody} />,
    );

    expect(screen.queryByText("Bug Fixes")).not.toBeInTheDocument();
  });

  it("should not render changelog section when body is undefined", () => {
    const updateUndefinedBody = {
      version: "2.1.0",
      currentVersion: "2.0.2",
      body: undefined,
      downloadAndInstall: vi.fn(() => Promise.resolve()),
    };
    render(
      <UpdateDialog
        isOpen={true}
        onClose={vi.fn()}
        update={updateUndefinedBody}
      />,
    );

    // Changelog section should not be rendered
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    // But the release notes link should still be present
    expect(
      screen.getByText("View Release Notes on GitHub"),
    ).toBeInTheDocument();
  });

  it("should always show View Release Notes link", () => {
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={mockUpdate} />,
    );

    expect(
      screen.getByText("View Release Notes on GitHub"),
    ).toBeInTheDocument();
  });

  it("should open release URL when View Release Notes is clicked", () => {
    render(
      <UpdateDialog isOpen={true} onClose={vi.fn()} update={mockUpdate} />,
    );

    fireEvent.click(screen.getByText("View Release Notes on GitHub"));

    expect(openUrl).toHaveBeenCalledWith(
      "https://github.com/aegixx/aws-loggy/releases/tag/v2.1.0",
    );
  });
});
