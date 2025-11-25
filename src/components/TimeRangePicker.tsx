import { useState, useRef, useEffect } from "react";
import { useLogStore } from "../stores/logStore";

interface TimePreset {
  label: string;
  ms: number;
}

const TIME_PRESETS: TimePreset[] = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocal(value: string): number {
  return new Date(value).getTime();
}

export function TimeRangePicker() {
  const { isTailing, startTail, stopTail, setTimeRange, selectedLogGroup } =
    useLogStore();
  const [showCustom, setShowCustom] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("30m");
  const [customStart, setCustomStart] = useState(() =>
    formatDateTimeLocal(Date.now() - 60 * 60 * 1000),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    formatDateTimeLocal(Date.now()),
  );
  const customRef = useRef<HTMLDivElement>(null);

  // Close custom picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setShowCustom(false);
      }
    }
    if (showCustom) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCustom]);

  const handleLiveClick = () => {
    if (isTailing) {
      stopTail();
    } else {
      setActivePreset(null);
      startTail();
    }
  };

  const handlePresetClick = (preset: TimePreset) => {
    if (isTailing) stopTail();
    setActivePreset(preset.label);
    setShowCustom(false);
    const now = Date.now();
    setTimeRange({ start: now - preset.ms, end: null });
  };

  const handleCustomApply = () => {
    if (isTailing) stopTail();
    setActivePreset("custom");
    const start = parseDateTimeLocal(customStart);
    const end = parseDateTimeLocal(customEnd);
    setTimeRange({ start, end });
    setShowCustom(false);
  };

  const isDisabled = !selectedLogGroup;

  return (
    <div className="flex items-center gap-1 relative">
      {/* Live button */}
      <button
        onClick={handleLiveClick}
        disabled={isDisabled}
        className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
          isTailing
            ? "bg-green-600 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isTailing && (
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        )}
        Live
      </button>

      {/* Preset buttons */}
      {TIME_PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => handlePresetClick(preset)}
          disabled={isDisabled}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activePreset === preset.label && !isTailing
              ? "bg-blue-600 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {preset.label}
        </button>
      ))}

      {/* Custom button */}
      <div ref={customRef} className="relative">
        <button
          onClick={() => setShowCustom(!showCustom)}
          disabled={isDisabled}
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            activePreset === "custom" && !isTailing
              ? "bg-blue-600 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Custom
          <svg
            className="w-3 h-3"
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

        {/* Custom picker dropdown */}
        {showCustom && (
          <div className="absolute top-full right-0 mt-1 p-3 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 w-72">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">End</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="w-full px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
