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

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

export interface ParsedLogEvent extends LogEvent {
  level: LogLevel;
  parsedJson: Record<string, unknown> | null;
  formattedTime: string;
}
