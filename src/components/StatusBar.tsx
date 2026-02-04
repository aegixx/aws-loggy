import { useState } from "react";
import { useLogStore } from "../stores/logStore";
import {
  useSettingsStore,
  DEFAULT_CACHE_LIMITS,
} from "../stores/settingsStore";
import { useSystemTheme } from "../hooks/useSystemTheme";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  isDark: boolean;
}

function Tooltip({ children, content, isDark }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg shadow-lg text-xs whitespace-nowrap z-50 ${
            isDark
              ? "bg-gray-700 text-gray-100 border border-gray-600"
              : "bg-white text-gray-800 border border-gray-300"
          }`}
        >
          {content}
          <div
            className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
              isDark ? "border-t-gray-700" : "border-t-white"
            }`}
          />
        </div>
      )}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  formatValue: (v: number) => string;
  formatMax: (v: number) => string;
  isDark: boolean;
}

function ProgressBar({
  value,
  max,
  label,
  formatValue,
  formatMax,
  isDark,
}: ProgressBarProps) {
  const percent = Math.min((value / max) * 100, 100);

  return (
    <Tooltip
      isDark={isDark}
      content={
        <div className="space-y-1">
          <div className="font-medium">{label}</div>
          <div>
            Current: <span className="font-mono">{formatValue(value)}</span>
          </div>
          <div>
            Limit: <span className="font-mono">{formatMax(max)}</span>
          </div>
          <div>
            Usage: <span className="font-mono">{percent.toFixed(1)}%</span>
          </div>
        </div>
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] opacity-70 w-8">{label}</span>
        <div
          className={`w-16 h-1.5 rounded-full overflow-hidden ${
            isDark ? "bg-gray-700" : "bg-gray-300"
          }`}
        >
          <div
            className={`h-full transition-all duration-300 ${
              percent > 90
                ? "bg-red-500"
                : percent > 70
                  ? "bg-yellow-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="w-8 text-[10px] text-right font-mono">
          {percent < 1 && value > 0 ? "<1%" : `${Math.round(percent)}%`}
        </span>
      </div>
    </Tooltip>
  );
}

interface StatusBarProps {
  isCheckingForUpdates?: boolean;
}

export function StatusBar({ isCheckingForUpdates }: StatusBarProps) {
  const {
    logs,
    filteredLogs,
    isLoading,
    loadingProgress,
    loadingSizeBytes,
    totalSizeBytes,
    selectedLogGroup,
    isTailing,
    isFollowing,
  } = useLogStore();
  const { cacheLimits } = useSettingsStore();
  const isDark = useSystemTheme();

  if (!selectedLogGroup) {
    return null;
  }

  const totalLogs = logs.length;
  const shownLogs = filteredLogs.length;
  const isFiltered = shownLogs !== totalLogs;

  const maxCount = cacheLimits?.maxLogCount ?? DEFAULT_CACHE_LIMITS.maxLogCount;
  const maxSizeBytes =
    (cacheLimits?.maxSizeMb ?? DEFAULT_CACHE_LIMITS.maxSizeMb) * 1024 * 1024;

  return (
    <div
      className={`flex items-center justify-between px-3 py-1.5 text-xs border-t ${
        isDark
          ? "bg-gray-800 border-gray-700 text-gray-400"
          : "bg-gray-100 border-gray-300 text-gray-600"
      }`}
    >
      {/* Left side - log counts */}
      <div className="flex items-center gap-4">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
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
            <span>
              Loading...{" "}
              {loadingProgress > 0 && (
                <>
                  <span className={isDark ? "text-gray-200" : "text-gray-800"}>
                    {loadingProgress.toLocaleString()}
                  </span>{" "}
                  logs
                  {loadingSizeBytes > 0 && (
                    <span className="ml-1 opacity-70">
                      ({formatBytes(loadingSizeBytes)})
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        ) : (
          <span>
            {isFiltered ? (
              <>
                Showing{" "}
                <span className={isDark ? "text-gray-200" : "text-gray-800"}>
                  {shownLogs.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className={isDark ? "text-gray-200" : "text-gray-800"}>
                  {totalLogs.toLocaleString()}
                </span>{" "}
                logs
              </>
            ) : (
              <>
                <span className={isDark ? "text-gray-200" : "text-gray-800"}>
                  {totalLogs.toLocaleString()}
                </span>{" "}
                logs
              </>
            )}
            {totalSizeBytes > 0 && (
              <span className="ml-1 opacity-70">
                ({formatBytes(totalSizeBytes)})
              </span>
            )}
          </span>
        )}
        {isTailing && (
          <span
            className={`flex items-center gap-1 ${
              isFollowing
                ? isDark
                  ? "text-green-400"
                  : "text-green-600"
                : isDark
                  ? "text-yellow-400"
                  : "text-yellow-600"
            }`}
          >
            <span className="text-[10px]">
              {isFollowing ? "\u25CF" : "\u25CB"}
            </span>
            Follow: {isFollowing ? "ON" : "OFF"}
          </span>
        )}
      </div>

      {/* Right side - cache usage and update check */}
      <div className="flex items-center gap-3">
        {isCheckingForUpdates && (
          <div className="flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
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
            <span className="text-[10px]">Checking for updates...</span>
          </div>
        )}
        <ProgressBar
          value={isLoading ? loadingProgress : totalLogs}
          max={maxCount}
          label="Count"
          formatValue={(v) => v.toLocaleString()}
          formatMax={(v) => v.toLocaleString()}
          isDark={isDark}
        />
        <ProgressBar
          value={isLoading ? loadingSizeBytes : totalSizeBytes}
          max={maxSizeBytes}
          label="Size"
          formatValue={formatBytes}
          formatMax={formatBytes}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
