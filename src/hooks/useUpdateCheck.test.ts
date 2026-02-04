import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUpdateCheck } from "./useUpdateCheck";
import { check, Update } from "@tauri-apps/plugin-updater";
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
    } as unknown as Update;
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

  it("should allow manual check via checkNow when autoUpdateEnabled is false", async () => {
    useSettingsStore.setState({ autoUpdateEnabled: false });
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    // Auto-check should not have fired
    await new Promise((r) => setTimeout(r, 100));
    expect(mockCheck).not.toHaveBeenCalled();

    // Manual check should work regardless
    await result.current.checkNow();

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("should increment noUpdateCount when manual check finds no update", async () => {
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    // Wait for auto-check to finish (does not increment noUpdateCount)
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(result.current.noUpdateCount).toBe(0);

    // Manual check with no update should increment
    await result.current.checkNow();

    await waitFor(() => {
      expect(result.current.noUpdateCount).toBe(1);
    });
  });

  it("should increment noUpdateCount on each consecutive manual check", async () => {
    useSettingsStore.setState({ autoUpdateEnabled: false });
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    await result.current.checkNow();
    await waitFor(() => {
      expect(result.current.noUpdateCount).toBe(1);
    });

    await result.current.checkNow();
    await waitFor(() => {
      expect(result.current.noUpdateCount).toBe(2);
    });
  });
});
