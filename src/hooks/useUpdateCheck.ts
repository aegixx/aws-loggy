import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { useSettingsStore } from "../stores/settingsStore";

export interface UseUpdateCheckResult {
  update: Update | null;
  error: string | null;
  isChecking: boolean;
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const { autoUpdateEnabled } = useSettingsStore();
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!autoUpdateEnabled) {
      return;
    }

    const checkForUpdates = async () => {
      setIsChecking(true);
      setError(null);

      try {
        const result = await check();
        if (result?.available) {
          setUpdate(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update check failed");
      } finally {
        setIsChecking(false);
      }
    };

    // Small delay to let app initialize
    const timer = setTimeout(checkForUpdates, 50);
    return () => clearTimeout(timer);
  }, [autoUpdateEnabled]);

  return { update, error, isChecking };
}
