import { useState, useEffect, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { useSettingsStore } from "../stores/settingsStore";

export interface UseUpdateCheckResult {
  update: Update | null;
  error: string | null;
  isChecking: boolean;
  noUpdateCount: number;
  checkNow: () => Promise<void>;
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const { autoUpdateEnabled } = useSettingsStore();
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [noUpdateCount, setNoUpdateCount] = useState(0);

  const performCheck = useCallback(async (manual: boolean) => {
    setIsChecking(true);
    setError(null);

    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
      } else if (manual) {
        setNoUpdateCount((c) => c + 1);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Update check failed";
      setError(message);
      console.error("[Update Check] Failed:", message);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkNow = useCallback(() => performCheck(true), [performCheck]);

  useEffect(() => {
    if (!autoUpdateEnabled || import.meta.env.DEV) {
      return;
    }

    // Small delay to let app initialize
    const timer = setTimeout(() => performCheck(false), 50);
    return () => clearTimeout(timer);
  }, [autoUpdateEnabled, performCheck]);

  return { update, error, isChecking, noUpdateCount, checkNow };
}
