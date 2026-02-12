import { useMemo } from "react";
import { useLogStore, filterLogs } from "../stores/logStore";
import {
  groupLogsByStream,
  groupLogsByInvocation,
  type LogGroupSection,
} from "../utils/groupLogs";
import type { ParsedLogEvent, GroupByMode, LogLevel } from "../types";

export interface DisplayItemLog {
  type: "log";
  log: ParsedLogEvent;
  logIndex: number; // Index into filteredLogs array (for selection/expand compatibility)
}

export interface DisplayItemHeader {
  type: "header";
  group: LogGroupSection;
}

export type DisplayItem = DisplayItemLog | DisplayItemHeader;

export function computeDisplayItems(
  filteredLogs: ParsedLogEvent[],
  effectiveMode: GroupByMode,
  collapsedGroups: Set<string>,
  groups: LogGroupSection[],
  disabledLevels?: Set<LogLevel>,
): DisplayItem[] {
  if (effectiveMode === "none") {
    return filteredLogs.map((log, index) => ({
      type: "log" as const,
      log,
      logIndex: index,
    }));
  } else {
    const items: DisplayItem[] = [];

    // Build a lookup from log to its filteredLogs index
    // filteredLogs has both text and level filtering applied, so only
    // logs that pass both filters get an index (and thus become visible rows)
    const logToIndex = new Map<ParsedLogEvent, number>();
    for (let i = 0; i < filteredLogs.length; i++) {
      logToIndex.set(filteredLogs[i], i);
    }

    for (const group of groups) {
      // Check if this group has any visible logs (passing both text + level filters)
      const hasVisibleLogs = group.logs.some((log) => {
        if (
          disabledLevels &&
          disabledLevels.size > 0 &&
          disabledLevels.has(log.level)
        ) {
          return false;
        }
        return logToIndex.has(log);
      });

      // Skip groups with no visible log entries
      if (!hasVisibleLogs) {
        continue;
      }

      items.push({ type: "header", group });
      if (!collapsedGroups.has(group.id)) {
        for (const log of group.logs) {
          // Check if log passes level filter
          if (
            disabledLevels &&
            disabledLevels.size > 0 &&
            disabledLevels.has(log.level)
          ) {
            continue;
          }
          const logIndex = logToIndex.get(log);
          if (logIndex !== undefined) {
            items.push({ type: "log", log, logIndex });
          }
        }
      }
    }

    return items;
  }
}

export function useLogGroups() {
  const logs = useLogStore((s) => s.logs);
  const filteredLogs = useLogStore((s) => s.filteredLogs);
  const filterText = useLogStore((s) => s.filterText);
  const disabledLevels = useLogStore((s) => s.disabledLevels);
  const effectiveMode = useLogStore((s) => s.effectiveGroupByMode);
  const collapsedGroups = useLogStore((s) => s.collapsedGroups);

  // Text-only filtered logs (no level filtering) — used for group detection
  // so that disabling a level (e.g., SYSTEM) doesn't break invocation boundaries
  const textFilteredLogs = useMemo(
    () => filterLogs(logs, filterText, new Set()),
    [logs, filterText],
  );

  const groups = useMemo(() => {
    if (effectiveMode === "none") {
      return [];
    } else if (effectiveMode === "invocation") {
      return groupLogsByInvocation(textFilteredLogs);
    } else {
      return groupLogsByStream(textFilteredLogs);
    }
  }, [textFilteredLogs, effectiveMode]);

  const displayItems = useMemo(
    () =>
      computeDisplayItems(
        filteredLogs,
        effectiveMode,
        collapsedGroups,
        groups,
        disabledLevels,
      ),
    [filteredLogs, effectiveMode, collapsedGroups, groups, disabledLevels],
  );

  return { groups, displayItems, effectiveMode };
}
