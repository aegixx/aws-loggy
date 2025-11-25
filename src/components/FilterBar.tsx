import { useLogStore } from "../stores/logStore";
import { TimeRangePicker } from "./TimeRangePicker";
import type { LogLevel } from "../types";

const LEVEL_CONFIG: Record<
  LogLevel,
  { label: string; color: string; bgColor: string }
> = {
  error: {
    label: "ERROR",
    color: "text-red-400",
    bgColor: "bg-red-500/20 border-red-500/50",
  },
  warn: {
    label: "WARN",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20 border-yellow-500/50",
  },
  info: {
    label: "INFO",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20 border-blue-500/50",
  },
  debug: {
    label: "DEBUG",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20 border-gray-500/50",
  },
  unknown: {
    label: "OTHER",
    color: "text-gray-500",
    bgColor: "bg-gray-500/20 border-gray-500/50",
  },
};

const DISPLAY_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

export function FilterBar() {
  const {
    filterText,
    setFilterText,
    enabledLevels,
    toggleLevel,
    isTailing,
    clearLogs,
    logs,
    filteredLogs,
  } = useLogStore();

  // Count logs by level
  const levelCounts = logs.reduce(
    (acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    },
    {} as Record<LogLevel, number>,
  );

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-800/50 border-b border-gray-700">
      {/* Top row: Filter input and actions */}
      <div className="flex items-center gap-3">
        {/* Filter input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs... (use field:value for JSON fields)"
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
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
        <div className="text-sm text-gray-400 whitespace-nowrap">
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
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
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
        <span className="text-xs text-gray-500 mr-1">Levels:</span>
        {DISPLAY_LEVELS.map((level) => {
          const config = LEVEL_CONFIG[level];
          const count = levelCounts[level] || 0;
          const isEnabled = enabledLevels.has(level);

          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`px-2 py-0.5 text-xs rounded border transition-all ${
                isEnabled
                  ? `${config.bgColor} ${config.color}`
                  : "bg-gray-800 border-gray-700 text-gray-600"
              }`}
            >
              {config.label}
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
