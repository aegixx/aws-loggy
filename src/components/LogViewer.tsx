import { useRef, useEffect, useCallback, CSSProperties } from 'react';
import { List, ListImperativeAPI } from 'react-window';
import { useLogStore } from '../stores/logStore';
import type { ParsedLogEvent } from '../types';

const ROW_HEIGHT = 24;

function getLogLevelClass(level: ParsedLogEvent['level']): string {
  switch (level) {
    case 'error':
      return 'log-error';
    case 'warn':
      return 'log-warn';
    case 'info':
      return 'log-info';
    case 'debug':
      return 'log-debug';
    default:
      return '';
  }
}

interface LogRowProps {
  logs: ParsedLogEvent[];
}

interface RowComponentPropsWithCustom {
  index: number;
  style: CSSProperties;
  logs: ParsedLogEvent[];
}

function LogRow({ index, style, logs }: RowComponentPropsWithCustom) {
  const log = logs[index];

  return (
    <div
      style={style}
      className={`flex items-center px-3 font-mono text-xs border-b border-gray-800/50 hover:bg-gray-800/30 ${getLogLevelClass(log.level)}`}
    >
      <span className="w-36 flex-shrink-0 text-gray-500">{log.formattedTime}</span>
      <span className="flex-1 truncate" title={log.message}>
        {log.message}
      </span>
    </div>
  );
}

export function LogViewer() {
  const { filteredLogs, isLoading, error, selectedLogGroup, isTailing } = useLogStore();
  const listRef = useRef<ListImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Auto-scroll to bottom when tailing and new logs arrive
  useEffect(() => {
    if (isTailing && shouldAutoScroll.current && listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToRow({ index: filteredLogs.length - 1, align: 'end' });
    }
  }, [filteredLogs.length, isTailing, listRef]);

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      // If we're near the bottom, enable auto-scroll
      const isNearBottom = visibleRows.stopIndex >= filteredLogs.length - 5;
      shouldAutoScroll.current = isNearBottom;
    },
    [filteredLogs.length]
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
        rowCount={filteredLogs.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={LogRow}
        rowProps={{ logs: filteredLogs }}
        onRowsRendered={handleRowsRendered}
        overscanCount={20}
        className="h-full"
      />
    </div>
  );
}
