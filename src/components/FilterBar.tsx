import { useState, useEffect, useRef } from "react";
import { MdFilterAltOff, MdDeleteOutline } from "react-icons/md";
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
    resetFilters,
    logs,
    selectedLogGroup,
  } = useLogStore();
  const { theme, logLevels } = useSettingsStore();
  const sortedLevels = getSortedLogLevels(logLevels);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Handle CMD-L to focus filter input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        if (filterInputRef.current) {
          filterInputRef.current.focus();
          filterInputRef.current.select();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Hide filter bar until a log group is selected
  if (!selectedLogGroup) {
    return null;
  }

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
            ref={filterInputRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs... (use field:value for JSON fields)"
            className={`w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 ${isDark ? "bg-gray-900 border border-gray-700 placeholder-gray-500" : "bg-white border border-gray-300 placeholder-gray-400"}`}
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Time range picker */}
        <TimeRangePicker />

        {/* Reset button (icon) */}
        <button
          onClick={resetFilters}
          className={`p-1.5 rounded transition-colors cursor-pointer ${isDark ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"}`}
          title="Reset filters to defaults"
        >
          <MdFilterAltOff className="w-4 h-4" />
        </button>

        {/* Tail indicator */}
        {isTailing && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Streaming
          </div>
        )}
      </div>

      {/* Bottom row: Level toggles + Clear button */}
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
              className="px-2 py-0.5 text-xs rounded border transition-all cursor-pointer"
              style={
                isEnabled
                  ? {
                      color: `var(--log-${levelConfig.id}-text)`,
                      backgroundColor: `var(--log-${levelConfig.id}-bg)`,
                      borderColor: `var(--log-${levelConfig.id}-border)`,
                    }
                  : isDark
                    ? {
                        color: "#4b5563",
                        backgroundColor: "#1f2937",
                        borderColor: "#374151",
                        textDecoration: "line-through",
                        opacity: 0.5,
                      }
                    : {
                        color: "#9ca3af",
                        backgroundColor: "#e5e7eb",
                        borderColor: "#d1d5db",
                        textDecoration: "line-through",
                        opacity: 0.5,
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

        {/* Spacer to push clear button to right */}
        <div className="flex-1" />

        {/* Clear button (icon) */}
        <button
          onClick={clearLogs}
          disabled={logs.length === 0}
          className={`p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${isDark ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"}`}
          title="Clear logs (⌘K)"
        >
          <MdDeleteOutline className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
