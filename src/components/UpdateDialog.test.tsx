import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
