import { useState, type CSSProperties } from "react";
import { MdTimer, MdMemory, MdSchedule } from "react-icons/md";
import type { LogGroupSection } from "../utils/groupLogs";

interface GroupHeaderProps {
  group: LogGroupSection;
  collapsed: boolean;
  onToggle: () => void;
  getVisibleMessages?: (group: LogGroupSection) => string;
  getVisibleCount?: (group: LogGroupSection) => number;
  isDark: boolean;
  style: CSSProperties;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) {
    return "just now";
  } else if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  } else if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  } else {
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }
}

function formatCompactTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return "<1s";
  } else if (ms < 60_000) {
    return `${Math.round(ms / 1_000)}s`;
  } else if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  } else {
    return `${Math.round(ms / 3_600_000)}h`;
  }
}

export function GroupHeader({
  group,
  collapsed,
  onToggle,
  getVisibleMessages,
  getVisibleCount,
  isDark,
  style,
}: GroupHeaderProps) {
  const [copied, setCopied] = useState(false);
  const { metadata } = group;
  const isInvocation = metadata.requestId !== undefined;
  const isInit = metadata.initDuration !== undefined;

  const handleCopy = async () => {
    try {
      const messages = getVisibleMessages
        ? getVisibleMessages(group)
        : group.logs.map((log) => log.message).join("\n");
      await navigator.clipboard.writeText(messages);
      setCopied(true);
      setTimeout(() => setCopied(false), 500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div
      style={style}
      onClick={onToggle}
      className={`group flex items-center gap-3 px-3 font-mono text-xs border-b cursor-pointer select-none ${
        isDark
          ? "bg-gray-750 border-gray-700 hover:bg-gray-700"
          : "bg-gray-200 border-gray-300 hover:bg-gray-250"
      }`}
    >
      {/* Collapse chevron */}
      <span
        className={`transition-transform text-[10px] ${collapsed ? "" : "rotate-90"} ${
          isDark ? "text-gray-500" : "text-gray-400"
        }`}
      >
        &#9654;
      </span>

      {/* Error indicator */}
      {metadata.hasError && (
        <span
          className="w-2 h-2 bg-red-500 rounded-full shrink-0"
          title="Contains errors"
        />
      )}

      {/* Group label */}
      <span
        className={`truncate font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}
      >
        {isInvocation ? metadata.requestId : group.label}
      </span>

      {/* Stream time range (non-invocation groups) */}
      {!isInvocation && (
        <span
          className={`flex items-center gap-0.5 text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}
          title={`${formatCompactTime(metadata.firstTimestamp)} → ${formatCompactTime(metadata.lastTimestamp)}`}
        >
          <MdSchedule className="w-3 h-3" />
          {formatCompactTime(metadata.firstTimestamp)} →{" "}
          {formatCompactTime(metadata.lastTimestamp)}
        </span>
      )}

      {/* Invocation metadata badges */}
      {isInvocation && (
        <>
          {metadata.inProgress ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400">
              In progress
            </span>
          ) : (
            <>
              {metadata.duration !== undefined && (
                <span
                  className={`flex items-center gap-0.5 text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}
                  title={`${metadata.duration.toFixed(2)} ms`}
                >
                  <MdTimer className="w-3 h-3" />
                  {formatDuration(metadata.duration)}
                </span>
              )}
              {metadata.memoryUsed !== undefined &&
                metadata.memoryAllocated !== undefined && (
                  <span
                    className={`flex items-center gap-0.5 text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}
                    title={`${metadata.memoryUsed} / ${metadata.memoryAllocated} MB`}
                  >
                    <MdMemory className="w-3 h-3" />
                    {Math.round(
                      (metadata.memoryUsed / metadata.memoryAllocated) * 100,
                    )}
                    %
                  </span>
                )}
            </>
          )}
        </>
      )}

      {/* Init duration badge (cold start groups) */}
      {isInit && (
        <span
          className={`flex items-center gap-0.5 text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}
          title={`${metadata.initDuration!.toFixed(2)} ms`}
        >
          <MdTimer className="w-3 h-3" />
          {formatDuration(metadata.initDuration!)}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Copy button (visible on hover, or always when showing copied state) */}
      <button
        title="Copy group logs"
        onClick={(e) => {
          e.stopPropagation();
          handleCopy();
        }}
        className={`${copied ? "flex" : "hidden group-hover:flex"} items-center cursor-pointer p-1 rounded transition-colors ${
          copied
            ? "bg-green-600 text-white"
            : isDark
              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
              : "bg-gray-200 hover:bg-gray-300 text-gray-700"
        }`}
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

      {/* Log count */}
      <span
        className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}
      >
        {(() => {
          const visible = getVisibleCount
            ? getVisibleCount(group)
            : metadata.logCount;
          if (visible < metadata.logCount) {
            return `${visible} of ${metadata.logCount}`;
          } else {
            return metadata.logCount;
          }
        })()}
      </span>

      {/* Relative time */}
      <span
        className={`text-[10px] w-16 text-right ${isDark ? "text-gray-500" : "text-gray-400"}`}
      >
        {formatRelativeTime(metadata.lastTimestamp)}
      </span>
    </div>
  );
}
