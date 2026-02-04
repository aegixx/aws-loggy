import { useState, useEffect, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { useSettingsStore } from "../stores/settingsStore";

export interface UseUpdateCheckResult {
  update: Update | null;
  error: string | null;
  isChecking: boolean;
  noUpdateAvailable: boolean;
  checkNow: () => Promise<void>;
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const { autoUpdateEnabled } = useSettingsStore();
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [noUpdateAvailable, setNoUpdateAvailable] = useState(false);

  const performCheck = useCallback(async (manual: boolean) => {
    setIsChecking(true);
    setError(null);
    setNoUpdateAvailable(false);

    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
      } else if (manual) {
        setNoUpdateAvailable(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update check failed");
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkNow = useCallback(() => performCheck(true), [performCheck]);

  useEffect(() => {
    if (!autoUpdateEnabled) {
      return;
    }

    // Small delay to let app initialize
    const timer = setTimeout(() => performCheck(false), 50);
    return () => clearTimeout(timer);
  }, [autoUpdateEnabled, performCheck]);

  return { update, error, isChecking, noUpdateAvailable, checkNow };
}
