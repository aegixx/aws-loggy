import {
  useSettingsStore,
  DEFAULT_TIME_PRESETS,
  MAX_TIME_PRESETS,
  type TimePreset,
} from "../stores/settingsStore";

type TimeUnit = "m" | "h" | "d";

function msToValueAndUnit(ms: number): { value: number; unit: TimeUnit } {
  if (ms >= 24 * 60 * 60 * 1000 && ms % (24 * 60 * 60 * 1000) === 0) {
    return { value: ms / (24 * 60 * 60 * 1000), unit: "d" };
  }
  if (ms >= 60 * 60 * 1000 && ms % (60 * 60 * 1000) === 0) {
    return { value: ms / (60 * 60 * 1000), unit: "h" };
  }
  return { value: Math.round(ms / (60 * 1000)), unit: "m" };
}

function valueAndUnitToMs(value: number, unit: TimeUnit): number {
  if (unit === "d") {
    return value * 24 * 60 * 60 * 1000;
  } else if (unit === "h") {
    return value * 60 * 60 * 1000;
  } else {
    return value * 60 * 1000;
  }
}

function valueAndUnitToLabel(value: number, unit: TimeUnit): string {
  return `${value}${unit}`;
}

export function TimePresetEditor() {
  const {
    timePresets,
    addTimePreset,
    removeTimePreset,
    updateTimePreset,
    moveTimePreset,
    resetTimePresets,
  } = useSettingsStore();

  const presets: TimePreset[] = timePresets ?? DEFAULT_TIME_PRESETS;
  const canAdd = presets.length < MAX_TIME_PRESETS;
  const canDelete = presets.length > 1;

  const handleValueChange = (index: number, newValue: number) => {
    const preset = presets[index];
    const { unit } = msToValueAndUnit(preset.ms);
    const clampedValue = Math.max(1, newValue);
    const ms = valueAndUnitToMs(clampedValue, unit);
    const label = valueAndUnitToLabel(clampedValue, unit);
    updateTimePreset(index, { id: preset.id, label, ms });
  };

  const handleUnitChange = (index: number, newUnit: TimeUnit) => {
    const preset = presets[index];
    const { value } = msToValueAndUnit(preset.ms);
    const ms = valueAndUnitToMs(value, newUnit);
    const label = valueAndUnitToLabel(value, newUnit);
    updateTimePreset(index, { id: preset.id, label, ms });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
          Time Presets
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={addTimePreset}
            disabled={!canAdd}
            className={`flex items-center gap-1 text-xs cursor-pointer ${
              canAdd
                ? "text-green-400 hover:text-green-300"
                : "text-gray-600 cursor-not-allowed"
            }`}
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
            Add Preset
          </button>
          <span className="text-gray-600">|</span>
          <button
            onClick={resetTimePresets}
            className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Up to 5 presets shown in the filter bar. The calendar picker is always
        available.
      </p>
      <div className="space-y-2">
        {presets.map((preset, index) => {
          const { value, unit } = msToValueAndUnit(preset.ms);
          const isFirst = index === 0;
          const isLast = index === presets.length - 1;

          return (
            <div
              key={preset.id}
              className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2"
            >
              {/* Move buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveTimePreset(index, "up")}
                  disabled={isFirst}
                  className={`p-0.5 rounded text-gray-400 cursor-pointer ${
                    isFirst
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-gray-700 hover:text-gray-200"
                  }`}
                  title="Move up"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  onClick={() => moveTimePreset(index, "down")}
                  disabled={isLast}
                  className={`p-0.5 rounded text-gray-400 cursor-pointer ${
                    isLast
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-gray-700 hover:text-gray-200"
                  }`}
                  title="Move down"
                >
                  <svg
                    className="w-3.5 h-3.5"
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

              {/* Duration value */}
              <input
                type="number"
                value={value}
                onChange={(e) =>
                  handleValueChange(index, parseInt(e.target.value) || 1)
                }
                min={1}
                className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 text-center"
              />

              {/* Unit selector */}
              <select
                value={unit}
                onChange={(e) =>
                  handleUnitChange(index, e.target.value as TimeUnit)
                }
                className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 cursor-pointer"
              >
                <option value="m">minutes</option>
                <option value="h">hours</option>
                <option value="d">days</option>
              </select>

              {/* Preview label */}
              <span className="text-xs text-gray-500 ml-auto">
                {preset.label}
              </span>

              {/* Delete button */}
              <button
                onClick={() => removeTimePreset(index)}
                disabled={!canDelete}
                className={`p-1 rounded cursor-pointer ${
                  canDelete
                    ? "text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    : "text-gray-600 cursor-not-allowed"
                }`}
                title="Remove preset"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
