import { useEffect, useCallback } from "react";
import {
  useSettingsStore,
  getSortedLogLevels,
  DEFAULT_CACHE_LIMITS,
  type LogLevelConfig,
} from "../stores/settingsStore";
import { TimePresetEditor } from "./TimePresetEditor";

// Helper to compute adaptive preview colors using color-mix formulas
function getPreviewColors(
  baseColor: string,
  isDark: boolean,
): { text: string; bg: string } {
  if (isDark) {
    return {
      text: `color-mix(in srgb, ${baseColor} 90%, white)`,
      bg: `color-mix(in srgb, ${baseColor} 20%, black)`,
    };
  } else {
    return {
      text: `color-mix(in srgb, ${baseColor} 70%, black)`,
      bg: `color-mix(in srgb, ${baseColor} 15%, white)`,
    };
  }
}

interface LogLevelEditorProps {
  level: LogLevelConfig;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
}

function LogLevelEditor({
  level,
  isFirst,
  isLast,
  canDelete,
}: LogLevelEditorProps) {
  const {
    setLogLevelStyle,
    setLogLevelKeywords,
    setLogLevelName,
    setLogLevelDefaultEnabled,
    removeLogLevel,
    moveLogLevel,
  } = useSettingsStore();

  const handleBaseColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogLevelStyle(level.id, { baseColor: e.target.value });
  };

  const handleKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const keywords = e.target.value
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    setLogLevelKeywords(level.id, keywords);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogLevelName(level.id, e.target.value);
  };

  // Compute preview colors for both themes
  const darkPreview = getPreviewColors(level.style.baseColor, true);
  const lightPreview = getPreviewColors(level.style.baseColor, false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* Move buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => moveLogLevel(level.id, "up")}
            disabled={isFirst}
            className={`p-0.5 rounded text-gray-400 cursor-pointer ${isFirst ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-700 hover:text-gray-200"}`}
            title="Move up (higher priority)"
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
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            onClick={() => moveLogLevel(level.id, "down")}
            disabled={isLast}
            className={`p-0.5 rounded text-gray-400 cursor-pointer ${isLast ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-700 hover:text-gray-200"}`}
            title="Move down (lower priority)"
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
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {/* Name input */}
        <input
          type="text"
          value={level.name}
          onChange={handleNameChange}
          className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm font-medium text-gray-200"
        />

        {/* Dual theme preview */}
        <div className="flex gap-1">
          <div
            className="px-2 py-1 rounded text-xs font-mono whitespace-nowrap"
            style={{
              color: darkPreview.text,
              backgroundColor: darkPreview.bg,
            }}
            title="Dark mode preview"
          >
            Dark
          </div>
          <div
            className="px-2 py-1 rounded text-xs font-mono whitespace-nowrap bg-gray-100"
            style={{
              color: lightPreview.text,
              backgroundColor: lightPreview.bg,
            }}
            title="Light mode preview"
          >
            Light
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={() => removeLogLevel(level.id)}
          disabled={!canDelete}
          className={`p-1 rounded cursor-pointer ${canDelete ? "text-red-400 hover:bg-red-900/30 hover:text-red-300" : "text-gray-600 cursor-not-allowed"}`}
          title={canDelete ? "Remove level" : "Cannot remove last level"}
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Base Color */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Base Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={level.style.baseColor}
            onChange={handleBaseColorChange}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-gray-600"
          />
          <span className="text-xs font-mono text-gray-500">
            {level.style.baseColor}
          </span>
          <span className="text-xs text-gray-600 ml-2">
            (auto-adjusts for dark/light themes)
          </span>
        </div>
      </div>

      {/* Keywords */}
      <div className="pt-2 border-t border-gray-700">
        <label className="block text-xs text-gray-400 mb-1">
          Keywords (comma-separated)
        </label>
        <input
          type="text"
          value={level.keywords.join(", ")}
          onChange={handleKeywordsChange}
          placeholder="error, fatal, err"
          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 placeholder-gray-600"
        />
        <p className="text-xs text-gray-500 mt-1">
          Matched in JSON level fields and log messages (case-insensitive)
        </p>
      </div>

      {/* Default Enabled Toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-700">
        <div>
          <label className="text-xs text-gray-400">Enabled</label>
          <p className="text-xs text-gray-500">
            When disabled, this level is not shown in the filter bar and will
            not be matched against logs.
          </p>
        </div>
        <button
          onClick={() =>
            setLogLevelDefaultEnabled(level.id, !level.defaultEnabled)
          }
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
            level.defaultEnabled ? "bg-blue-600" : "bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              level.defaultEnabled ? "translate-x-4.5" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const {
    theme,
    setTheme,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    logLevels,
    cacheLimits,
    setCacheLimits,
    isSettingsOpen,
    closeSettings,
    resetLogLevelDefaults,
    addLogLevel,
  } = useSettingsStore();

  const sortedLevels = getSortedLogLevels(logLevels);
  const canDelete = logLevels.length > 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSettingsOpen) {
        closeSettings();
      }
    },
    [isSettingsOpen, closeSettings],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Dialog */}
      <div className="relative bg-gray-900 rounded-lg shadow-xl w-[650px] max-h-[85vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          <button
            onClick={closeSettings}
            className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-gray-200 cursor-pointer"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Theme */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Theme
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme("system")}
                  className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                    theme === "system"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  System
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                    theme === "dark"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                    theme === "light"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            {/* Updates */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Updates
              </h3>
              <div className="flex items-center justify-between rounded-lg p-4 bg-gray-800">
                <div>
                  <label className="text-sm text-gray-200">
                    Check for updates automatically
                  </label>
                  <p className="text-xs mt-1 text-gray-500">
                    Check for new versions when the app starts
                  </p>
                </div>
                <button
                  onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    autoUpdateEnabled ? "bg-blue-600" : "bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      autoUpdateEnabled ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Cache Limits */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Cache Limits
                </h3>
                <button
                  onClick={() => setCacheLimits(DEFAULT_CACHE_LIMITS)}
                  className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Reset to Defaults
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Logs are fetched until either limit is reached (whichever comes
                first).
              </p>
              <div className="grid grid-cols-2 gap-4 bg-gray-800 rounded-lg p-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Max Log Count
                  </label>
                  <input
                    type="number"
                    value={
                      cacheLimits?.maxLogCount ??
                      DEFAULT_CACHE_LIMITS.maxLogCount
                    }
                    onChange={(e) =>
                      setCacheLimits({
                        maxLogCount: Math.max(
                          1000,
                          parseInt(e.target.value) ||
                            DEFAULT_CACHE_LIMITS.maxLogCount,
                        ),
                      })
                    }
                    min={1000}
                    max={500000}
                    step={1000}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Range: 1,000 - 500,000
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Max Size (MB)
                  </label>
                  <input
                    type="number"
                    value={
                      cacheLimits?.maxSizeMb ?? DEFAULT_CACHE_LIMITS.maxSizeMb
                    }
                    onChange={(e) =>
                      setCacheLimits({
                        maxSizeMb: Math.max(
                          10,
                          parseInt(e.target.value) ||
                            DEFAULT_CACHE_LIMITS.maxSizeMb,
                        ),
                      })
                    }
                    min={10}
                    max={1000}
                    step={10}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Range: 10 - 1,000 MB
                  </p>
                </div>
              </div>
            </div>

            {/* Time Presets */}
            <TimePresetEditor />

            {/* Log Levels */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Log Levels
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={addLogLevel}
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 cursor-pointer"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Level
                </button>
                <span className="text-gray-600">|</span>
                <button
                  onClick={resetLogLevelDefaults}
                  className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Levels are matched in order (top = highest priority). Keywords are
              matched against JSON fields (level, severity, etc.) and log
              message text. Unmatched logs appear in default gray.
            </p>
            <div className="space-y-3">
              {sortedLevels.map((level, index) => (
                <LogLevelEditor
                  key={level.id}
                  level={level}
                  isFirst={index === 0}
                  isLast={index === sortedLevels.length - 1}
                  canDelete={canDelete}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={closeSettings}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
