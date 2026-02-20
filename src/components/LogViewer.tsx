import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  CSSProperties,
  memo,
} from "react";
import { List, ListImperativeAPI } from "react-window";
import { useLogStore } from "../stores/logStore";
import { FindBar } from "./FindBar";
import { ContextMenu } from "./ContextMenu";
import { MaximizedLogView } from "./MaximizedLogView";
import { LogRowDetail } from "./LogRowDetail";
import { GroupHeader } from "./GroupHeader";
import { useFindInLog } from "../hooks/useFindInLog";
import { useLogGroups, type DisplayItem } from "../hooks/useLogGroups";
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
const GROUP_HEADER_HEIGHT = 32;

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
  logByIndex?: Map<number, ParsedLogEvent>;
  expandedIndex: number | null;
  expandedLogFilteredIndex?: number | null;
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
  // Grouping props
  displayItems?: DisplayItem[];
  isGrouped?: boolean;
  onToggleGroup?: (groupId: string) => void;
  collapsedGroups?: Set<string>;
  getVisibleMessages?: (
    group: import("../utils/groupLogs").LogGroupSection,
  ) => string;
  getVisibleCount?: (
    group: import("../utils/groupLogs").LogGroupSection,
  ) => number;
  onGroupHeaderContextMenu?: (e: React.MouseEvent) => void;
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
  logByIndex?: Map<number, ParsedLogEvent>;
  expandedIndex: number | null;
  expandedLogFilteredIndex?: number | null;
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
  // Grouping props
  displayItems?: DisplayItem[];
  isGrouped?: boolean;
  onToggleGroup?: (groupId: string) => void;
  collapsedGroups?: Set<string>;
  getVisibleMessages?: (
    group: import("../utils/groupLogs").LogGroupSection,
  ) => string;
  getVisibleCount?: (
    group: import("../utils/groupLogs").LogGroupSection,
  ) => number;
  onGroupHeaderContextMenu?: (e: React.MouseEvent) => void;
}

const LogRow = memo(function LogRow({
  index,
  style,
  logs,
  logByIndex,
  expandedIndex,
  expandedLogFilteredIndex,
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
  displayItems,
  isGrouped,
  onToggleGroup,
  collapsedGroups,
  getVisibleMessages,
  getVisibleCount,
  onGroupHeaderContextMenu,
}: RowComponentPropsWithCustom) {
  // If there's an expanded row, indices after it are shifted by 1
  const isDetailRow = expandedIndex !== null && index === expandedIndex + 1;

  // In grouped mode, check if this index maps to a group header
  if (isGrouped && displayItems && !isDetailRow) {
    const itemIndex =
      expandedIndex !== null && index > expandedIndex ? index - 1 : index;
    const item = displayItems[itemIndex];
    if (item?.type === "header") {
      return (
        <GroupHeader
          group={item.group}
          collapsed={collapsedGroups?.has(item.group.id) ?? false}
          onToggle={() => onToggleGroup?.(item.group.id)}
          getVisibleMessages={getVisibleMessages}
          getVisibleCount={getVisibleCount}
          isDark={isDark}
          style={style}
          onContextMenu={onGroupHeaderContextMenu}
        />
      );
    }
  }

  // Compute the actual log index, accounting for grouped mode and expanded detail row
  let actualLogIndex: number;
  if (isGrouped && displayItems) {
    const itemIndex =
      expandedIndex !== null && index > expandedIndex ? index - 1 : index;
    const item = displayItems[itemIndex];
    if (item?.type === "log") {
      actualLogIndex = item.logIndex;
    } else {
      actualLogIndex =
        expandedIndex !== null && index > expandedIndex ? index - 1 : index;
    }
  } else {
    actualLogIndex =
      expandedIndex !== null && index > expandedIndex ? index - 1 : index;
  }

  // Render the detail panel
  if (isDetailRow) {
    const logIdx = expandedLogFilteredIndex ?? expandedIndex;
    const log = logs[logIdx];
    return (
      <LogRowDetail
        log={log}
        style={style}
        isDark={isDark}
        onClose={onClose}
        onMaximize={onMaximize}
        onContextMenu={onContextMenu}
        expandedIndex={logIdx}
        searchTerm={searchTerm}
        searchOptions={searchOptions}
        currentMatchLogIndex={currentMatchLogIndex}
        globalCurrentMatchIndex={globalCurrentMatchIndex}
        getMatchesForLog={getMatchesForLog}
      />
    );
  }

  // Regular log row — use logByIndex map for negative (group-filter) indices
  let log: ParsedLogEvent | undefined;
  if (actualLogIndex >= 0) {
    log = logs[actualLogIndex];
  } else if (logByIndex) {
    log = logByIndex.get(actualLogIndex);
  }
  if (!log) return <div style={style} />;

  const isExpanded =
    (expandedLogFilteredIndex ?? expandedIndex) === actualLogIndex;
  const isSelected = selectedIndex === actualLogIndex;
  const isMultiSelected = selectedIndices.has(actualLogIndex);
  const levelStyle = getLogLevelStyle(log.level);

  // Determine row styling based on expanded/selected/multi-selected state
  let rowClasses =
    "flex items-center px-3 font-mono text-xs border-b cursor-pointer transition-colors border-l-2 select-none ";
  if (isExpanded) {
    rowClasses += `border-l-blue-500 ${
      isDark ? "bg-blue-900/30" : "bg-blue-100"
    }`;
  } else if (isMultiSelected) {
    rowClasses += `border-l-blue-400 ${
      isDark ? "bg-blue-900/40" : "bg-blue-100/80"
    }`;
  } else if (isSelected) {
    rowClasses += `border-l-blue-400 ${
      isDark
        ? "bg-gray-700/50 ring-1 ring-inset ring-blue-500/50"
        : "bg-blue-50 ring-1 ring-inset ring-blue-300"
    }`;
  } else {
    rowClasses += `border-l-transparent ${
      isDark
        ? "border-gray-800/50 hover:bg-gray-800/30"
        : "border-gray-200 hover:bg-gray-100"
    }`;
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
        className={`w-36 shrink-0 ${
          isDark ? "text-gray-500" : "text-gray-500"
        }`}
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
    isFollowing,
    setIsFollowing,
  } = useLogStore();
  const { displayItems, effectiveMode } = useLogGroups();
  const toggleGroupCollapsed = useLogStore((s) => s.toggleGroupCollapsed);
  const collapsedGroups = useLogStore((s) => s.collapsedGroups);
  const isGrouped = effectiveMode !== "none";

  // Map logIndex → ParsedLogEvent for all display items (handles negative indices from group filter)
  const logByIndex = useMemo(() => {
    const map = new Map<number, ParsedLogEvent>();
    for (const item of displayItems) {
      if (item.type === "log") {
        map.set(item.logIndex, item.log);
      }
    }
    return map;
  }, [displayItems]);

  // Reverse index: logIndex → displayItems index (for O(1) lookup)
  const logIndexToDisplayIndex = useMemo(() => {
    if (!isGrouped) {
      return null;
    }
    const map = new Map<number, number>();
    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i];
      if (item.type === "log") {
        map.set(item.logIndex, i);
      }
    }
    return map;
  }, [isGrouped, displayItems]);

  // In grouped mode, find the virtual list index of the expanded log
  const expandedDisplayIndex = useMemo(() => {
    if (expandedLogIndex === null) {
      return null;
    } else if (!isGrouped) {
      return expandedLogIndex;
    } else {
      return logIndexToDisplayIndex?.get(expandedLogIndex) ?? null;
    }
  }, [expandedLogIndex, isGrouped, logIndexToDisplayIndex]);

  const effectiveExpandedIndex = isGrouped
    ? expandedDisplayIndex
    : expandedLogIndex;

  const isDark = useSystemTheme();
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(0);
  const prevRowCountForFollow = useRef(0);

  // Callback to navigate to a log when find navigates to a match
  const handleNavigateToLog = useCallback(
    (logIndex: number) => {
      setSelectedLogIndex(logIndex);
      // Scroll to the log
      if (listRef.current) {
        let scrollIndex = logIndex;
        if (isGrouped) {
          const idx = displayItems.findIndex(
            (item) => item.type === "log" && item.logIndex === logIndex,
          );
          if (idx !== -1) {
            scrollIndex = idx;
          }
        }
        if (
          effectiveExpandedIndex !== null &&
          scrollIndex > effectiveExpandedIndex
        ) {
          scrollIndex = scrollIndex + 1;
        }
        listRef.current.scrollToRow({
          index: scrollIndex,
          align: "smart",
        });
      }
    },
    [setSelectedLogIndex, effectiveExpandedIndex, isGrouped, displayItems],
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
    targetLog: ParsedLogEvent | undefined;
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
      e.stopPropagation();

      let selectedText = "";
      if (isDetailView) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          selectedText = selection.toString().trim();
        }
      }

      // Extract filter fields from the target log's parsedJson
      // Check both top-level and nested under metadata
      // Use logByIndex for negative (group-filter) indices
      let targetLog: ParsedLogEvent | undefined;
      if (logIndex >= 0) {
        targetLog = filteredLogs[logIndex];
      } else {
        targetLog = logByIndex.get(logIndex);
      }
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
        targetLog,
        requestId,
        traceId,
        clientIP,
      });
    },
    [filteredLogs, logByIndex],
  );

  // Context menu handler for group headers and empty areas (no log-specific data)
  const handleGroupHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: "",
      targetLogIndex: -1,
      targetLog: undefined,
      requestId: null,
      traceId: null,
      clientIP: null,
    });
  }, []);

  // Context menu action handlers
  const handleContextCopy = useCallback(() => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    } else if (selectedLogIndices.size > 0) {
      // Copy multi-selected rows — use logByIndex for negative (group-filter) indices
      const messages = [...selectedLogIndices]
        .sort((a, b) => a - b)
        .map((i) => {
          if (i >= 0) {
            return filteredLogs[i]?.message;
          } else {
            return logByIndex.get(i)?.message;
          }
        })
        .filter(Boolean)
        .join("\n");
      navigator.clipboard.writeText(messages);
    } else if (contextMenu?.targetLogIndex != null) {
      // Copy single targeted row — use stored targetLog for negative indices
      navigator.clipboard.writeText(contextMenu.targetLog?.message || "");
    }
    setContextMenu(null);
  }, [contextMenu, selectedLogIndices, filteredLogs, logByIndex]);

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

  // Build a Set of visible logs for fast lookup (used by group copy)
  const filteredLogSet = useMemo(() => new Set(filteredLogs), [filteredLogs]);

  const getVisibleMessages = useCallback(
    (group: import("../utils/groupLogs").LogGroupSection) => {
      return group.logs
        .filter((log) => filteredLogSet.has(log))
        .map((log) => log.message)
        .join("\n");
    },
    [filteredLogSet],
  );

  const getVisibleCount = useCallback(
    (group: import("../utils/groupLogs").LogGroupSection) => {
      return group.logs.filter((log) => filteredLogSet.has(log)).length;
    },
    [filteredLogSet],
  );

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
    logByIndex: isGrouped ? logByIndex : undefined,
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
  const baseRowCount = isGrouped ? displayItems.length : filteredLogs.length;
  const rowCount =
    effectiveExpandedIndex !== null ? baseRowCount + 1 : baseRowCount;

  // Dynamic row height
  const getRowHeight = useCallback(
    (index: number) => {
      if (
        effectiveExpandedIndex !== null &&
        index === effectiveExpandedIndex + 1
      ) {
        return DETAIL_HEIGHT;
      } else if (isGrouped) {
        // In grouped mode, determine if this index maps to a header
        const itemIndex =
          effectiveExpandedIndex !== null && index > effectiveExpandedIndex
            ? index - 1
            : index;
        const item = displayItems[itemIndex];
        if (item?.type === "header") {
          return GROUP_HEADER_HEIGHT;
        } else {
          return ROW_HEIGHT;
        }
      } else {
        return ROW_HEIGHT;
      }
    },
    [effectiveExpandedIndex, isGrouped, displayItems],
  );

  // Auto-scroll to bottom when following and new logs arrive
  useEffect(() => {
    const hasNewLogs = filteredLogs.length > prevLogCount.current;
    prevLogCount.current = filteredLogs.length;

    if (
      isTailing &&
      hasNewLogs &&
      isFollowing &&
      listRef.current &&
      filteredLogs.length > 0
    ) {
      listRef.current.scrollToRow({
        index: rowCount - 1,
        align: "end",
      });
    }
  }, [filteredLogs.length, isTailing, isFollowing, rowCount]);

  // Scroll to bottom when starting tail
  useEffect(() => {
    if (isTailing && listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToRow({
        index: rowCount - 1,
        align: "end",
      });
    }
  }, [isTailing, filteredLogs.length, rowCount]);

  // Sync prevRowCountForFollow after each render so handleRowsRendered
  // can detect whether rowCount changed (new logs arrived vs user scroll)
  useEffect(() => {
    prevRowCountForFollow.current = rowCount;
  }, [rowCount]);

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      if (!isTailing) return;

      const isAtBottom = visibleRows.stopIndex >= rowCount - 3;
      // When new logs arrive, rowCount increases and onItemsRendered fires
      // before the auto-scroll effect has a chance to run. Don't unfollow
      // in that case — only unfollow when the user actively scrolled away.
      const rowCountJustChanged = rowCount !== prevRowCountForFollow.current;

      if (isAtBottom && !isFollowing) {
        setIsFollowing(true);
      } else if (!isAtBottom && isFollowing && !rowCountJustChanged) {
        setIsFollowing(false);
      }
    },
    [rowCount, isTailing, isFollowing, setIsFollowing],
  );

  if (!selectedLogGroup) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${
          isDark ? "text-gray-500" : "text-gray-600"
        }`}
      >
        Select a log group to view logs
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${
          isDark ? "text-red-400" : "text-red-600"
        }`}
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
        className={`flex-1 flex items-center justify-center ${
          isDark ? "text-gray-500" : "text-gray-600"
        }`}
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
        className={`flex-1 flex items-center justify-center ${
          isDark ? "text-gray-500" : "text-gray-600"
        }`}
      >
        No logs found. Try adjusting the time range or filter.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden focus:outline-none relative ${
        isDragging ? "select-none" : ""
      }`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={handleGroupHeaderContextMenu}
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
          copyDisabled={
            !contextMenu.selectedText &&
            selectedLogIndices.size === 0 &&
            contextMenu.targetLogIndex === -1
          }
          onRefresh={refreshConnection}
          onClear={clearLogs}
          clearDisabled={!isTailing}
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
        // Type assertion: react-window v2's RowComponent type is incompatible with
        // components receiving custom props via rowProps. This is a known limitation.
        // Our LogRow receives (index, style) from react-window plus additional props.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rowComponent={LogRow as any}
        rowProps={{
          logs: filteredLogs,
          logByIndex: isGrouped ? logByIndex : undefined,
          expandedIndex: isGrouped ? expandedDisplayIndex : expandedLogIndex,
          expandedLogFilteredIndex: expandedLogIndex,
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
          // Grouping props
          displayItems: isGrouped ? displayItems : undefined,
          isGrouped,
          onToggleGroup: toggleGroupCollapsed,
          collapsedGroups,
          getVisibleMessages,
          getVisibleCount,
          onGroupHeaderContextMenu: handleGroupHeaderContextMenu,
        }}
        onRowsRendered={handleRowsRendered}
        overscanCount={20}
        className="h-full"
      />

      {/* Jump to latest button */}
      {isTailing && !isFollowing && (
        <button
          onClick={() => {
            setIsFollowing(true);
            if (listRef.current && rowCount > 0) {
              listRef.current.scrollToRow({
                index: rowCount - 1,
                align: "end",
              });
            }
          }}
          className={`absolute bottom-4 right-4 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all z-10 flex items-center gap-1.5 ${
            isDark
              ? "bg-blue-600 hover:bg-blue-500 text-white"
              : "bg-blue-500 hover:bg-blue-400 text-white"
          }`}
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 2v8M2 6l4 4 4-4" />
          </svg>
          Jump to latest
        </button>
      )}

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
