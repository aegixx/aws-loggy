import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUpdateCheck } from "./useUpdateCheck";
import { check } from "@tauri-apps/plugin-updater";
import { useSettingsStore } from "../stores/settingsStore";

vi.mock("@tauri-apps/plugin-updater");

const mockCheck = vi.mocked(check);

describe("useUpdateCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ autoUpdateEnabled: true });
  });

  it("should not check for updates when autoUpdateEnabled is false", async () => {
    useSettingsStore.setState({ autoUpdateEnabled: false });

    renderHook(() => useUpdateCheck());

    // Wait a bit to ensure no check happens
    await new Promise((r) => setTimeout(r, 100));

    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("should check for updates when autoUpdateEnabled is true", async () => {
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });

    expect(result.current.update).toBeNull();
  });

  it("should return update info when available", async () => {
    const mockUpdate = {
      available: true,
      version: "2.1.0",
      currentVersion: "2.0.2",
      body: "Release notes",
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValue(mockUpdate);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.update).not.toBeNull();
    });

    expect(result.current.update?.version).toBe("2.1.0");
  });

  it("should handle check errors gracefully", async () => {
    mockCheck.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });

    expect(result.current.update).toBeNull();
  });
});
