import { useEffect, useCallback, useState } from "react";
import {
  useSettingsStore,
  getSortedLogLevels,
  type LogLevelConfig,
} from "../stores/settingsStore";

function rgbaToHex(rgba: string): string {
  if (rgba === "transparent" || rgba === "rgba(0, 0, 0, 0)") {
    return "#000000";
  }
  if (rgba.startsWith("#")) {
    return rgba;
  }
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "#000000";
}

function isTransparent(color: string): boolean {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)";
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
    removeLogLevel,
    moveLogLevel,
  } = useSettingsStore();
  const [bgEnabled, setBgEnabled] = useState(
    !isTransparent(level.style.backgroundColor),
  );

  const handleTextColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogLevelStyle(level.id, { textColor: e.target.value });
  };

  const handleBgColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (bgEnabled) {
      const hex = e.target.value;
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        const rgba = `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, 0.3)`;
        setLogLevelStyle(level.id, { backgroundColor: rgba });
      }
    }
  };

  const handleBgToggle = () => {
    if (bgEnabled) {
      setLogLevelStyle(level.id, { backgroundColor: "transparent" });
      setBgEnabled(false);
    } else {
      const textHex = rgbaToHex(level.style.textColor);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(textHex);
      if (result) {
        const rgba = `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, 0.2)`;
        setLogLevelStyle(level.id, { backgroundColor: rgba });
      }
      setBgEnabled(true);
    }
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

        {/* Preview */}
        <div
          className="px-3 py-1 rounded text-sm font-mono whitespace-nowrap"
          style={{
            color: level.style.textColor,
            backgroundColor: level.style.backgroundColor,
          }}
        >
          Sample log
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

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Text Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={rgbaToHex(level.style.textColor)}
              onChange={handleTextColorChange}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border border-gray-600"
            />
            <span className="text-xs font-mono text-gray-500">
              {level.style.textColor}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Background
            <button
              onClick={handleBgToggle}
              className="ml-2 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              {bgEnabled ? "(disable)" : "(enable)"}
            </button>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={rgbaToHex(level.style.backgroundColor)}
              onChange={handleBgColorChange}
              disabled={!bgEnabled}
              className={`w-8 h-8 rounded cursor-pointer bg-transparent border border-gray-600 ${!bgEnabled ? "opacity-30" : ""}`}
            />
            <span className="text-xs font-mono text-gray-500">
              {bgEnabled ? level.style.backgroundColor : "transparent"}
            </span>
          </div>
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
    </div>
  );
}

export function SettingsDialog() {
  const {
    theme,
    setTheme,
    logLevels,
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
