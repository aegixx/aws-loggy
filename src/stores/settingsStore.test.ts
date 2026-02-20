import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore, DEFAULT_TIME_PRESETS } from "./settingsStore";

describe("settingsStore - autoUpdateEnabled", () => {
  beforeEach(() => {
    // Reset store to initial state
    useSettingsStore.setState({
      autoUpdateEnabled: true,
    });
  });

  it("should default autoUpdateEnabled to true", () => {
    const { autoUpdateEnabled } = useSettingsStore.getState();
    expect(autoUpdateEnabled).toBe(true);
  });

  it("should update autoUpdateEnabled via setAutoUpdateEnabled", () => {
    const { setAutoUpdateEnabled } = useSettingsStore.getState();

    setAutoUpdateEnabled(false);

    expect(useSettingsStore.getState().autoUpdateEnabled).toBe(false);
  });

  it("should toggle autoUpdateEnabled", () => {
    const store = useSettingsStore.getState();

    store.setAutoUpdateEnabled(false);
    expect(useSettingsStore.getState().autoUpdateEnabled).toBe(false);

    store.setAutoUpdateEnabled(true);
    expect(useSettingsStore.getState().autoUpdateEnabled).toBe(true);
  });
});

describe("settingsStore - persistedGroupFilter", () => {
  it("should default persistedGroupFilter to true", () => {
    const { persistedGroupFilter } = useSettingsStore.getState();
    expect(persistedGroupFilter).toBe(true);
  });

  it("should update persistedGroupFilter via setPersistedGroupFilter", () => {
    useSettingsStore.getState().setPersistedGroupFilter(false);
    expect(useSettingsStore.getState().persistedGroupFilter).toBe(false);
    useSettingsStore.getState().setPersistedGroupFilter(true);
    expect(useSettingsStore.getState().persistedGroupFilter).toBe(true);
  });
});

describe("settingsStore - timePresets", () => {
  beforeEach(() => {
    useSettingsStore.setState({ timePresets: null });
  });

  it("should default timePresets to null (uses DEFAULT_TIME_PRESETS)", () => {
    const { timePresets } = useSettingsStore.getState();
    expect(timePresets).toBeNull();
  });

  it("should expose DEFAULT_TIME_PRESETS with 5 entries", () => {
    expect(DEFAULT_TIME_PRESETS).toHaveLength(5);
    expect(DEFAULT_TIME_PRESETS[0]).toEqual({
      label: "15m",
      ms: 15 * 60 * 1000,
    });
    expect(DEFAULT_TIME_PRESETS[4]).toEqual({
      label: "7d",
      ms: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it("should set timePresets via setTimePresets", () => {
    const custom = [{ label: "30m", ms: 30 * 60 * 1000 }];
    useSettingsStore.getState().setTimePresets(custom);
    expect(useSettingsStore.getState().timePresets).toEqual(custom);
  });

  it("should add a time preset via addTimePreset", () => {
    useSettingsStore.getState().setTimePresets([{ label: "1h", ms: 3600000 }]);
    useSettingsStore.getState().addTimePreset();
    const presets = useSettingsStore.getState().timePresets!;
    expect(presets).toHaveLength(2);
    expect(presets[1]).toEqual({ label: "5m", ms: 5 * 60 * 1000 });
  });

  it("should not add beyond MAX_TIME_PRESETS", () => {
    useSettingsStore.getState().setTimePresets([...DEFAULT_TIME_PRESETS]);
    useSettingsStore.getState().addTimePreset();
    expect(useSettingsStore.getState().timePresets).toHaveLength(5);
  });

  it("should remove a time preset via removeTimePreset", () => {
    useSettingsStore.getState().setTimePresets([...DEFAULT_TIME_PRESETS]);
    useSettingsStore.getState().removeTimePreset(0);
    const presets = useSettingsStore.getState().timePresets!;
    expect(presets).toHaveLength(4);
    expect(presets[0].label).toBe("1h");
  });

  it("should not remove when only 1 preset remains", () => {
    useSettingsStore.getState().setTimePresets([{ label: "1h", ms: 3600000 }]);
    useSettingsStore.getState().removeTimePreset(0);
    expect(useSettingsStore.getState().timePresets).toHaveLength(1);
  });

  it("should update a time preset via updateTimePreset", () => {
    useSettingsStore.getState().setTimePresets([...DEFAULT_TIME_PRESETS]);
    useSettingsStore
      .getState()
      .updateTimePreset(0, { label: "20m", ms: 20 * 60 * 1000 });
    expect(useSettingsStore.getState().timePresets![0]).toEqual({
      label: "20m",
      ms: 20 * 60 * 1000,
    });
  });

  it("should move a time preset via moveTimePreset", () => {
    useSettingsStore.getState().setTimePresets([...DEFAULT_TIME_PRESETS]);
    useSettingsStore.getState().moveTimePreset(0, "down");
    const presets = useSettingsStore.getState().timePresets!;
    expect(presets[0].label).toBe("1h");
    expect(presets[1].label).toBe("15m");
  });

  it("should not move first preset up or last preset down", () => {
    useSettingsStore.getState().setTimePresets([...DEFAULT_TIME_PRESETS]);
    useSettingsStore.getState().moveTimePreset(0, "up");
    expect(useSettingsStore.getState().timePresets![0].label).toBe("15m");

    useSettingsStore.getState().moveTimePreset(4, "down");
    expect(useSettingsStore.getState().timePresets![4].label).toBe("7d");
  });

  it("should reset time presets to defaults via resetTimePresets", () => {
    useSettingsStore
      .getState()
      .setTimePresets([{ label: "99h", ms: 99 * 3600000 }]);
    useSettingsStore.getState().resetTimePresets();
    expect(useSettingsStore.getState().timePresets).toBeNull();
  });
});
