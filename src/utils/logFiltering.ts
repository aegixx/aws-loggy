import type { ParsedLogEvent, LogLevel } from "../types";

// Cache for compiled keyword regex patterns (avoids recompiling on every log)
// Limited size to prevent unbounded memory growth
const MAX_KEYWORD_CACHE_SIZE = 100;
const keywordRegexCache = new Map<string, RegExp>();

export function getKeywordRegex(keyword: string): RegExp {
  const key = keyword.toLowerCase();
  let regex = keywordRegexCache.get(key);
  if (!regex) {
    // Evict oldest entry if cache is full (Map preserves insertion order)
    if (keywordRegexCache.size >= MAX_KEYWORD_CACHE_SIZE) {
      const oldestKey = keywordRegexCache.keys().next().value;
      if (oldestKey !== undefined) {
        keywordRegexCache.delete(oldestKey);
      }
    }
    regex = new RegExp(
      `(?:^|[\\s\\t\\[\\]():])${key}(?:[\\s\\t\\[\\]():]|$)`,
      "i",
    );
    keywordRegexCache.set(key, regex);
  }
  return regex;
}

export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (
      current &&
      typeof current === "object" &&
      key in (current as Record<string, unknown>)
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function filterLogs(
  logs: ParsedLogEvent[],
  filterText: string,
  disabledLevels: Set<LogLevel>,
): ParsedLogEvent[] {
  let filtered = logs;

  // Filter by enabled levels (exclude disabled ones)
  if (disabledLevels.size > 0) {
    filtered = filtered.filter((log) => !disabledLevels.has(log.level));
  }

  // Filter by text
  if (filterText.trim()) {
    const lowerFilter = filterText.toLowerCase();

    // Check for field:value syntax
    const fieldMatch = filterText.match(/^(\w+(?:\.\w+)*):(.+)$/);
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      const lowerValue = value.toLowerCase();

      filtered = filtered.filter((log) => {
        if (log.parsedJson) {
          const fieldValue = getNestedValue(log.parsedJson, field);
          if (fieldValue !== undefined) {
            return String(fieldValue).toLowerCase().includes(lowerValue);
          }
        }
        return false;
      });
    } else {
      // Split on whitespace for AND matching (each term must be present)
      const terms = lowerFilter.split(/\s+/).filter(Boolean);
      filtered = filtered.filter((log) => {
        const lowerMessage = log.message.toLowerCase();
        return terms.every((term) => lowerMessage.includes(term));
      });
    }
  }

  return filtered;
}

/** Per-panel filter cache to avoid redundant filtering */
export class FilterCache {
  private cache: {
    logs: ParsedLogEvent[];
    filterText: string;
    disabledLevelsKey: string;
    result: ParsedLogEvent[];
  } | null = null;

  // Serialize Set to string for stable cache comparison (Set references change on each toggle)
  private static serializeDisabledLevels(
    disabledLevels: Set<LogLevel>,
  ): string {
    return [...disabledLevels].sort().join(",");
  }

  getFilteredLogs(
    logs: ParsedLogEvent[],
    filterText: string,
    disabledLevels: Set<LogLevel>,
  ): ParsedLogEvent[] {
    const disabledLevelsKey =
      FilterCache.serializeDisabledLevels(disabledLevels);

    // Check if we can use cached result
    if (
      this.cache &&
      this.cache.logs === logs &&
      this.cache.filterText === filterText &&
      this.cache.disabledLevelsKey === disabledLevelsKey
    ) {
      return this.cache.result;
    }

    // Compute new result
    const result = filterLogs(logs, filterText, disabledLevels);

    // Update cache
    this.cache = { logs, filterText, disabledLevelsKey, result };

    return result;
  }

  invalidate(): void {
    this.cache = null;
  }
}

const defaultFilterCache = new FilterCache();

/** Backward-compatible module-level getFilteredLogs (uses default cache instance) */
export function getFilteredLogs(
  logs: ParsedLogEvent[],
  filterText: string,
  disabledLevels: Set<LogLevel>,
): ParsedLogEvent[] {
  return defaultFilterCache.getFilteredLogs(logs, filterText, disabledLevels);
}
