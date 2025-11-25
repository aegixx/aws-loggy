import { useRef, useEffect, useCallback, CSSProperties } from "react";
import { List, ListImperativeAPI } from "react-window";
import { useLogStore } from "../stores/logStore";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import type { ParsedLogEvent } from "../types";

const ROW_HEIGHT = 24;
const DETAIL_HEIGHT = 200;

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
  onClose: () => void;
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  onRowClick: (index: number) => void;
  onClose: () => void;
}

function LogRow({
  index,
  style,
  logs,
  expandedIndex,
  onRowClick,
  onClose,
}: RowComponentPropsWithCustom) {
  // If there's an expanded row, indices after it are shifted by 1
  const isDetailRow = expandedIndex !== null && index === expandedIndex + 1;
  const actualLogIndex =
    expandedIndex !== null && index > expandedIndex ? index - 1 : index;

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
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    return (
      <div
        style={style}
        className="bg-gray-900 border-l-2 border-l-blue-500 px-3 py-2 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with metadata */}
        <div className="flex items-start justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              <span className="text-gray-600">Timestamp:</span>{" "}
              <span className="text-gray-300">{fullTimestamp}</span>
            </span>
            {log.log_stream_name && (
              <span className="text-gray-400">
                <span className="text-gray-600">Stream:</span>{" "}
                <span className="text-gray-300 font-mono text-xs">
                  {log.log_stream_name}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors cursor-pointer"
              title="Copy raw message"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Log content */}
        <div className="bg-gray-950 rounded p-2 overflow-auto flex-1 min-h-0">
          {log.parsedJson ? (
            <JsonSyntaxHighlight data={log.parsedJson} />
          ) : (
            <pre className="font-mono text-sm leading-relaxed text-gray-300 whitespace-pre-wrap break-all">
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

  return (
    <div
      style={style}
      onClick={() => onRowClick(actualLogIndex)}
      className={`flex items-center px-3 font-mono text-xs border-b border-gray-800/50 cursor-pointer transition-colors border-l-2 ${
        isExpanded
          ? "bg-blue-900/30 border-l-blue-500"
          : "border-l-transparent hover:bg-gray-800/30"
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

  // Handle Escape key to close detail
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedLogIndex !== null) {
        setExpandedLogIndex(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedLogIndex, setExpandedLogIndex]);

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
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <List<LogRowProps>
        listRef={listRef}
        rowCount={rowCount}
        rowHeight={getRowHeight}
        rowComponent={LogRow}
        rowProps={{
          logs: filteredLogs,
          expandedIndex: expandedLogIndex,
          onRowClick: handleRowClick,
          onClose: handleCloseDetail,
        }}
        onRowsRendered={handleRowsRendered}
        overscanCount={20}
        className="h-full"
      />
    </div>
  );
}
