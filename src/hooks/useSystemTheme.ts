import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Returns whether dark mode should be active based on theme setting
 * Handles 'system', 'light', and 'dark' theme values
 */
export function useSystemTheme(): boolean {
  const { theme } = useSettingsStore();

  // Track system preference for theme
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Return true if dark mode should be active
  const isDark = theme === "system" ? systemPrefersDark : theme === "dark";
  return isDark;
}
