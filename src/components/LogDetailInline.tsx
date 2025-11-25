import { useEffect, useCallback } from "react";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import type { ParsedLogEvent } from "../types";

interface LogDetailInlineProps {
  log: ParsedLogEvent;
  onClose: () => void;
}

export function LogDetailInline({ log, onClose }: LogDetailInlineProps) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(log.message);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [log.message]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  return (
    <div className="bg-gray-900 border-t border-gray-700 border-l-2 border-l-blue-500 p-4 animate-in slide-in-from-bottom-1 duration-150">
      {/* Header with metadata - click to collapse */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="space-y-1 flex-1 cursor-pointer hover:bg-gray-800/30 -m-1 p-1 rounded transition-colors"
          onClick={onClose}
          title="Click to collapse"
        >
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              <span className="text-gray-600">Timestamp:</span>{" "}
              <span className="text-gray-300">{fullTimestamp}</span>
            </span>
            {log.log_stream_name && (
              <span className="text-gray-400">
                <span className="text-gray-600">Stream:</span>{" "}
                <span className="text-gray-300 font-mono">
                  {log.log_stream_name}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
            title="Copy raw message"
          >
            Copy
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
      </div>

      {/* Log content */}
      <div className="bg-gray-950 rounded p-3 overflow-auto max-h-80">
        {log.parsedJson ? (
          <JsonSyntaxHighlight data={log.parsedJson} />
        ) : (
          <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap break-all">
            {log.message}
          </pre>
        )}
      </div>
    </div>
  );
}
