import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  memo,
  CSSProperties,
} from "react";
import { List, ListImperativeAPI } from "react-window";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { MergedFilterBar, getSourceColor } from "./MergedFilterBar";
import { LogRowDetail } from "./LogRowDetail";
import { MaximizedLogView } from "./MaximizedLogView";
import { useSystemTheme } from "../hooks/useSystemTheme";
import type { ParsedLogEvent } from "../types";
import type { MergedLogRef } from "../types/workspace";

const ROW_HEIGHT = 24;
const DETAIL_HEIGHT = 200;

function getLogLevelStyle(level: string): {
  color: string;
  backgroundColor: string;
} {
  return {
    color: `var(--log-${level}-text, var(--log-unknown-text, #d1d5db))`,
    backgroundColor: `var(--log-${level}-bg, var(--log-unknown-bg, transparent))`,
  };
}

/** Build a panelId → index map for consistent source colors */
function buildPanelIndexMap(
  panels: Map<string, { logGroupName: string | null }>,
): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const [panelId, panel] of panels) {
    if (panel.logGroupName) {
      map.set(panelId, idx++);
    }
  }
  return map;
}

interface MergedRowProps {
  refs: MergedLogRef[];
  eventKeyMap: Map<string, ParsedLogEvent>;
  panelIndexMap: Map<string, number>;
  panelLabels: Map<string, string>;
  expandedIndex: number | null;
  selectedIndex: number | null;
  onRowClick: (index: number) => void;
  onClose: () => void;
  onMaximize: (log: ParsedLogEvent) => void;
  isDark: boolean;
  correlationField: string | null;
  correlationValue: string | null;
}

interface MergedRowComponentProps {
  index: number;
  style: CSSProperties;
  refs: MergedLogRef[];
  eventKeyMap: Map<string, ParsedLogEvent>;
  panelIndexMap: Map<string, number>;
  panelLabels: Map<string, string>;
  expandedIndex: number | null;
  selectedIndex: number | null;
  onRowClick: (index: number) => void;
  onClose: () => void;
  onMaximize: (log: ParsedLogEvent) => void;
  isDark: boolean;
  correlationField: string | null;
  correlationValue: string | null;
}

const MergedLogRow = memo(function MergedLogRow({
  index,
  style,
  refs,
  eventKeyMap,
  panelIndexMap,
  panelLabels,
  expandedIndex,
  selectedIndex,
  onRowClick,
  onClose,
  onMaximize,
  isDark,
  correlationField,
  correlationValue,
}: MergedRowComponentProps) {
  const isDetailRow = expandedIndex !== null && index === expandedIndex + 1;

  if (isDetailRow) {
    const ref = refs[expandedIndex];
    const log = ref ? eventKeyMap.get(ref.eventKey) : undefined;
    if (!log) return <div style={style} />;
    return (
      <LogRowDetail
        log={log}
        style={style}
        isDark={isDark}
        onClose={onClose}
        onMaximize={onMaximize}
        onContextMenu={() => {}}
        expandedIndex={expandedIndex}
      />
    );
  }

  const actualIndex =
    expandedIndex !== null && index > expandedIndex ? index - 1 : index;
  const ref = refs[actualIndex];
  if (!ref) return <div style={style} />;

  const log = eventKeyMap.get(ref.eventKey);
  if (!log) return <div style={style} />;

  const isExpanded = expandedIndex === actualIndex;
  const isSelected = selectedIndex === actualIndex;
  const levelStyle = getLogLevelStyle(log.level);
  const panelIdx = panelIndexMap.get(ref.panelId) ?? 0;
  const sourceColor = getSourceColor(panelIdx);
  const sourceLabel = panelLabels.get(ref.panelId) ?? "";

  // Check correlation highlight
  let isCorrelated = false;
  if (correlationField && correlationValue && log.parsedJson) {
    const value = getNestedFieldValue(log.parsedJson, correlationField);
    if (value === correlationValue) {
      isCorrelated = true;
    }
  }

  let rowClasses =
    "flex items-center px-3 font-mono text-xs border-b cursor-pointer transition-colors border-l-2 select-none ";
  if (isExpanded) {
    rowClasses += `border-l-blue-500 ${isDark ? "bg-blue-900/30" : "bg-blue-100"}`;
  } else if (isCorrelated) {
    rowClasses += `border-l-yellow-400 ${isDark ? "bg-yellow-900/20" : "bg-yellow-50"}`;
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

  const displayMessage =
    log.message.length > 2000 ? log.message.substring(0, 2000) : log.message;

  return (
    <div
      style={{
        ...style,
        color: levelStyle.color,
        backgroundColor:
          isExpanded || isSelected || isCorrelated
            ? undefined
            : levelStyle.backgroundColor,
      }}
      onClick={() => onRowClick(actualIndex)}
      className={rowClasses}
    >
      {/* Source badge */}
      <span
        className={`shrink-0 px-1 py-0 rounded text-[9px] font-medium mr-2 truncate max-w-20 ${sourceColor.bg} ${sourceColor.text}`}
        title={panelLabels.get(ref.panelId) ?? ref.panelId}
      >
        {sourceLabel}
      </span>

      {/* Timestamp */}
      <span
        className={`w-36 shrink-0 ${isDark ? "text-gray-500" : "text-gray-500"}`}
      >
        {log.formattedTime}
      </span>

      {/* Message */}
      <span className="flex-1 truncate">{displayMessage}</span>
    </div>
  );
});

/** Get a nested field value from a JSON object using dot notation */
function getNestedFieldValue(
  obj: Record<string, unknown>,
  field: string,
): string | null {
  const parts = field.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  if (typeof current === "string") return current;
  if (typeof current === "number") return String(current);
  return null;
}

export function MergedPanelView() {
  const isDark = useSystemTheme();
  const panels = useWorkspaceStore((s) => s.panels);
  const mergedLogRefs = useWorkspaceStore((s) => s.mergedLogRefs);
  const mergedEventKeyMap = useWorkspaceStore((s) => s.mergedEventKeyMap);
  const recomputeMergedLogs = useWorkspaceStore((s) => s.recomputeMergedLogs);
  const correlationHighlight = useWorkspaceStore((s) => s.correlationHighlight);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [maximizedLog, setMaximizedLog] = useState<ParsedLogEvent | null>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build panel index map for source colors
  const panelIndexMap = useMemo(() => buildPanelIndexMap(panels), [panels]);

  // Build panel label map
  const panelLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const [panelId, panel] of panels) {
      if (panel.logGroupName) {
        const parts = panel.logGroupName.split("/");
        map.set(panelId, parts[parts.length - 1] || panel.logGroupName);
      }
    }
    return map;
  }, [panels]);

  // Recompute merged logs when any panel's filteredLogs change
  // Use a hash of panel log lengths to detect changes
  const panelLogHash = useMemo(() => {
    const parts: string[] = [];
    for (const [panelId, panel] of panels) {
      if (panel.logGroupName) {
        parts.push(`${panelId}:${panel.filteredLogs.length}`);
      }
    }
    return parts.join(",");
  }, [panels]);

  useEffect(() => {
    recomputeMergedLogs();
  }, [panelLogHash, recomputeMergedLogs]);

  const handleRowClick = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      setExpandedIndex(expandedIndex === index ? null : index);
    },
    [expandedIndex],
  );

  const handleCloseDetail = useCallback(() => {
    setExpandedIndex(null);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedIndex !== null) {
          setExpandedIndex(null);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(
          (selectedIndex ?? -1) + 1,
          mergedLogRefs.length - 1,
        );
        setSelectedIndex(next);
        if (listRef.current) {
          listRef.current.scrollToRow({ index: next, align: "smart" });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max((selectedIndex ?? 1) - 1, 0);
        setSelectedIndex(prev);
        if (listRef.current) {
          listRef.current.scrollToRow({ index: prev, align: "smart" });
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex !== null) {
          handleRowClick(selectedIndex);
        }
      }
    },
    [expandedIndex, selectedIndex, mergedLogRefs.length, handleRowClick],
  );

  const rowCount =
    expandedIndex !== null ? mergedLogRefs.length + 1 : mergedLogRefs.length;

  const getRowHeight = useCallback(
    (index: number) => {
      if (expandedIndex !== null && index === expandedIndex + 1) {
        return DETAIL_HEIGHT;
      }
      return ROW_HEIGHT;
    },
    [expandedIndex],
  );

  // Check if any panels have logs
  const hasAnyLogs = mergedLogRefs.length > 0;
  const hasAnyPanelsWithLogGroups = [...panels.values()].some(
    (p) => p.logGroupName,
  );
  const isAnyLoading = [...panels.values()].some((p) => p.isLoading);

  if (!hasAnyPanelsWithLogGroups) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <MergedFilterBar />
        <div
          className={`flex-1 flex items-center justify-center ${
            isDark ? "text-gray-500" : "text-gray-600"
          }`}
        >
          Select log groups in individual tabs to see merged logs
        </div>
      </div>
    );
  }

  if (isAnyLoading && !hasAnyLogs) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <MergedFilterBar />
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
      </div>
    );
  }

  if (!hasAnyLogs) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <MergedFilterBar />
        <div
          className={`flex-1 flex items-center justify-center ${
            isDark ? "text-gray-500" : "text-gray-600"
          }`}
        >
          No logs found. Try adjusting the time range or filter.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MergedFilterBar />
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden focus:outline-none relative"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <List<MergedRowProps>
          listRef={listRef}
          rowCount={rowCount}
          rowHeight={getRowHeight}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rowComponent={MergedLogRow as any}
          rowProps={{
            refs: mergedLogRefs,
            eventKeyMap: mergedEventKeyMap,
            panelIndexMap,
            panelLabels,
            expandedIndex,
            selectedIndex,
            onRowClick: handleRowClick,
            onClose: handleCloseDetail,
            onMaximize: setMaximizedLog,
            isDark,
            correlationField: correlationHighlight?.field ?? null,
            correlationValue: correlationHighlight?.value ?? null,
          }}
          overscanCount={20}
          className="h-full"
        />

        {maximizedLog && (
          <MaximizedLogView
            log={maximizedLog}
            onClose={() => setMaximizedLog(null)}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
}
