import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

export interface LogLevelStyle {
  textColor: string;
  backgroundColor: string;
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

  // Settings dialog visibility
  isSettingsOpen: boolean;

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
  getDefaultDisabledLevels: () => Set<string>;
}

const DEFAULT_LOG_LEVELS: LogLevelConfig[] = [
  {
    id: "error",
    name: "Error",
    style: {
      textColor: "#f87171",
      backgroundColor: "rgba(127, 29, 29, 0.3)",
    },
    keywords: ["error", "fatal", "err", "critical", "crit"],
    priority: 0,
    defaultEnabled: true,
  },
  {
    id: "warn",
    name: "Warning",
    style: {
      textColor: "#facc15",
      backgroundColor: "rgba(113, 63, 18, 0.2)",
    },
    keywords: ["warn", "warning"],
    priority: 1,
    defaultEnabled: true,
  },
  {
    id: "info",
    name: "Info",
    style: {
      textColor: "#93c5fd",
      backgroundColor: "transparent",
    },
    keywords: ["info"],
    priority: 2,
    defaultEnabled: true,
  },
  {
    id: "debug",
    name: "Debug",
    style: {
      textColor: "#6b7280",
      backgroundColor: "transparent",
    },
    keywords: ["debug"],
    priority: 3,
    defaultEnabled: true,
  },
  {
    id: "trace",
    name: "Trace",
    style: {
      textColor: "#a78bfa",
      backgroundColor: "transparent",
    },
    keywords: ["trace"],
    priority: 4,
    defaultEnabled: true,
  },
  {
    id: "system",
    name: "System",
    style: {
      textColor: "#9ca3af",
      backgroundColor: "rgba(75, 85, 99, 0.2)",
    },
    keywords: [
      "INIT_REPORT",
      "REPORT",
      "START",
      "END",
      "RequestId",
      "EXTENSION",
    ],
    priority: 5,
    defaultEnabled: true,
  },
];

function generateId(): string {
  return `level-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
      isSettingsOpen: false,

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
          style: {
            textColor: "#a78bfa", // purple-400
            backgroundColor: "transparent",
          },
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

      getDefaultDisabledLevels: () => {
        const { logLevels } = get();
        return new Set(
          logLevels
            .filter((level) => !level.defaultEnabled)
            .map((level) => level.id),
        );
      },
    }),
    {
      name: "loggy-settings",
      version: 8,
      partialize: (state) => ({
        theme: state.theme,
        logLevels: state.logLevels,
        lastSelectedLogGroup: state.lastSelectedLogGroup,
        cacheLimits: state.cacheLimits,
        awsProfile: state.awsProfile,
      }),
      migrate: (persisted, version) => {
        const data = persisted as { logLevels?: unknown; theme?: Theme };

        if (version === 0 || version === undefined) {
          // Migrate from old Record<LogLevel, Config> format
          if (data.logLevels && !Array.isArray(data.logLevels)) {
            return {
              theme: "system" as Theme,
              logLevels: migrateFromOldFormat(
                data.logLevels as Record<OldLogLevel, OldLogLevelConfig>,
              ),
            };
          }
        }

        if (version === 1) {
          // Migrate from v1 array format (may have "unknown" level)
          if (data.logLevels && Array.isArray(data.logLevels)) {
            return {
              theme: "system" as Theme,
              logLevels: migrateFromArrayFormat(
                data.logLevels as LogLevelConfig[],
              ),
            };
          }
        }

        if (version === 2) {
          // Add theme to existing v2 data
          return {
            theme: "system" as Theme,
            logLevels: data.logLevels as LogLevelConfig[],
          };
        }

        if (version === 3) {
          // Add defaultEnabled to existing v3 data (default to true for existing levels)
          const levels = data.logLevels as LogLevelConfig[];
          return {
            theme: data.theme ?? ("system" as Theme),
            logLevels: levels.map((level) => ({
              ...level,
              defaultEnabled: level.defaultEnabled ?? true,
            })),
            lastSelectedLogGroup: null,
          };
        }

        if (version === 4) {
          // Add lastSelectedLogGroup to existing v4 data
          return {
            theme: data.theme ?? ("system" as Theme),
            logLevels: data.logLevels as LogLevelConfig[],
            lastSelectedLogGroup: null,
            cacheLimits: DEFAULT_CACHE_LIMITS,
          };
        }

        if (version === 5) {
          // Add cacheLimits to existing v5 data
          const v5Data = persisted as {
            theme: Theme;
            logLevels: LogLevelConfig[];
            lastSelectedLogGroup: string | null;
          };
          return {
            ...v5Data,
            cacheLimits: DEFAULT_CACHE_LIMITS,
            awsProfile: null,
          };
        }

        if (version === 6) {
          // Add awsProfile to existing v6 data
          const v6Data = persisted as {
            theme: Theme;
            logLevels: LogLevelConfig[];
            lastSelectedLogGroup: string | null;
            cacheLimits: CacheLimits;
          };
          return {
            ...v6Data,
            awsProfile: null,
          };
        }

        if (version === 7) {
          // Add TRACE level between DEBUG and SYSTEM
          const v7Data = persisted as {
            theme: Theme;
            logLevels: LogLevelConfig[];
            lastSelectedLogGroup: string | null;
            cacheLimits: CacheLimits;
            awsProfile: string | null;
          };

          // Check if trace level already exists
          const hasTrace = v7Data.logLevels.some((l) => l.id === "trace");
          if (hasTrace) {
            return v7Data;
          }

          // Remove "trace" from debug keywords and add new TRACE level
          const updatedLevels = v7Data.logLevels.map((level) => {
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

          // Insert TRACE level
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
          });

          return {
            ...v7Data,
            logLevels: updatedLevels,
          };
        }

        return persisted as {
          theme: Theme;
          logLevels: LogLevelConfig[];
          lastSelectedLogGroup: string | null;
          cacheLimits: CacheLimits;
          awsProfile: string | null;
        };
      },
    },
  ),
);

// Helper to get CSS variables for log level styles
export function getLogLevelCssVars(
  logLevels: LogLevelConfig[],
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const level of logLevels) {
    vars[`--log-${level.id}-text`] = level.style.textColor;
    vars[`--log-${level.id}-bg`] = level.style.backgroundColor;
  }
  // Add unknown/default level styling
  vars["--log-unknown-text"] = "#d1d5db";
  vars["--log-unknown-bg"] = "transparent";
  return vars;
}

// Helper to get sorted levels by priority
export function getSortedLogLevels(
  logLevels: LogLevelConfig[],
): LogLevelConfig[] {
  return [...logLevels].sort((a, b) => a.priority - b.priority);
}
