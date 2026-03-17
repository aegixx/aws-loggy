import type { LogEvent, ParsedLogEvent, LogLevel } from "../types";
import {
  useSettingsStore,
  LOG_LEVEL_JSON_FIELDS,
  getSortedLogLevels,
} from "../stores/settingsStore";
import { getKeywordRegex } from "./logFiltering";

export function tryParseJson(message: string): Record<string, unknown> | null {
  try {
    const trimmed = message.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

export function isIncompleteJson(msg: string): boolean {
  const trimmed = msg.trim();
  if (!trimmed.startsWith("{")) return false;
  let depth = 0;
  let inString = false;
  let prevChar = "";
  for (const char of trimmed) {
    if (char === '"' && prevChar !== "\\") {
      inString = !inString;
    }
    if (!inString) {
      if (char === "{") depth++;
      if (char === "}") depth--;
    }
    prevChar = char;
  }
  return depth !== 0;
}

export const MERGE_TIMESTAMP_THRESHOLD_MS = 100;

export function shouldMerge(
  first: LogEvent,
  candidate: LogEvent,
  accumulated: string,
): boolean {
  if (first.log_stream_name !== candidate.log_stream_name) return false;
  if (
    Math.abs(first.timestamp - candidate.timestamp) >
    MERGE_TIMESTAMP_THRESHOLD_MS
  )
    return false;
  return isIncompleteJson(accumulated);
}

export function mergeFragmentedLogs(logs: LogEvent[]): LogEvent[] {
  const result: LogEvent[] = [];
  let i = 0;
  while (i < logs.length) {
    const current = logs[i];
    if (isIncompleteJson(current.message)) {
      let merged = current.message;
      let j = i + 1;
      while (j < logs.length && shouldMerge(current, logs[j], merged)) {
        merged += logs[j].message;
        j++;
      }
      result.push({ ...current, message: merged });
      i = j;
    } else {
      result.push(current);
      i++;
    }
  }
  return result;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function parseLogLevel(
  message: string,
  parsedJson: Record<string, unknown> | null,
): LogLevel {
  const { logLevels } = useSettingsStore.getState();
  const sortedLevels = getSortedLogLevels(logLevels);
  if (parsedJson) {
    for (const field of LOG_LEVEL_JSON_FIELDS) {
      const fieldValue = parsedJson[field];
      if (typeof fieldValue === "string") {
        const valueLower = fieldValue.toLowerCase();
        for (const level of sortedLevels) {
          if (level.keywords.some((k) => k.toLowerCase() === valueLower)) {
            return level.id;
          }
        }
      }
    }
  }
  for (const level of sortedLevels) {
    for (const keyword of level.keywords) {
      if (getKeywordRegex(keyword).test(message)) {
        return level.id;
      }
    }
  }
  return "unknown";
}

export function parseLogEvent(event: LogEvent): ParsedLogEvent {
  const parsedJson = tryParseJson(event.message);
  return {
    ...event,
    level: parseLogLevel(event.message, parsedJson),
    parsedJson,
    formattedTime: formatTimestamp(event.timestamp),
  };
}
