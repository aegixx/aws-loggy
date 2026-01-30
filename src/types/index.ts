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
  logs: LogEvent[];
  count: number;
}

export interface LiveTailErrorPayload {
  message: string;
}
