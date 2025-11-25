import { useRef, useEffect, useCallback, CSSProperties } from "react";
import { List, ListImperativeAPI } from "react-window";
import { useLogStore } from "../stores/logStore";
import { LogDetailInline } from "./LogDetailInline";
import type { ParsedLogEvent } from "../types";

const ROW_HEIGHT = 24;

function getLogLevelClass(level: ParsedLogEvent["level"]): string {
  switch (level) {
    case "error":
      return "log-error";
    case "warn":
      return "log-warn";
    case "info":
      return "log-info";
    case "debug":
      return "log-debug";
    default:
      return "";
  }
}

interface LogRowProps {
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  onRowClick: (index: number) => void;
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  onRowClick: (index: number) => void;
}

function LogRow({
  index,
  style,
  logs,
  expandedIndex,
  onRowClick,
}: RowComponentPropsWithCustom) {
  const log = logs[index];
  const isExpanded = expandedIndex === index;

  return (
    <div
      style={style}
      onClick={() => onRowClick(index)}
      className={`flex items-center px-3 font-mono text-xs border-b border-gray-800/50 cursor-pointer transition-colors ${
        isExpanded
          ? "bg-blue-900/30 border-l-2 border-l-blue-500"
          : "hover:bg-gray-800/30"
      } ${getLogLevelClass(log.level)}`}
    >
      <span className="w-36 flex-shrink-0 text-gray-500">
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
  } = useLogStore();
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevLogCount = useRef(0);
  const userScrolledAway = useRef(false);

  const handleRowClick = useCallback(
    (index: number) => {
      // Toggle expansion: click same row closes it, different row expands it
      setExpandedLogIndex(expandedLogIndex === index ? null : index);
    },
    [expandedLogIndex, setExpandedLogIndex],
  );

  const handleCloseDetail = useCallback(() => {
    setExpandedLogIndex(null);
  }, [setExpandedLogIndex]);

  const expandedLog =
    expandedLogIndex !== null ? filteredLogs[expandedLogIndex] : null;

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
      const isAtBottom = visibleRows.stopIndex >= filteredLogs.length - 3;

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
    [filteredLogs.length, isTailing],
  );

  if (!selectedLogGroup) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select a log group to view logs
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="font-semibold">Error fetching logs</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading && filteredLogs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
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
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No logs found. Try adjusting the time range or filter.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      {/* Virtualized log list */}
      <div className="flex-1 overflow-hidden">
        <List<LogRowProps>
          listRef={listRef}
          rowCount={filteredLogs.length}
          rowHeight={ROW_HEIGHT}
          rowComponent={LogRow}
          rowProps={{
            logs: filteredLogs,
            expandedIndex: expandedLogIndex,
            onRowClick: handleRowClick,
          }}
          onRowsRendered={handleRowsRendered}
          overscanCount={20}
          className="h-full"
        />
      </div>

      {/* Expanded log detail panel - below the log list */}
      {expandedLog && (
        <LogDetailInline log={expandedLog} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
