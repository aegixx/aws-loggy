import {
  useRef,
  useEffect,
  useCallback,
  useState,
  CSSProperties,
  memo,
} from "react";
import { List, ListImperativeAPI } from "react-window";
import { useLogStore } from "../stores/logStore";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import { FindBar } from "./FindBar";
import { ContextMenu } from "./ContextMenu";
import { MaximizedLogView } from "./MaximizedLogView";
import { useFindInLog } from "../hooks/useFindInLog";
import { useSystemTheme } from "../hooks/useSystemTheme";
import { useDragSelection } from "../hooks/useDragSelection";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import {
  highlightText,
  type HighlightOptions,
} from "../utils/highlightMatches";
import { extractFieldVariants } from "../utils/extractFieldVariants";
import type { ParsedLogEvent } from "../types";

const ROW_HEIGHT = 24;
const DETAIL_HEIGHT = 200;

function getLogLevelStyle(level: string): {
  color: string;
  backgroundColor: string;
} {
  // Use CSS variables (set by App.tsx with theme-adaptive color-mix values)
  return {
    color: `var(--log-${level}-text, var(--log-unknown-text, #d1d5db))`,
    backgroundColor: `var(--log-${level}-bg, var(--log-unknown-bg, transparent))`,
  };
}

interface LogRowProps {
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  selectedIndex: number | null;
  selectedIndices: Set<number>;
  onRowMouseDown: (index: number, e: React.MouseEvent) => void;
  onRowMouseEnter: (index: number) => void;
  onContextMenu: (
    index: number,
    e: React.MouseEvent,
    isDetailView: boolean,
  ) => void;
  onClose: () => void;
  onMaximize: (log: ParsedLogEvent) => void;
  isDark: boolean;
  // Find/search props
  searchTerm?: string;
  searchOptions?: HighlightOptions;
  currentMatchLogIndex?: number | null;
  globalCurrentMatchIndex?: number;
  getMatchesForLog?: (
    logIndex: number,
  ) => { index: number; start: number; length: number }[];
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
  expandedIndex: number | null;
  selectedIndex: number | null;
  selectedIndices: Set<number>;
  onRowMouseDown: (index: number, e: React.MouseEvent) => void;
  onRowMouseEnter: (index: number) => void;
  onContextMenu: (
    index: number,
    e: React.MouseEvent,
    isDetailView: boolean,
  ) => void;
  onClose: () => void;
  onMaximize: (log: ParsedLogEvent) => void;
  isDark: boolean;
  // Find/search props
  searchTerm?: string;
  searchOptions?: HighlightOptions;
  currentMatchLogIndex?: number | null;
  globalCurrentMatchIndex?: number;
  getMatchesForLog?: (
    logIndex: number,
  ) => { index: number; start: number; length: number }[];
}

const LogRow = memo(function LogRow({
  index,
  style,
  logs,
  expandedIndex,
  selectedIndex,
  selectedIndices,
  onRowMouseDown,
  onRowMouseEnter,
  onContextMenu,
  onClose,
  onMaximize,
  isDark,
  searchTerm,
  searchOptions,
  currentMatchLogIndex,
  globalCurrentMatchIndex,
  getMatchesForLog,
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
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {/* Header with metadata */}
        <div className="flex items-start justify-between mb-2 shrink-0">
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
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className={`p-1 rounded transition-colors cursor-pointer ${
                copied
                  ? "bg-green-600 text-white"
                  : isDark
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              }`}
              title="Copy raw message"
            >
              {copied ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => onMaximize(log)}
              className={`p-1 rounded transition-colors cursor-pointer ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
              title="Maximize"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className={`p-1 rounded transition-colors cursor-pointer ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
              title="Close (Esc)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Log content */}
        <div
          className={`rounded p-2 overflow-auto flex-1 min-h-0 ${isDark ? "bg-gray-950" : "bg-gray-100"}`}
          onContextMenu={(e) => onContextMenu(expandedIndex, e, true)}
        >
          {log.parsedJson ? (
            <JsonSyntaxHighlight
              data={log.parsedJson}
              isDark={isDark}
              searchTerm={searchTerm}
              searchOptions={searchOptions}
            />
          ) : (
            <pre
              className={`font-mono text-sm leading-relaxed whitespace-pre-wrap break-all ${isDark ? "text-gray-300" : "text-gray-700"}`}
            >
              {searchTerm && searchOptions && getMatchesForLog
                ? (() => {
                    const logMatches = getMatchesForLog(expandedIndex);
                    if (logMatches.length === 0) return log.message;
                    const currentMatchInLog =
                      currentMatchLogIndex === expandedIndex
                        ? logMatches.findIndex(
                            (m) => m.index === globalCurrentMatchIndex,
                          )
                        : undefined;
                    return highlightText(
                      log.message,
                      searchTerm,
                      searchOptions,
                      currentMatchInLog,
                    );
                  })()
                : log.message}
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
  const isMultiSelected = selectedIndices.has(actualLogIndex);
  const levelStyle = getLogLevelStyle(log.level);

  // Determine row styling based on expanded/selected/multi-selected state
  let rowClasses =
    "flex items-center px-3 font-mono text-xs border-b cursor-pointer transition-colors border-l-2 select-none ";
  if (isExpanded) {
    rowClasses += `border-l-blue-500 ${isDark ? "bg-blue-900/30" : "bg-blue-100"}`;
  } else if (isMultiSelected) {
    rowClasses += `border-l-blue-400 ${isDark ? "bg-blue-900/40" : "bg-blue-100/80"}`;
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
          isExpanded || isSelected || isMultiSelected
            ? undefined
            : levelStyle.backgroundColor,
      }}
      onMouseDown={(e) => onRowMouseDown(actualLogIndex, e)}
      onMouseEnter={() => onRowMouseEnter(actualLogIndex)}
      onContextMenu={(e) => onContextMenu(actualLogIndex, e, false)}
      className={rowClasses}
    >
      <span
        className={`w-36 shrink-0 ${isDark ? "text-gray-500" : "text-gray-500"}`}
      >
        {log.formattedTime}
      </span>
      <span className="flex-1 truncate">
        {(() => {
          // Truncate very large messages for row display (full message available in detail view)
          const displayMessage =
            log.message.length > 2000
              ? log.message.substring(0, 2000)
              : log.message;

          if (searchTerm && searchOptions && getMatchesForLog) {
            const logMatches = getMatchesForLog(actualLogIndex);
            if (logMatches.length === 0) return displayMessage;
            // Find which match in this log is the current one (if any)
            const currentMatchInLog =
              currentMatchLogIndex === actualLogIndex
                ? logMatches.findIndex(
                    (m) => m.index === globalCurrentMatchIndex,
                  )
                : undefined;
            return highlightText(
              displayMessage,
              searchTerm,
              searchOptions,
              currentMatchInLog,
            );
          }
          return displayMessage;
        })()}
      </span>
    </div>
  );
});

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
    selectedLogIndices,
    setSelectedLogIndices,
    clearSelection,
    refreshConnection,
    clearLogs,
    setFilterText,
  } = useLogStore();
  const isDark = useSystemTheme();
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevLogCount = useRef(0);
  const userScrolledAway = useRef(false);

  // Callback to navigate to a log when find navigates to a match
  const handleNavigateToLog = useCallback(
    (logIndex: number) => {
      setSelectedLogIndex(logIndex);
      // Scroll to the log
      if (listRef.current) {
        listRef.current.scrollToRow({
          index:
            expandedLogIndex !== null && logIndex > expandedLogIndex
              ? logIndex + 1
              : logIndex,
          align: "smart",
        });
      }
    },
    [setSelectedLogIndex, expandedLogIndex],
  );

  // Find-in-log state and actions - searches across all visible logs
  const [findState, findActions] = useFindInLog(
    filteredLogs,
    handleNavigateToLog,
  );
  const findInputRef = (
    findActions as typeof findActions & {
      inputRef: React.RefObject<HTMLInputElement>;
    }
  ).inputRef;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
    targetLogIndex: number;
    requestId: string | null;
    traceId: string | null;
    clientIP: string | null;
  } | null>(null);

  // Maximized log state
  const [maximizedLog, setMaximizedLog] = useState<ParsedLogEvent | null>(null);

  // Context menu handler
  const handleContextMenu = useCallback(
    (logIndex: number, e: React.MouseEvent, isDetailView: boolean) => {
      e.preventDefault();

      let selectedText = "";
      if (isDetailView) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          selectedText = selection.toString().trim();
        }
      }

      // Extract filter fields from the target log's parsedJson
      // Check both top-level and nested under metadata
      const targetLog = filteredLogs[logIndex];
      const json = targetLog?.parsedJson;

      // Extract common fields using the utility function
      const requestId = extractFieldVariants(json, "requestId");
      const traceId = extractFieldVariants(json, "traceId");
      const clientIP =
        extractFieldVariants(json, "clientIP") ||
        extractFieldVariants(json, "clientIp");

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText,
        targetLogIndex: logIndex,
        requestId,
        traceId,
        clientIP,
      });
    },
    [filteredLogs],
  );

  // Context menu action handlers
  const handleContextCopy = useCallback(() => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    } else if (selectedLogIndices.size > 0) {
      // Copy multi-selected rows
      const messages = [...selectedLogIndices]
        .sort((a, b) => a - b)
        .map((i) => filteredLogs[i]?.message)
        .filter(Boolean)
        .join("\n");
      navigator.clipboard.writeText(messages);
    } else if (contextMenu?.targetLogIndex != null) {
      // Copy single targeted row
      navigator.clipboard.writeText(
        filteredLogs[contextMenu.targetLogIndex]?.message || "",
      );
    }
    setContextMenu(null);
  }, [contextMenu, selectedLogIndices, filteredLogs]);

  const handleFindBy = useCallback(() => {
    if (contextMenu?.selectedText) {
      findActions.setSearchTerm(contextMenu.selectedText);
      findActions.open();
    }
    setContextMenu(null);
  }, [contextMenu, findActions]);

  const handleFilterBySelection = useCallback(() => {
    if (contextMenu?.selectedText) {
      setFilterText(contextMenu.selectedText);
    }
    setContextMenu(null);
  }, [contextMenu, setFilterText]);

  const handleFilterByRequestId = useCallback(() => {
    if (contextMenu?.requestId) {
      setFilterText(`metadata.requestId:${contextMenu.requestId}`);
    }
    setContextMenu(null);
  }, [contextMenu, setFilterText]);

  const handleFilterByTraceId = useCallback(() => {
    if (contextMenu?.traceId) {
      setFilterText(`metadata.traceId:${contextMenu.traceId}`);
    }
    setContextMenu(null);
  }, [contextMenu, setFilterText]);

  const handleFilterByClientIP = useCallback(() => {
    if (contextMenu?.clientIP) {
      setFilterText(`metadata.clientIp:${contextMenu.clientIP}`);
    }
    setContextMenu(null);
  }, [contextMenu, setFilterText]);

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

  // Drag selection hook
  const {
    isDragging,
    handleRowMouseDown,
    handleRowMouseEnter,
    handleContainerMouseMove,
    handleContainerMouseUp,
    handleContainerMouseLeave,
  } = useDragSelection({
    setSelectedLogIndices,
    clearSelection,
    onRowClick: handleRowClick,
    expandedLogIndex,
    setExpandedLogIndex,
    setSelectedLogIndex,
  });

  // Get visible row count for page navigation
  const getVisibleRowCount = useCallback(() => {
    if (!containerRef.current) return 10;
    return Math.floor(containerRef.current.clientHeight / ROW_HEIGHT);
  }, []);

  // Window-level listener for CMD+F (triggered by menu)
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        if (findState.isOpen) {
          findActions.focusInput();
        } else {
          findActions.open();
        }
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [findState.isOpen, findActions]);

  // Keyboard navigation hook
  const { handleKeyDown } = useKeyboardNavigation({
    filteredLogs,
    selectedLogIndex,
    expandedLogIndex,
    setSelectedLogIndex,
    setExpandedLogIndex,
    getVisibleRowCount,
    selectedLogIndices,
    clearSelection,
    setSelectedLogIndices,
    findStateIsOpen: findState.isOpen,
    findActionsClose: findActions.close,
    contextMenu,
    setContextMenu,
    listRef,
  });

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
      className={`flex-1 overflow-hidden focus:outline-none relative ${isDragging ? "select-none" : ""}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Find bar */}
      <FindBar
        isOpen={findState.isOpen}
        onClose={findActions.close}
        searchTerm={findState.searchTerm}
        onSearchTermChange={findActions.setSearchTerm}
        options={findState.options}
        onToggleOption={findActions.toggleOption}
        currentMatchIndex={findState.currentMatchIndex}
        totalMatches={findState.matches.length}
        onNavigate={(dir) =>
          dir === "next" ? findActions.goToNext() : findActions.goToPrev()
        }
        inputRef={findInputRef}
        isDark={isDark}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          isDark={isDark}
          onCopy={handleContextCopy}
          onRefresh={refreshConnection}
          onClear={clearLogs}
          onFindBy={handleFindBy}
          onFilterBySelection={handleFilterBySelection}
          onFilterByRequestId={handleFilterByRequestId}
          onFilterByTraceId={handleFilterByTraceId}
          onFilterByClientIP={handleFilterByClientIP}
          hasTextSelection={!!contextMenu.selectedText}
          selectedText={contextMenu.selectedText}
          requestId={contextMenu.requestId}
          traceId={contextMenu.traceId}
          clientIP={contextMenu.clientIP}
        />
      )}

      <List<LogRowProps>
        listRef={listRef}
        rowCount={rowCount}
        rowHeight={getRowHeight}
        rowComponent={LogRow as any}
        rowProps={{
          logs: filteredLogs,
          expandedIndex: expandedLogIndex,
          selectedIndex: selectedLogIndex,
          selectedIndices: selectedLogIndices,
          onRowMouseDown: handleRowMouseDown,
          onRowMouseEnter: handleRowMouseEnter,
          onContextMenu: handleContextMenu,
          onClose: handleCloseDetail,
          onMaximize: setMaximizedLog,
          isDark,
          // Find/search props
          searchTerm: findState.isOpen ? findState.searchTerm : undefined,
          searchOptions: findState.isOpen ? findState.options : undefined,
          currentMatchLogIndex: findState.currentLogIndex,
          globalCurrentMatchIndex: findState.currentMatchIndex,
          getMatchesForLog: findState.isOpen
            ? findState.getMatchesForLog
            : undefined,
        }}
        onRowsRendered={handleRowsRendered}
        overscanCount={20}
        className="h-full"
      />

      {/* Maximized log view */}
      {maximizedLog && (
        <MaximizedLogView
          log={maximizedLog}
          onClose={() => setMaximizedLog(null)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
