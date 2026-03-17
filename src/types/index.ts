export interface LogEvent {
  timestamp: number;
  message: string;
  log_stream_name: string | null;
  event_id: string | null;
}

export interface LogGroup {
  name: string;
  arn: string | null;
  stored_bytes: number | null;
}

// Log level is now a dynamic string (level ID from settings, or "unknown" for unmatched)
export type LogLevel = string;

export interface ParsedLogEvent extends LogEvent {
  level: LogLevel;
  parsedJson: Record<string, unknown> | null;
  formattedTime: string;
}

export interface LiveTailEventPayload {
  panel_id: string;
  logs: LogEvent[];
  count: number;
}

export interface LiveTailErrorPayload {
  panel_id: string;
  message: string;
}

export interface LiveTailEndedPayload {
  panel_id: string;
}

export interface LogsProgressPayload {
  panel_id: string;
  fetch_id: number;
  count: number;
  size_bytes: number;
}

export interface LogsTruncatedPayload {
  panel_id: string;
  count: number;
  size_bytes: number;
  reason: string;
}

export type GroupByMode = "none" | "stream" | "invocation";
