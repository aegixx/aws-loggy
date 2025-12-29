import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { VscExpandAll, VscCollapseAll } from "react-icons/vsc";
import { JsonSyntaxHighlight } from "./JsonSyntaxHighlight";
import { FindBar } from "./FindBar";
import {
  highlightText,
  findAllMatches,
  defaultHighlightOptions,
  type HighlightOptions,
} from "../utils/highlightMatches";
import type { ParsedLogEvent } from "../types";

interface MaximizedLogViewProps {
  log: ParsedLogEvent;
  onClose: () => void;
  isDark: boolean;
}

function getLogLevelStyle(level: string): {
  color: string;
  backgroundColor: string;
} {
  return {
    color: `var(--log-${level}-text, var(--log-unknown-text, #d1d5db))`,
    backgroundColor: `var(--log-${level}-bg, var(--log-unknown-bg, transparent))`,
  };
}

export function MaximizedLogView({
  log,
  onClose,
  isDark,
}: MaximizedLogViewProps) {
  const [copied, setCopied] = useState(false);
  // Track expand/collapse state - increment key to force remount with new defaultExpanded
  const [expandState, setExpandState] = useState<{
    expanded: boolean;
    key: number;
  }>({ expanded: true, key: 0 });

  // Local find state
  const [findOpen, setFindOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOptions, setSearchOptions] = useState<HighlightOptions>(
    defaultHighlightOptions,
  );
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Count matches in the log message
  const matches = useMemo(() => {
    if (!findOpen || !searchTerm) return [];
    return findAllMatches(log.message, searchTerm, searchOptions);
  }, [findOpen, searchTerm, searchOptions, log.message]);

  const handleExpandAll = useCallback(() => {
    setExpandState((prev) => ({ expanded: true, key: prev.key + 1 }));
  }, []);

  const handleCollapseAll = useCallback(() => {
    setExpandState((prev) => ({ expanded: false, key: prev.key + 1 }));
  }, []);

  const handleOpenFind = useCallback(() => {
    setFindOpen(true);
    setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  }, []);

  const handleCloseFind = useCallback(() => {
    setFindOpen(false);
    setSearchTerm("");
    setCurrentMatchIndex(0);
  }, []);

  const handleSearchTermChange = useCallback((term: string) => {
    setSearchTerm(term);
    setCurrentMatchIndex(0);
  }, []);

  const handleToggleOption = useCallback((option: keyof HighlightOptions) => {
    setSearchOptions((prev) => ({
      ...prev,
      [option]: !prev[option],
    }));
    setCurrentMatchIndex(0);
  }, []);

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (matches.length === 0) return;
      if (direction === "next") {
        setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
      } else {
        setCurrentMatchIndex(
          (prev) => (prev - 1 + matches.length) % matches.length,
        );
      }
    },
    [matches.length],
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F to open find
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        handleOpenFind();
        return;
      }

      // ESC to close find first, then close overlay
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (findOpen) {
          handleCloseFind();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, findOpen, handleOpenFind, handleCloseFind]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(log.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [log.message]);

  // Format full timestamp with milliseconds
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

  const levelStyle = getLogLevelStyle(log.level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content container */}
      <div
        className={`relative w-full h-full max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] m-4 rounded-lg border flex flex-col ${
          isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-300"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isDark ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-4 text-sm">
            <span className={isDark ? "text-gray-400" : "text-gray-600"}>
              <span className={isDark ? "text-gray-500" : "text-gray-500"}>
                Timestamp:
              </span>{" "}
              <span className={isDark ? "text-gray-200" : "text-gray-800"}>
                {fullTimestamp}
              </span>
            </span>
            {log.log_stream_name && (
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                <span className={isDark ? "text-gray-500" : "text-gray-500"}>
                  Stream:
                </span>{" "}
                <span
                  className={`font-mono text-xs ${isDark ? "text-gray-200" : "text-gray-800"}`}
                >
                  {log.log_stream_name}
                </span>
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                color: levelStyle.color,
                backgroundColor: levelStyle.backgroundColor,
              }}
            >
              {log.level.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {log.parsedJson && (
              <>
                <button
                  onClick={handleExpandAll}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    isDark
                      ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                      : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                  }`}
                  title="Expand all JSON nodes"
                >
                  <VscExpandAll className="w-5 h-5" />
                </button>
                <button
                  onClick={handleCollapseAll}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    isDark
                      ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                      : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                  }`}
                  title="Collapse all JSON nodes"
                >
                  <VscCollapseAll className="w-5 h-5" />
                </button>
                <div
                  className={`w-px h-5 mx-1 ${isDark ? "bg-gray-600" : "bg-gray-300"}`}
                />
              </>
            )}
            <button
              onClick={handleCopy}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                copied
                  ? "bg-green-600 text-white"
                  : isDark
                    ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                    : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
              }`}
              title="Copy raw message"
            >
              {copied ? (
                <svg
                  className="w-5 h-5"
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
                  className="w-5 h-5"
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
              onClick={onClose}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isDark
                  ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                  : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
              }`}
              title="Close (Esc)"
            >
              <svg
                className="w-5 h-5"
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

        {/* FindBar */}
        <FindBar
          isOpen={findOpen}
          onClose={handleCloseFind}
          searchTerm={searchTerm}
          onSearchTermChange={handleSearchTermChange}
          options={searchOptions}
          onToggleOption={handleToggleOption}
          currentMatchIndex={currentMatchIndex}
          totalMatches={matches.length}
          onNavigate={handleNavigate}
          inputRef={findInputRef}
          isDark={isDark}
        />

        {/* Content */}
        <div
          className={`flex-1 overflow-auto p-4 ${
            isDark ? "bg-gray-950" : "bg-gray-50"
          }`}
        >
          {log.parsedJson ? (
            <JsonSyntaxHighlight
              key={expandState.key}
              data={log.parsedJson}
              defaultExpanded={expandState.expanded}
              isDark={isDark}
              searchTerm={findOpen ? searchTerm : undefined}
              searchOptions={findOpen ? searchOptions : undefined}
            />
          ) : (
            <pre
              className={`font-mono text-sm leading-relaxed whitespace-pre-wrap break-all ${
                isDark ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {findOpen && searchTerm
                ? highlightText(
                    log.message,
                    searchTerm,
                    searchOptions,
                    currentMatchIndex,
                  )
                : log.message}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
