import { useState, useRef, useEffect } from "react";
import DatePicker from "react-datepicker";
import { MdDateRange, MdArrowDropDown } from "react-icons/md";
import { useLogStore } from "../stores/logStore";
import {
  useSettingsStore,
  DEFAULT_TIME_PRESETS,
  type TimePreset,
} from "../stores/settingsStore";
import { useSystemTheme } from "../hooks/useSystemTheme";
import "react-datepicker/dist/react-datepicker.css";

export function TimeRangePicker() {
  const {
    isTailing,
    startTail,
    stopTail,
    clearLogs,
    setTimeRange,
    selectedLogGroup,
    timeRange,
  } = useLogStore();
  const { persistedTimePreset, persistedTimeRange, timePresets } =
    useSettingsStore();
  const presets: TimePreset[] = timePresets ?? DEFAULT_TIME_PRESETS;
  const [showCustom, setShowCustom] = useState(false);
  // Initialize activePreset from persisted value, falling back to first preset
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    if (persistedTimePreset === "custom") {
      return "custom";
    }
    if (persistedTimePreset) {
      const match = presets.find((p) => p.label === persistedTimePreset);
      if (match) {
        return match.id;
      }
    }
    return presets[0]?.id ?? "preset-15m";
  });
  const [customStart, setCustomStart] = useState<Date>(() => {
    // If we have a persisted custom range, use it
    if (persistedTimePreset === "custom" && persistedTimeRange) {
      return new Date(persistedTimeRange.start);
    }
    return new Date(Date.now() - 60 * 60 * 1000);
  });
  const [customEnd, setCustomEnd] = useState<Date>(() => {
    // If we have a persisted custom range with an end time, use it
    if (
      persistedTimePreset === "custom" &&
      persistedTimeRange &&
      persistedTimeRange.end
    ) {
      return new Date(persistedTimeRange.end);
    }
    return new Date();
  });
  const customRef = useRef<HTMLDivElement>(null);
  const isDark = useSystemTheme();

  // Sync activePreset with store's timeRange (e.g., when Clear resets timeRange to null)
  useEffect(() => {
    if (timeRange === null && !isTailing) {
      const { timePresets: currentPresets } = useSettingsStore.getState();
      const active = currentPresets ?? DEFAULT_TIME_PRESETS;
      setActivePreset(active[0]?.id ?? "preset-15m");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, isTailing]);

  // Close custom picker when clicking outside (but not when clicking in datepicker portal)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const portalEl = document.getElementById("datepicker-portal");

      // Don't close if clicking inside the dropdown or inside the datepicker portal
      if (customRef.current?.contains(target)) return;
      if (portalEl?.contains(target)) return;

      setShowCustom(false);
    }
    if (showCustom) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCustom]);

  const handleLiveClick = () => {
    if (isTailing) {
      // Already tailing - clear logs and reset timestamp (like clicking clear)
      clearLogs();
    } else {
      setActivePreset(null);
      startTail();
    }
  };

  const handlePresetClick = (preset: TimePreset) => {
    if (isTailing) stopTail();
    setActivePreset(preset.id);
    setShowCustom(false);
    const now = Date.now();
    setTimeRange({ start: now - preset.ms, end: null }, preset.label);
  };

  const handleCustomApply = () => {
    if (isTailing) stopTail();
    setActivePreset("custom");
    setTimeRange(
      { start: customStart.getTime(), end: customEnd.getTime() },
      "custom",
    );
    setShowCustom(false);
  };

  const isDisabled = !selectedLogGroup;

  // Custom input component for consistent styling
  const CustomInput = ({
    value,
    onClick,
    label,
  }: {
    value?: string;
    onClick?: () => void;
    label: string;
  }) => (
    <div className="w-full">
      <label
        className={`block text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
      >
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded px-2 py-1.5 text-sm text-left focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDark ? "bg-gray-900 border border-gray-700 text-gray-300 hover:bg-gray-800" : "bg-gray-50 border border-gray-300 text-gray-700 hover:bg-gray-100"}`}
      >
        {value}
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-1 relative">
      {/* Live button */}
      <button
        onClick={handleLiveClick}
        disabled={isDisabled}
        className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
          isTailing
            ? "bg-green-600 text-white"
            : isDark
              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
              : "bg-gray-200 hover:bg-gray-300 text-gray-700"
        } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
      >
        {isTailing && (
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        )}
        Live
      </button>

      {/* Preset buttons */}
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => handlePresetClick(preset)}
          disabled={isDisabled}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activePreset === preset.id && !isTailing
              ? "bg-blue-600 text-white"
              : isDark
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
          } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
        >
          {preset.label}
        </button>
      ))}

      {/* Custom date range button */}
      <div ref={customRef} className="relative">
        <button
          onClick={() => setShowCustom(!showCustom)}
          disabled={isDisabled}
          className={`px-1.5 py-1 rounded transition-colors flex items-center ${
            activePreset === "custom" && !isTailing
              ? "bg-blue-600 text-white"
              : isDark
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
          } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
          title="Custom date range"
        >
          <MdDateRange className="w-4 h-4" />
          <MdArrowDropDown className="w-4 h-4 -ml-0.5" />
        </button>

        {/* Custom picker dropdown */}
        {showCustom && (
          <div
            className={`absolute top-full right-0 mt-1 p-3 rounded-lg shadow-xl border z-50 ${isDark ? "bg-gray-800 border-gray-700 datepicker-dark" : "bg-white border-gray-300"}`}
            style={{ minWidth: "200px" }}
          >
            <div className="flex flex-col gap-3">
              <div className="w-full">
                <DatePicker
                  selected={customStart}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setCustomStart(date);
                      if (date > customEnd) {
                        setCustomEnd(date);
                      }
                    }
                  }}
                  showTimeSelect
                  timeIntervals={30}
                  timeFormat="HH:mm"
                  dateFormat="MMM d, yyyy HH:mm"
                  maxDate={new Date()}
                  customInput={<CustomInput label="Start (UTC)" />}
                  calendarClassName={isDark ? "datepicker-dark" : ""}
                  wrapperClassName="w-full"
                  portalId="datepicker-portal"
                />
              </div>
              <div className="w-full">
                <DatePicker
                  selected={customEnd}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setCustomEnd(date);
                      if (date < customStart) {
                        setCustomStart(date);
                      }
                    }
                  }}
                  showTimeSelect
                  timeIntervals={30}
                  timeFormat="HH:mm"
                  dateFormat="MMM d, yyyy HH:mm"
                  maxDate={new Date()}
                  customInput={<CustomInput label="End (UTC)" />}
                  calendarClassName={isDark ? "datepicker-dark" : ""}
                  wrapperClassName="w-full"
                  portalId="datepicker-portal"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="w-full px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors cursor-pointer"
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
