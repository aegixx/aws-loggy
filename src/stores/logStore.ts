import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { LogEvent, LogGroup, ParsedLogEvent, LogLevel } from '../types';

interface LogStore {
  // Connection state
  isConnected: boolean;
  connectionError: string | null;

  // Log groups
  logGroups: LogGroup[];
  selectedLogGroup: string | null;

  // Logs
  logs: ParsedLogEvent[];
  isLoading: boolean;
  error: string | null;

  // Filtering
  filterText: string;
  filteredLogs: ParsedLogEvent[];

  // Live tail
  isTailing: boolean;
  tailInterval: ReturnType<typeof setInterval> | null;

  // Actions
  initializeAws: () => Promise<void>;
  loadLogGroups: () => Promise<void>;
  selectLogGroup: (name: string) => void;
  fetchLogs: (startTime?: number, endTime?: number) => Promise<void>;
  setFilterText: (text: string) => void;
  startTail: () => void;
  stopTail: () => void;
  clearLogs: () => void;
}

function parseLogLevel(message: string): LogLevel {
  const upperMessage = message.toUpperCase();
  if (upperMessage.includes('ERROR') || upperMessage.includes('FATAL') || upperMessage.includes('"level":"error"')) {
    return 'error';
  }
  if (upperMessage.includes('WARN') || upperMessage.includes('"level":"warn"')) {
    return 'warn';
  }
  if (upperMessage.includes('INFO') || upperMessage.includes('"level":"info"')) {
    return 'info';
  }
  if (upperMessage.includes('DEBUG') || upperMessage.includes('"level":"debug"')) {
    return 'debug';
  }
  return 'unknown';
}

function tryParseJson(message: string): Record<string, unknown> | null {
  try {
    const trimmed = message.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function parseLogEvent(event: LogEvent): ParsedLogEvent {
  return {
    ...event,
    level: parseLogLevel(event.message),
    parsedJson: tryParseJson(event.message),
    formattedTime: formatTimestamp(event.timestamp),
  };
}

function filterLogs(logs: ParsedLogEvent[], filterText: string): ParsedLogEvent[] {
  if (!filterText.trim()) {
    return logs;
  }

  const lowerFilter = filterText.toLowerCase();

  // Check for field:value syntax
  const fieldMatch = filterText.match(/^(\w+(?:\.\w+)*):(.+)$/);
  if (fieldMatch) {
    const [, field, value] = fieldMatch;
    const lowerValue = value.toLowerCase();

    return logs.filter((log) => {
      if (log.parsedJson) {
        const fieldValue = getNestedValue(log.parsedJson, field);
        if (fieldValue !== undefined) {
          return String(fieldValue).toLowerCase().includes(lowerValue);
        }
      }
      return false;
    });
  }

  // Simple text search
  return logs.filter((log) => log.message.toLowerCase().includes(lowerFilter));
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const useLogStore = create<LogStore>((set, get) => ({
  // Initial state
  isConnected: false,
  connectionError: null,
  logGroups: [],
  selectedLogGroup: null,
  logs: [],
  isLoading: false,
  error: null,
  filterText: '',
  filteredLogs: [],
  isTailing: false,
  tailInterval: null,

  initializeAws: async () => {
    try {
      await invoke('init_aws_client');
      set({ isConnected: true, connectionError: null });
      await get().loadLogGroups();
    } catch (error) {
      set({
        isConnected: false,
        connectionError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  loadLogGroups: async () => {
    try {
      const groups = await invoke<LogGroup[]>('list_log_groups');
      set({ logGroups: groups });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  selectLogGroup: (name: string) => {
    const { stopTail } = get();
    stopTail();
    set({ selectedLogGroup: name, logs: [], filteredLogs: [], error: null });
  },

  fetchLogs: async (startTime?: number, endTime?: number) => {
    const { selectedLogGroup, filterText } = get();
    if (!selectedLogGroup) return;

    set({ isLoading: true, error: null });

    try {
      // Default to last 30 minutes if no time range specified
      const now = Date.now();
      const defaultStart = startTime ?? now - 30 * 60 * 1000;

      const rawLogs = await invoke<LogEvent[]>('fetch_logs', {
        logGroupName: selectedLogGroup,
        startTime: defaultStart,
        endTime: endTime ?? null,
        filterPattern: null,
        limit: 1000,
      });

      const parsedLogs = rawLogs.map(parseLogEvent);
      const filtered = filterLogs(parsedLogs, filterText);

      set({ logs: parsedLogs, filteredLogs: filtered, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  setFilterText: (text: string) => {
    const { logs } = get();
    const filtered = filterLogs(logs, text);
    set({ filterText: text, filteredLogs: filtered });
  },

  startTail: () => {
    const { isTailing, fetchLogs, selectedLogGroup } = get();
    if (isTailing || !selectedLogGroup) return;

    // Initial fetch
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    fetchLogs(thirtyMinutesAgo);

    // Set up polling
    const interval = setInterval(async () => {
      const { logs, filterText } = get();
      const lastTimestamp = logs.length > 0 ? logs[logs.length - 1].timestamp : Date.now() - 30 * 60 * 1000;

      try {
        const newLogs = await invoke<LogEvent[]>('fetch_logs', {
          logGroupName: get().selectedLogGroup,
          startTime: lastTimestamp + 1,
          endTime: null,
          filterPattern: null,
          limit: 100,
        });

        if (newLogs.length > 0) {
          const parsedNew = newLogs.map(parseLogEvent);
          const allLogs = [...get().logs, ...parsedNew];

          // Keep max 50000 logs in memory
          const trimmedLogs = allLogs.slice(-50000);
          const filtered = filterLogs(trimmedLogs, filterText);

          set({ logs: trimmedLogs, filteredLogs: filtered });
        }
      } catch (error) {
        console.error('Tail fetch error:', error);
      }
    }, 2000);

    set({ isTailing: true, tailInterval: interval });
  },

  stopTail: () => {
    const { tailInterval } = get();
    if (tailInterval) {
      clearInterval(tailInterval);
    }
    set({ isTailing: false, tailInterval: null });
  },

  clearLogs: () => {
    set({ logs: [], filteredLogs: [] });
  },
}));
