import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "./settingsStore";

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
