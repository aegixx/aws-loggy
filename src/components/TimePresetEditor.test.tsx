import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimePresetEditor } from "./TimePresetEditor";
import {
  useSettingsStore,
  DEFAULT_TIME_PRESETS,
} from "../stores/settingsStore";

describe("TimePresetEditor", () => {
  beforeEach(() => {
    useSettingsStore.setState({ timePresets: null });
  });

  it("should render default presets when timePresets is null", () => {
    render(<TimePresetEditor />);
    // Should show all 5 default presets
    expect(screen.getAllByRole("spinbutton")).toHaveLength(5); // duration inputs
  });

  it("should render custom presets from store", () => {
    useSettingsStore.setState({
      timePresets: [
        { id: "test-30m", label: "30m", ms: 30 * 60 * 1000 },
        { id: "test-2h", label: "2h", ms: 2 * 60 * 60 * 1000 },
      ],
    });
    render(<TimePresetEditor />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("should show Add Preset button when under limit", () => {
    useSettingsStore.setState({
      timePresets: [{ id: "test-1h", label: "1h", ms: 3600000 }],
    });
    render(<TimePresetEditor />);
    const addBtn = screen.getByText("Add Preset");
    expect(addBtn).not.toBeDisabled();
  });

  it("should disable Add Preset button at max presets", () => {
    useSettingsStore.setState({ timePresets: [...DEFAULT_TIME_PRESETS] });
    render(<TimePresetEditor />);
    const addBtn = screen.getByText("Add Preset");
    expect(addBtn).toBeDisabled();
  });

  it("should show Reset to Defaults link", () => {
    render(<TimePresetEditor />);
    expect(screen.getByText("Reset to Defaults")).toBeInTheDocument();
  });

  it("should call resetTimePresets when Reset to Defaults is clicked", () => {
    useSettingsStore.setState({
      timePresets: [{ id: "test-99h", label: "99h", ms: 99 * 3600000 }],
    });
    render(<TimePresetEditor />);
    fireEvent.click(screen.getByText("Reset to Defaults"));
    expect(useSettingsStore.getState().timePresets).toBeNull();
  });

  it("should remove a preset when delete is clicked", () => {
    useSettingsStore.setState({
      timePresets: [
        { id: "test-15m", label: "15m", ms: 900000 },
        { id: "test-1h", label: "1h", ms: 3600000 },
      ],
    });
    render(<TimePresetEditor />);
    const deleteButtons = screen.getAllByTitle("Remove preset");
    fireEvent.click(deleteButtons[0]);
    expect(useSettingsStore.getState().timePresets).toHaveLength(1);
    expect(useSettingsStore.getState().timePresets![0].label).toBe("1h");
  });
});
