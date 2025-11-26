import { useRef, useEffect, useCallback, useState, CSSProperties } from "react";
import { List, ListImperativeAPI } from "react-window";
import { useLogStore } from "../stores/logStore";
import { useSettingsStore, type LogLevelConfig } from "../stores/settingsStore";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import type { ParsedLogEvent } from "../types";

const ROW_HEIGHT = 24;
const DETAIL_HEIGHT = 200;

function getLogLevelStyle(
  level: string,
  logLevels: LogLevelConfig[],
): { color: string; backgroundColor: string } {
  const config = logLevels.find((l) => l.id === level);
  if (config) {
    return {
      color: config.style.textColor,
      backgroundColor: config.style.backgroundColor,
    };
  }
  // Default for unknown level
  return {
    color: "#d1d5db",
    backgroundColor: "transparent",
  };
}

interface LogRowProps {
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  selectedIndex: number | null;
  onRowClick: (index: number) => void;
  onClose: () => void;
  logLevels: LogLevelConfig[];
  isDark: boolean;
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  selectedIndex: number | null;
  onRowClick: (index: number) => void;
  onClose: () => void;
  logLevels: LogLevelConfig[];
  isDark: boolean;
}

function LogRow({
  index,
  style,
  logs,
  expandedIndex,
  selectedIndex,
  onRowClick,
  onClose,
  logLevels,
  isDark,
}: RowComponentPropsWithCustom) {
  // If there's an expanded row, indices after it are shifted by 1
  const isDetailRow = expandedIndex !== null && index === expandedIndex + 1;
  const actualLogIndex =
    expandedIndex !== null && index > expandedIndex ? index - 1 : index;

  const [copied, setCopied] = useState(false);

  // Render the detail panel
  if (isDetailRow) {
    const log = logs[expandedIndex];
    const date = new Date(log.timestamp);
    const fullTimestamp =
      date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }) +
      "." +
      date.getMilliseconds().toString().padStart(3, "0");

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(log.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 500);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    return (
      <div
        style={style}
        className={`border-l-2 border-l-blue-500 px-3 py-2 flex flex-col ${isDark ? "bg-gray-900" : "bg-white"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with metadata */}
        <div className="flex items-start justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <span className={isDark ? "text-gray-400" : "text-gray-600"}>
              <span className={isDark ? "text-gray-600" : "text-gray-500"}>
                Timestamp:
              </span>{" "}
              <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                {fullTimestamp}
              </span>
            </span>
            {log.log_stream_name && (
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                <span className={isDark ? "text-gray-600" : "text-gray-500"}>
                  Stream:
                </span>{" "}
                <span
                  className={`font-mono text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}
                >
                  {log.log_stream_name}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer min-w-[52px] ${
                copied
                  ? "bg-green-600 text-white"
                  : isDark
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              }`}
              title="Copy raw message"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Log content */}
        <div
          className={`rounded p-2 overflow-auto flex-1 min-h-0 ${isDark ? "bg-gray-950" : "bg-gray-100"}`}
        >
          {log.parsedJson ? (
            <JsonSyntaxHighlight data={log.parsedJson} isDark={isDark} />
          ) : (
            <pre
              className={`font-mono text-sm leading-relaxed whitespace-pre-wrap break-all ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              {log.message}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Regular log row
  const log = logs[actualLogIndex];
  if (!log) return <div style={style} />;

  const isExpanded = expandedIndex === actualLogIndex;
  const isSelected = selectedIndex === actualLogIndex;
  const levelStyle = getLogLevelStyle(log.level, logLevels);

  // Determine row styling based on expanded/selected state
  let rowClasses =
    "flex items-center px-3 font-mono text-xs border-b cursor-pointer transition-colors border-l-2 ";
  if (isExpanded) {
    rowClasses += `border-l-blue-500 ${isDark ? "bg-blue-900/30" : "bg-blue-100"}`;
  } else if (isSelected) {
    rowClasses += `border-l-blue-400 ${isDark ? "bg-gray-700/50 ring-1 ring-inset ring-blue-500/50" : "bg-blue-50 ring-1 ring-inset ring-blue-300"}`;
  } else {
    rowClasses += `border-l-transparent ${isDark ? "border-gray-800/50 hover:bg-gray-800/30" : "border-gray-200 hover:bg-gray-100"}`;
  }

  return (
    <div
      style={{
        ...style,
        color: levelStyle.color,
        backgroundColor:
          isExpanded || isSelected ? undefined : levelStyle.backgroundColor,
      }}
      onClick={() => onRowClick(actualLogIndex)}
      className={rowClasses}
    >
      <span
        className={`w-36 flex-shrink-0 ${isDark ? "text-gray-500" : "text-gray-500"}`}
      >
        {log.formattedTime}
      </span>
      <span className="flex-1 truncate" title={log.message}>
        {log.message}
      </span>
    </div>
  );
}

export function LogViewer() {
  const {
    filteredLogs,
    isLoading,
    error,
    selectedLogGroup,
    isTailing,
    expandedLogIndex,
    setExpandedLogIndex,
    selectedLogIndex,
    setSelectedLogIndex,
  } = useLogStore();
  const { theme, logLevels } = useSettingsStore();

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
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevLogCount = useRef(0);
  const userScrolledAway = useRef(false);

  const handleRowClick = useCallback(
    (index: number) => {
      // Set selection and toggle expansion
      setSelectedLogIndex(index);
      setExpandedLogIndex(expandedLogIndex === index ? null : index);
    },
    [expandedLogIndex, setExpandedLogIndex, setSelectedLogIndex],
  );

  const handleCloseDetail = useCallback(() => {
    setExpandedLogIndex(null);
  }, [setExpandedLogIndex]);

  // Get visible row count for page navigation
  const getVisibleRowCount = useCallback(() => {
    if (!containerRef.current) return 10;
    return Math.floor(containerRef.current.clientHeight / ROW_HEIGHT);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredLogs.length === 0) return;

      const currentIndex = selectedLogIndex ?? -1;
      let newIndex: number | null = null;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          newIndex = Math.min(currentIndex + 1, filteredLogs.length - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        case "PageDown":
          e.preventDefault();
          newIndex = Math.min(
            currentIndex + getVisibleRowCount(),
            filteredLogs.length - 1,
          );
          break;
        case "PageUp":
          e.preventDefault();
          newIndex = Math.max(currentIndex - getVisibleRowCount(), 0);
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = filteredLogs.length - 1;
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          if (selectedLogIndex !== null) {
            setExpandedLogIndex(
              expandedLogIndex === selectedLogIndex ? null : selectedLogIndex,
            );
          }
          return;
        case "Escape":
          if (expandedLogIndex !== null) {
            e.preventDefault();
            setExpandedLogIndex(null);
          }
          return;
      }

      if (newIndex !== null && newIndex !== currentIndex) {
        setSelectedLogIndex(newIndex);
        // Scroll to keep selected row visible
        if (listRef.current) {
          listRef.current.scrollToRow({
            index:
              expandedLogIndex !== null && newIndex > expandedLogIndex
                ? newIndex + 1
                : newIndex,
            align: "smart",
          });
        }
      }
    },
    [
      filteredLogs.length,
      selectedLogIndex,
      expandedLogIndex,
      setSelectedLogIndex,
      setExpandedLogIndex,
      getVisibleRowCount,
    ],
  );

  // Calculate row count (add 1 for detail row when expanded)
  const rowCount =
    expandedLogIndex !== null ? filteredLogs.length + 1 : filteredLogs.length;

  // Dynamic row height
  const getRowHeight = useCallback(
    (index: number) => {
      if (expandedLogIndex !== null && index === expandedLogIndex + 1) {
        return DETAIL_HEIGHT;
      }
      return ROW_HEIGHT;
    },
    [expandedLogIndex],
  );

  // Auto-scroll to bottom when tailing and new logs arrive
  useEffect(() => {
    const hasNewLogs = filteredLogs.length > prevLogCount.current;
    prevLogCount.current = filteredLogs.length;

    // Only auto-scroll if:
    // 1. We're in tailing mode
    // 2. New logs have arrived (not just filtering)
    // 3. User hasn't scrolled away from bottom
    // 4. shouldAutoScroll is true (we're near bottom)
    if (
      isTailing &&
      hasNewLogs &&
      shouldAutoScroll.current &&
      !userScrolledAway.current &&
      listRef.current &&
      filteredLogs.length > 0
    ) {
      listRef.current.scrollToRow({
        index: filteredLogs.length - 1,
        align: "end",
      });
    }
  }, [filteredLogs.length, isTailing]);

  // Reset scroll state when starting/stopping tail
  useEffect(() => {
    if (isTailing) {
      shouldAutoScroll.current = true;
      userScrolledAway.current = false;
      // Scroll to bottom when starting tail
      if (listRef.current && filteredLogs.length > 0) {
        listRef.current.scrollToRow({
          index: filteredLogs.length - 1,
          align: "end",
        });
      }
    }
  }, [isTailing, filteredLogs.length]);

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      // Check if user is at or near the bottom of the list
      const isAtBottom = visibleRows.stopIndex >= rowCount - 3;

      if (isAtBottom) {
        // User scrolled back to bottom - resume auto-scroll
        shouldAutoScroll.current = true;
        userScrolledAway.current = false;
      } else if (shouldAutoScroll.current && isTailing) {
        // User scrolled away from bottom while tailing - pause auto-scroll
        userScrolledAway.current = true;
        shouldAutoScroll.current = false;
      }
    },
    [rowCount, isTailing],
  );

  if (!selectedLogGroup) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${isDark ? "text-gray-500" : "text-gray-600"}`}
      >
        Select a log group to view logs
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${isDark ? "text-red-400" : "text-red-600"}`}
      >
        <div className="text-center max-w-lg px-4">
          <p className="font-semibold">Error fetching logs</p>
          <p className="text-sm mt-1 select-text cursor-text">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading && filteredLogs.length === 0) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${isDark ? "text-gray-500" : "text-gray-600"}`}
      >
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading logs...
        </div>
      </div>
    );
  }

  if (filteredLogs.length === 0) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${isDark ? "text-gray-500" : "text-gray-600"}`}
      >
        No logs found. Try adjusting the time range or filter.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <List<LogRowProps>
        listRef={listRef}
        rowCount={rowCount}
        rowHeight={getRowHeight}
        rowComponent={LogRow}
        rowProps={{
          logs: filteredLogs,
          expandedIndex: expandedLogIndex,
          selectedIndex: selectedLogIndex,
          onRowClick: handleRowClick,
          onClose: handleCloseDetail,
          logLevels,
          isDark,
        }}
        onRowsRendered={handleRowsRendered}
        overscanCount={20}
        className="h-full"
      />
    </div>
  );
}
