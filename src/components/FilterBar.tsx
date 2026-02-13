import { useState, useEffect, useRef, useMemo } from "react";
import {
  MdFilterAltOff,
  MdDeleteOutline,
  MdUnfoldMore,
  MdUnfoldLess,
} from "react-icons/md";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore, getSortedLogLevels } from "../stores/settingsStore";
import { useLogGroups } from "../hooks/useLogGroups";
import { TimeRangePicker } from "./TimeRangePicker";
import type { LogLevel, GroupByMode } from "../types";
import { useDebounce } from "../hooks/useDebounce";
import { useSystemTheme } from "../hooks/useSystemTheme";

/** Delay in ms before filter text changes trigger log filtering */
const FILTER_DEBOUNCE_MS = 300;

export function FilterBar() {
  const {
    filterText,
    setFilterText,
    disabledLevels,
    toggleLevel,
    isTailing,
    activeTransport,
    clearLogs,
    resetFilters,
    logs,
    selectedLogGroup,
    groupByMode,
    setGroupByMode,
    expandAllGroups,
    collapseAllGroups,
    collapsedGroups,
  } = useLogStore();
  const { groups, effectiveMode } = useLogGroups();
  const { logLevels } = useSettingsStore();
  const sortedLevels = getSortedLogLevels(logLevels);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const isDark = useSystemTheme();

  // Local state for immediate input feedback
  const [inputValue, setInputValue] = useState(filterText);

  // Debounce the filter operation to avoid excessive re-filtering on every keystroke
  const debouncedFilterText = useDebounce(inputValue, FILTER_DEBOUNCE_MS);

  // Sync debounced value to store
  useEffect(() => {
    if (debouncedFilterText !== filterText) {
      setFilterText(debouncedFilterText);
    }
  }, [debouncedFilterText, filterText, setFilterText]);

  // Sync store value to input (for external changes like Clear button)
  useEffect(() => {
    setInputValue(filterText);
  }, [filterText]);

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

  // Count logs by level (memoized to avoid O(n) recalculation on every render)
  const levelCounts = useMemo(
    () =>
      logs.reduce(
        (acc, log) => {
          acc[log.level] = (acc[log.level] || 0) + 1;
          return acc;
        },
        {} as Record<LogLevel, number>,
      ),
    [logs],
  );

  // Hide filter bar until a log group is selected
  if (!selectedLogGroup) {
    return null;
  }

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
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Filter logs... (use field:value for JSON fields)"
            className={`w-full rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 ${isDark ? "bg-gray-900 border border-gray-700 placeholder-gray-500" : "bg-white border border-gray-300 placeholder-gray-400"}`}
          />
          {inputValue && (
            <button
              onClick={() => setInputValue("")}
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

        {/* Transport / mode indicator: fixed width so layout doesn't shift */}
        <div
          className="flex items-center gap-2 text-sm min-w-22 justify-end"
          title={
            isTailing
              ? activeTransport === "stream"
                ? "Live streaming"
                : "Live polling"
              : "Static time range"
          }
        >
          {isTailing ? (
            activeTransport === "stream" ? (
              <span className="flex items-center gap-2 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
                Streaming
              </span>
            ) : (
              <span className="flex items-center gap-2 text-yellow-400">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse shrink-0" />
                Polling
              </span>
            )
          ) : (
            <span className={isDark ? "text-gray-500" : "text-gray-600"}>
              Static
            </span>
          )}
        </div>
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

        {/* Group by dropdown */}
        <span
          className={`text-xs mr-1 ml-2 ${isDark ? "text-gray-500" : "text-gray-600"}`}
        >
          Group by:
        </span>
        <select
          value={groupByMode}
          onChange={(e) =>
            setGroupByMode(e.target.value as GroupByMode | "auto")
          }
          title="Group by"
          className={`px-2 py-1 rounded text-sm border cursor-pointer ${
            isDark
              ? "bg-gray-700 border-gray-600 text-gray-300"
              : "bg-gray-200 border-gray-300 text-gray-700"
          }`}
        >
          <option value="none">None</option>
          <option value="stream">Stream</option>
          {selectedLogGroup?.startsWith("/aws/lambda/") && (
            <option value="invocation">Invocation</option>
          )}
        </select>

        {/* Expand/Collapse all buttons (only when grouping is active) */}
        {effectiveMode !== "none" && groups.length > 0 && (
          <>
            <button
              onClick={expandAllGroups}
              disabled={collapsedGroups.size === 0}
              className={`p-1 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"}`}
              title="Expand all groups"
            >
              <MdUnfoldMore className="w-4 h-4" />
            </button>
            <button
              onClick={() => collapseAllGroups(groups.map((g) => g.id))}
              disabled={collapsedGroups.size === groups.length}
              className={`p-1 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"}`}
              title="Collapse all groups"
            >
              <MdUnfoldLess className="w-4 h-4" />
            </button>
          </>
        )}

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
