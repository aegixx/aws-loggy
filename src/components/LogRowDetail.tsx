import { useState } from "react";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import {
  highlightText,
  type HighlightOptions,
} from "../utils/highlightMatches";
import type { ParsedLogEvent } from "../types";

interface LogRowDetailProps {
  log: ParsedLogEvent;
  style: React.CSSProperties;
  isDark: boolean;
  onClose: () => void;
  onMaximize: (log: ParsedLogEvent) => void;
  onContextMenu: (
    index: number,
    e: React.MouseEvent,
    isDetailView: boolean,
  ) => void;
  expandedIndex: number;
  searchTerm?: string;
  searchOptions?: HighlightOptions;
  currentMatchLogIndex?: number | null;
  globalCurrentMatchIndex?: number;
  getMatchesForLog?: (
    logIndex: number,
  ) => { index: number; start: number; length: number }[];
}

/**
 * Expanded detail view for a single log entry.
 * Shows full timestamp, stream name, and formatted log content.
 */
export function LogRowDetail({
  log,
  style,
  isDark,
  onClose,
  onMaximize,
  onContextMenu,
  expandedIndex,
  searchTerm,
  searchOptions,
  currentMatchLogIndex,
  globalCurrentMatchIndex,
  getMatchesForLog,
}: LogRowDetailProps) {
  const [copied, setCopied] = useState(false);

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
