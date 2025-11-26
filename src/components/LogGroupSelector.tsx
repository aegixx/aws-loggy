import { useState, useEffect } from "react";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore } from "../stores/settingsStore";

export function LogGroupSelector() {
  const {
    logGroups,
    selectedLogGroup,
    selectLogGroup,
    isConnected,
    connectionError,
  } = useLogStore();
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

  const isDark = theme === "system" ? systemPrefersDark : theme === "dark";

  if (!isConnected) {
    return (
      <div className="p-4 text-center">
        {connectionError ? (
          <div className={isDark ? "text-red-400" : "text-red-600"}>
            <p className="font-semibold">Connection Error</p>
            <p className="text-sm mt-1 select-text cursor-text">
              {connectionError}
            </p>
          </div>
        ) : (
          <p className={isDark ? "text-gray-400" : "text-gray-600"}>
            Connecting to AWS...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="log-group"
        className={`text-sm whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}
      >
        Log Group:
      </label>
      <select
        id="log-group"
        value={selectedLogGroup ?? ""}
        onChange={(e) => selectLogGroup(e.target.value)}
        className={`flex-1 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-300"}`}
      >
        <option value="">Select a log group...</option>
        {logGroups.map((group) => (
          <option key={group.name} value={group.name}>
            {group.name}
          </option>
        ))}
      </select>
    </div>
  );
}
