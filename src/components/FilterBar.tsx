import { useState, useEffect } from "react";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore, getSortedLogLevels } from "../stores/settingsStore";
import { TimeRangePicker } from "./TimeRangePicker";
import type { LogLevel } from "../types";

export function FilterBar() {
  const {
    filterText,
    setFilterText,
    disabledLevels,
    toggleLevel,
    isTailing,
    clearLogs,
    logs,
    filteredLogs,
  } = useLogStore();
  const { theme, logLevels } = useSettingsStore();
  const sortedLevels = getSortedLogLevels(logLevels);

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

  // Count logs by level
  const levelCounts = logs.reduce(
    (acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    },
    {} as Record<LogLevel, number>,
  );

  return (
    <div
      className={`flex flex-col gap-2 p-3 border-b ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-300"}`}
    >
      {/* Top row: Filter input and actions */}
      <div className="flex items-center gap-3">
        {/* Filter input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs... (use field:value for JSON fields)"
            className={`w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 ${isDark ? "bg-gray-900 border border-gray-700 placeholder-gray-500" : "bg-white border border-gray-300 placeholder-gray-400"}`}
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>

        {/* Log count */}
        <div
          className={`text-sm whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}
        >
          {filteredLogs.length !== logs.length ? (
            <span>
              {filteredLogs.length.toLocaleString()} /{" "}
              {logs.length.toLocaleString()}
            </span>
          ) : (
            <span>{logs.length.toLocaleString()} logs</span>
          )}
        </div>

        {/* Time range picker */}
        <TimeRangePicker />

        {/* Clear button */}
        <button
          onClick={clearLogs}
          disabled={logs.length === 0}
          className={`px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed rounded ${isDark ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
        >
          Clear
        </button>

        {/* Tail indicator */}
        {isTailing && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Streaming
          </div>
        )}
      </div>

      {/* Bottom row: Level toggles */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs mr-1 ${isDark ? "text-gray-500" : "text-gray-600"}`}
        >
          Levels:
        </span>
        {sortedLevels.map((levelConfig) => {
          const count = levelCounts[levelConfig.id] || 0;
          const isEnabled = !disabledLevels.has(levelConfig.id);

          return (
            <button
              key={levelConfig.id}
              onClick={() => toggleLevel(levelConfig.id)}
              className="px-2 py-0.5 text-xs rounded border transition-all"
              style={
                isEnabled
                  ? {
                      color: levelConfig.style.textColor,
                      backgroundColor: levelConfig.style.backgroundColor,
                      borderColor: levelConfig.style.textColor + "80",
                    }
                  : isDark
                    ? {
                        color: "#4b5563",
                        backgroundColor: "#1f2937",
                        borderColor: "#374151",
                      }
                    : {
                        color: "#9ca3af",
                        backgroundColor: "#e5e7eb",
                        borderColor: "#d1d5db",
                      }
              }
            >
              {levelConfig.name.toUpperCase()}
              {count > 0 && (
                <span
                  className={`ml-1 ${isEnabled ? "opacity-75" : "opacity-50"}`}
                >
                  ({count.toLocaleString()})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
