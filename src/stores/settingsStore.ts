import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

export interface LogLevelStyle {
  baseColor: string; // Single user-configured color; text/bg derived via color-mix()
}

export interface LogLevelConfig {
  id: string;
  name: string;
  style: LogLevelStyle;
  keywords: string[];
  priority: number; // Lower = higher priority (checked first)
  defaultEnabled: boolean; // Whether this level is enabled by default in the filter
}

// Standard JSON field names to check for log level
export const LOG_LEVEL_JSON_FIELDS = [
  "level",
  "log_level",
  "Level",
  "LOG_LEVEL",
  "severity",
  "Severity",
  "SEVERITY",
  "loglevel",
  "logLevel",
];

export interface CacheLimits {
  maxLogCount: number; // Maximum number of logs to cache
  maxSizeMb: number; // Maximum size in megabytes
}

export const DEFAULT_CACHE_LIMITS: CacheLimits = {
  maxLogCount: 50_000,
  maxSizeMb: 100,
};

export interface TimePreset {
  id: string;
  label: string;
  ms: number;
}

export const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: "preset-15m", label: "15m", ms: 15 * 60 * 1000 },
  { id: "preset-1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "preset-6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "preset-24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "preset-7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

export const MAX_TIME_PRESETS = 5;

interface SettingsStore {
  // Theme
  theme: Theme;

  // Log level settings - array ordered by priority
  logLevels: LogLevelConfig[];

  // Last selected log group (persisted)
  lastSelectedLogGroup: string | null;

  // Cache limits
  cacheLimits: CacheLimits;

  // AWS profile (persisted)
  awsProfile: string | null;

  // Persisted filter state (stored as array for JSON serialization)
  persistedDisabledLevels: string[];
  persistedTimeRange: { start: number; end: number | null } | null;
  persistedTimePreset: string | null; // "15m", "1h", "6h", "24h", "7d", "custom", or null
  persistedGroupByMode: string; // "none" | "stream" | "invocation"
  persistedGroupFilter: boolean;

  // Settings dialog visibility
  isSettingsOpen: boolean;

  // Auto-update setting
  autoUpdateEnabled: boolean;

  // Time presets (null = use defaults)
  timePresets: TimePreset[] | null;

  // Actions
  setTheme: (theme: Theme) => void;
  setLastSelectedLogGroup: (logGroup: string | null) => void;
  setCacheLimits: (limits: Partial<CacheLimits>) => void;
  setAwsProfile: (profile: string | null) => void;
  setLogLevelStyle: (id: string, style: Partial<LogLevelStyle>) => void;
  setLogLevelKeywords: (id: string, keywords: string[]) => void;
  setLogLevelName: (id: string, name: string) => void;
  setLogLevelDefaultEnabled: (id: string, enabled: boolean) => void;
  addLogLevel: () => void;
  removeLogLevel: (id: string) => void;
  moveLogLevel: (id: string, direction: "up" | "down") => void;
  resetLogLevelDefaults: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  getDefaultDisabledLevels: () => Set<string>;
  setPersistedDisabledLevels: (levels: Set<string>) => void;
  setPersistedTimeRange: (
    range: { start: number; end: number | null } | null,
    preset?: string | null,
  ) => void;
  getPersistedDisabledLevelsAsSet: () => Set<string>;
  setPersistedGroupByMode: (mode: string) => void;
  setPersistedGroupFilter: (enabled: boolean) => void;
  setTimePresets: (presets: TimePreset[]) => void;
  addTimePreset: () => void;
  removeTimePreset: (index: number) => void;
  updateTimePreset: (index: number, preset: TimePreset) => void;
  moveTimePreset: (index: number, direction: "up" | "down") => void;
  resetTimePresets: () => void;
}

const DEFAULT_LOG_LEVELS: LogLevelConfig[] = [
  {
    id: "error",
    name: "Error",
    style: { baseColor: "#ef4444" }, // red-500
    keywords: ["error", "fatal", "err", "critical", "crit"],
    priority: 0,
    defaultEnabled: true,
  },
  {
    id: "warn",
    name: "Warning",
    style: { baseColor: "#eab308" }, // yellow-500
    keywords: ["warn", "warning"],
    priority: 1,
    defaultEnabled: true,
  },
  {
    id: "info",
    name: "Info",
    style: { baseColor: "#3b82f6" }, // blue-500
    keywords: ["info"],
    priority: 2,
    defaultEnabled: true,
  },
  {
    id: "debug",
    name: "Debug",
    style: { baseColor: "#22c55e" }, // green-500
    keywords: ["debug"],
    priority: 3,
    defaultEnabled: true,
  },
  {
    id: "trace",
    name: "Trace",
    style: { baseColor: "#a855f7" }, // purple-500
    keywords: ["trace"],
    priority: 4,
    defaultEnabled: true,
  },
  {
    id: "system",
    name: "System",
    style: { baseColor: "#6b7280" }, // gray-500
    keywords: [
      "INIT_REPORT",
      "REPORT",
      "START",
      "END",
      "RequestId",
      "EXTENSION",
    ],
    priority: 5,
    defaultEnabled: false,
  },
];

function generateId(): string {
  return `level-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generatePresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Migration from old format
interface OldLogLevelConfig {
  style: LogLevelStyle;
  pattern?: {
    jsonFields?: string[];
    jsonValues?: string[];
    prefixPatterns?: string[];
  };
  keywords?: string[];
}

type OldLogLevel = "error" | "warn" | "info" | "debug" | "unknown";

function migrateFromOldFormat(
  stored: Record<OldLogLevel, OldLogLevelConfig>,
): LogLevelConfig[] {
  const nameMap: Record<OldLogLevel, string> = {
    error: "Error",
    warn: "Warning",
    info: "Info",
    debug: "Debug",
    unknown: "Unknown",
  };

  const result: LogLevelConfig[] = [];
  const levels: OldLogLevel[] = ["error", "warn", "info", "debug"];
  let priority = 0;

  for (const level of levels) {
    const old = stored[level];
    if (!old) continue;

    let keywords: string[];
    if (old.keywords && Array.isArray(old.keywords)) {
      keywords = old.keywords;
    } else if (old.pattern) {
      const combined = [
        ...(old.pattern.jsonValues || []),
        ...(old.pattern.prefixPatterns || []),
      ];
      keywords = [...new Set(combined.map((k) => k.toLowerCase()))];
    } else {
      keywords = DEFAULT_LOG_LEVELS.find((d) => d.id === level)?.keywords || [];
    }

    result.push({
      id: level,
      name: nameMap[level],
      style: old.style || DEFAULT_LOG_LEVELS.find((d) => d.id === level)!.style,
      keywords,
      priority: priority++,
      defaultEnabled: true,
    });
  }

  return result.length > 0 ? result : DEFAULT_LOG_LEVELS;
}

function migrateFromArrayFormat(stored: LogLevelConfig[]): LogLevelConfig[] {
  // Filter out "unknown" level if present (we no longer use it)
  return stored
    .filter((level) => level.id !== "unknown")
    .map((level, index) => ({
      ...level,
      priority: level.priority ?? index,
    }));
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: "system" as Theme,
      logLevels: DEFAULT_LOG_LEVELS,
      lastSelectedLogGroup: null,
      cacheLimits: DEFAULT_CACHE_LIMITS,
      awsProfile: null,
      persistedDisabledLevels: [],
      persistedTimeRange: null,
      persistedTimePreset: null,
      persistedGroupByMode: "none",
      persistedGroupFilter: true,
      isSettingsOpen: false,
      autoUpdateEnabled: true,
      timePresets: null,

      setTheme: (theme) => set({ theme }),
      setLastSelectedLogGroup: (logGroup) =>
        set({ lastSelectedLogGroup: logGroup }),
      setCacheLimits: (limits) =>
        set((state) => ({
          cacheLimits: { ...state.cacheLimits, ...limits },
        })),
      setAwsProfile: (profile) => set({ awsProfile: profile }),

      setLogLevelStyle: (id, style) =>
        set((state) => ({
          logLevels: state.logLevels.map((level) =>
            level.id === id
              ? { ...level, style: { ...level.style, ...style } }
              : level,
          ),
        })),

      setLogLevelKeywords: (id, keywords) =>
        set((state) => ({
          logLevels: state.logLevels.map((level) =>
            level.id === id ? { ...level, keywords } : level,
          ),
        })),

      setLogLevelName: (id, name) =>
        set((state) => ({
          logLevels: state.logLevels.map((level) =>
            level.id === id ? { ...level, name } : level,
          ),
        })),

      setLogLevelDefaultEnabled: (id, enabled) =>
        set((state) => ({
          logLevels: state.logLevels.map((level) =>
            level.id === id ? { ...level, defaultEnabled: enabled } : level,
          ),
        })),

      addLogLevel: () => {
        const { logLevels } = get();
        const maxPriority = Math.max(...logLevels.map((l) => l.priority), -1);
        const newLevel: LogLevelConfig = {
          id: generateId(),
          name: "New Level",
          style: { baseColor: "#a78bfa" }, // purple-400
          keywords: [],
          priority: maxPriority + 1,
          defaultEnabled: true,
        };
        set({ logLevels: [...logLevels, newLevel] });
      },

      removeLogLevel: (id) =>
        set((state) => ({
          logLevels: state.logLevels.filter((level) => level.id !== id),
        })),

      moveLogLevel: (id, direction) =>
        set((state) => {
          const levels = [...state.logLevels].sort(
            (a, b) => a.priority - b.priority,
          );
          const index = levels.findIndex((l) => l.id === id);
          if (index === -1) return state;

          const newIndex = direction === "up" ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= levels.length) return state;

          // Swap priorities
          const temp = levels[index].priority;
          levels[index] = {
            ...levels[index],
            priority: levels[newIndex].priority,
          };
          levels[newIndex] = { ...levels[newIndex], priority: temp };

          return { logLevels: levels };
        }),

      resetLogLevelDefaults: () => set({ logLevels: DEFAULT_LOG_LEVELS }),

      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
      setAutoUpdateEnabled: (enabled) => set({ autoUpdateEnabled: enabled }),

      getDefaultDisabledLevels: () => {
        const { logLevels } = get();
        return new Set(
          logLevels
            .filter((level) => !level.defaultEnabled)
            .map((level) => level.id),
        );
      },

      setPersistedDisabledLevels: (levels) =>
        set({ persistedDisabledLevels: Array.from(levels) }),

      setPersistedTimeRange: (range, preset) =>
        set({ persistedTimeRange: range, persistedTimePreset: preset ?? null }),

      getPersistedDisabledLevelsAsSet: () =>
        new Set(get().persistedDisabledLevels),
      setPersistedGroupByMode: (mode) => set({ persistedGroupByMode: mode }),
      setPersistedGroupFilter: (enabled) =>
        set({ persistedGroupFilter: enabled }),

      setTimePresets: (presets) => set({ timePresets: presets }),

      addTimePreset: () => {
        const { timePresets } = get();
        const current = timePresets ?? [...DEFAULT_TIME_PRESETS];
        if (current.length >= MAX_TIME_PRESETS) {
          // Do nothing — already at max
        } else {
          set({
            timePresets: [
              ...current,
              { id: generatePresetId(), label: "5m", ms: 5 * 60 * 1000 },
            ],
          });
        }
      },

      removeTimePreset: (index) => {
        const { timePresets } = get();
        const current = timePresets ?? [...DEFAULT_TIME_PRESETS];
        if (current.length <= 1) {
          // Do nothing — must keep at least 1
        } else {
          set({ timePresets: current.filter((_, i) => i !== index) });
        }
      },

      updateTimePreset: (index, preset) => {
        const { timePresets } = get();
        const current = timePresets ?? [...DEFAULT_TIME_PRESETS];
        set({
          timePresets: current.map((p, i) =>
            i === index ? { ...preset, id: p.id } : p,
          ),
        });
      },

      moveTimePreset: (index, direction) => {
        const { timePresets } = get();
        const current = timePresets ?? [...DEFAULT_TIME_PRESETS];
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= current.length) {
          // Do nothing — can't move beyond bounds
        } else {
          const updated = [...current];
          [updated[index], updated[newIndex]] = [
            updated[newIndex],
            updated[index],
          ];
          set({ timePresets: updated });
        }
      },

      resetTimePresets: () => set({ timePresets: null }),
    }),
    {
      name: "loggy-settings",
      version: 14,
      partialize: (state) => ({
        theme: state.theme,
        logLevels: state.logLevels,
        lastSelectedLogGroup: state.lastSelectedLogGroup,
        cacheLimits: state.cacheLimits,
        awsProfile: state.awsProfile,
        persistedDisabledLevels: state.persistedDisabledLevels,
        persistedTimeRange: state.persistedTimeRange,
        persistedTimePreset: state.persistedTimePreset,
        autoUpdateEnabled: state.autoUpdateEnabled,
        persistedGroupByMode: state.persistedGroupByMode,
        persistedGroupFilter: state.persistedGroupFilter,
        timePresets: state.timePresets,
      }),
      migrate: (persisted, version) => {
        // Use chaining pattern: each migration runs if version <= N, then chains to next
        // This ensures users on v7 or v8 also run v9->v10 migration
        let data = persisted as Record<string, unknown>;
        let currentVersion = version ?? 0;

        // v0 -> v1: Migrate from old Record<LogLevel, Config> format
        if (currentVersion <= 0) {
          if (data.logLevels && !Array.isArray(data.logLevels)) {
            data = {
              theme: "system" as Theme,
              logLevels: migrateFromOldFormat(
                data.logLevels as Record<OldLogLevel, OldLogLevelConfig>,
              ),
            };
          }
          currentVersion = 1;
        }

        // v1 -> v2: Migrate from v1 array format (may have "unknown" level)
        if (currentVersion <= 1) {
          if (data.logLevels && Array.isArray(data.logLevels)) {
            data = {
              theme: "system" as Theme,
              logLevels: migrateFromArrayFormat(
                data.logLevels as LogLevelConfig[],
              ),
            };
          }
          currentVersion = 2;
        }

        // v2 -> v3: Add theme to existing v2 data
        if (currentVersion <= 2) {
          data = {
            theme: "system" as Theme,
            logLevels: data.logLevels as LogLevelConfig[],
          };
          currentVersion = 3;
        }

        // v3 -> v4: Add defaultEnabled to existing v3 data
        if (currentVersion <= 3) {
          const levels = data.logLevels as LogLevelConfig[];
          data = {
            theme: (data.theme as Theme) ?? ("system" as Theme),
            logLevels: levels.map((level) => ({
              ...level,
              defaultEnabled: level.defaultEnabled ?? true,
            })),
            lastSelectedLogGroup: null,
          };
          currentVersion = 4;
        }

        // v4 -> v5: Add lastSelectedLogGroup and cacheLimits
        if (currentVersion <= 4) {
          data = {
            ...data,
            lastSelectedLogGroup: data.lastSelectedLogGroup ?? null,
            cacheLimits: DEFAULT_CACHE_LIMITS,
          };
          currentVersion = 5;
        }

        // v5 -> v6: Add cacheLimits (if missing) and awsProfile
        if (currentVersion <= 5) {
          data = {
            ...data,
            cacheLimits:
              (data.cacheLimits as CacheLimits) ?? DEFAULT_CACHE_LIMITS,
            awsProfile: null,
          };
          currentVersion = 6;
        }

        // v6 -> v7: Add awsProfile (if missing)
        if (currentVersion <= 6) {
          data = {
            ...data,
            awsProfile: data.awsProfile ?? null,
          };
          currentVersion = 7;
        }

        // v7 -> v8: Add TRACE level between DEBUG and SYSTEM
        if (currentVersion <= 7) {
          const logLevels = data.logLevels as LogLevelConfig[];
          const hasTrace = logLevels.some((l) => l.id === "trace");

          if (!hasTrace) {
            // Remove "trace" from debug keywords and add new TRACE level
            const updatedLevels = logLevels.map((level) => {
              if (level.id === "debug") {
                return {
                  ...level,
                  keywords: level.keywords.filter((k) => k !== "trace"),
                };
              }
              if (level.id === "system") {
                return { ...level, priority: level.priority + 1 };
              }
              return level;
            });

            // Find debug level to determine trace priority
            const debugLevel = updatedLevels.find((l) => l.id === "debug");
            const tracePriority = (debugLevel?.priority ?? 3) + 1;

            // Insert TRACE level (using old textColor/backgroundColor format)
            updatedLevels.push({
              id: "trace",
              name: "Trace",
              style: {
                textColor: "#a78bfa",
                backgroundColor: "transparent",
              },
              keywords: ["trace"],
              priority: tracePriority,
              defaultEnabled: true,
            } as unknown as LogLevelConfig);

            data = { ...data, logLevels: updatedLevels };
          }
          currentVersion = 8;
        }

        // v8 -> v9: Add persisted filter state
        if (currentVersion <= 8) {
          data = {
            ...data,
            persistedDisabledLevels:
              (data.persistedDisabledLevels as string[]) ?? [],
            persistedTimeRange: data.persistedTimeRange ?? null,
            persistedTimePreset: data.persistedTimePreset ?? null,
          };
          currentVersion = 9;
        }

        // v9 -> v10: Migrate from textColor/backgroundColor to baseColor
        if (currentVersion <= 9) {
          const logLevels = data.logLevels as Array<{
            id: string;
            name: string;
            style: {
              textColor?: string;
              backgroundColor?: string;
              baseColor?: string;
            };
            keywords: string[];
            priority: number;
            defaultEnabled: boolean;
          }>;

          data = {
            ...data,
            logLevels: logLevels.map((level) => ({
              ...level,
              style: {
                // Use baseColor if already present, otherwise use textColor
                baseColor:
                  level.style.baseColor ?? level.style.textColor ?? "#6b7280",
              },
            })),
          };
          currentVersion = 10;
        }

        // v10 -> v11: Add autoUpdateEnabled
        if (currentVersion <= 10) {
          data = {
            ...data,
            autoUpdateEnabled: data.autoUpdateEnabled ?? true,
          };
          currentVersion = 11;
        }

        // v11 -> v12: Add persistedGroupByMode
        if (currentVersion <= 11) {
          data = {
            ...data,
            persistedGroupByMode:
              (data.persistedGroupByMode as string) ?? "none",
          };
          currentVersion = 12;
        }

        // v12 -> v13: Add persistedGroupFilter
        if (currentVersion <= 12) {
          data = {
            ...data,
            persistedGroupFilter: data.persistedGroupFilter ?? true,
          };
          currentVersion = 13;
        }

        // v13 -> v14: Add timePresets
        if (currentVersion <= 13) {
          data = {
            ...data,
            timePresets: data.timePresets ?? null,
          };
          currentVersion = 14;
        }

        // v13 -> v14: Add id field to timePresets
        if (currentVersion <= 13) {
          const existing = data.timePresets as Array<{
            id?: string;
            label: string;
            ms: number;
          }> | null;
          if (existing) {
            data = {
              ...data,
              timePresets: existing.map((p, i) => ({
                ...p,
                id: p.id ?? `preset-migrated-${i}`,
              })),
            };
          }
          currentVersion = 14;
        }

        return data as {
          theme: Theme;
          logLevels: LogLevelConfig[];
          lastSelectedLogGroup: string | null;
          cacheLimits: CacheLimits;
          awsProfile: string | null;
          persistedDisabledLevels: string[];
          persistedTimeRange: { start: number; end: number | null } | null;
          persistedTimePreset: string | null;
          autoUpdateEnabled: boolean;
          persistedGroupByMode: string;
          persistedGroupFilter: boolean;
          timePresets: TimePreset[] | null;
        };
      },
    },
  ),
);

// Helper to get CSS variables for log level styles with theme-adaptive colors
export function getLogLevelCssVars(
  logLevels: LogLevelConfig[],
  isDark: boolean,
): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const level of logLevels) {
    const base = level.style.baseColor;

    if (isDark) {
      // Dark mode: lighter text for readability, subtle tinted background
      vars[`--log-${level.id}-text`] = `color-mix(in srgb, ${base} 90%, white)`;
      vars[`--log-${level.id}-bg`] = `color-mix(in srgb, ${base} 20%, black)`;
      vars[`--log-${level.id}-border`] =
        `color-mix(in srgb, ${base} 40%, transparent)`;
    } else {
      // Light mode: darker text for contrast, very subtle tinted background
      vars[`--log-${level.id}-text`] = `color-mix(in srgb, ${base} 70%, black)`;
      vars[`--log-${level.id}-bg`] = `color-mix(in srgb, ${base} 15%, white)`;
      vars[`--log-${level.id}-border`] =
        `color-mix(in srgb, ${base} 35%, transparent)`;
    }
  }

  // Unknown/default level styling
  vars["--log-unknown-text"] = isDark ? "#d1d5db" : "#6b7280";
  vars["--log-unknown-bg"] = "transparent";
  vars["--log-unknown-border"] = isDark ? "#374151" : "#d1d5db";

  return vars;
}

// Helper to get sorted levels by priority
export function getSortedLogLevels(
  logLevels: LogLevelConfig[],
): LogLevelConfig[] {
  return [...logLevels].sort((a, b) => a.priority - b.priority);
}
