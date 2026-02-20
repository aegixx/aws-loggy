import { useMemo } from "react";
import { useLogStore } from "../stores/logStore";
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
  groupFilter?: boolean,
  filterText?: string,
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

    const isGroupFilterActive =
      groupFilter && filterText && filterText.trim() !== "";

    let nextNegativeIndex = -1;

    for (const group of groups) {
      if (isGroupFilterActive) {
        // Group filter mode: if ANY log in the group passes the text filter,
        // show ALL logs in the group (subject to level filtering).
        // Check if any log in this group is in the filteredLogs set (text match)
        const groupHasMatch = group.logs.some((log) => logToIndex.has(log));

        if (groupHasMatch) {
          // Collect all logs that pass the level filter (regardless of text match)
          const visibleLogs: { log: ParsedLogEvent; logIndex: number }[] = [];
          for (const log of group.logs) {
            if (
              disabledLevels &&
              disabledLevels.size > 0 &&
              disabledLevels.has(log.level)
            ) {
              continue;
            }
            const existingIndex = logToIndex.get(log);
            if (existingIndex !== undefined) {
              visibleLogs.push({ log, logIndex: existingIndex });
            } else {
              visibleLogs.push({ log, logIndex: nextNegativeIndex-- });
            }
          }

          if (visibleLogs.length > 0) {
            items.push({ type: "header", group });
            if (!collapsedGroups.has(group.id)) {
              for (const { log, logIndex } of visibleLogs) {
                items.push({ type: "log", log, logIndex });
              }
            }
          }
        }
      } else {
        // Default mode: only show logs that are in filteredLogs
        const visibleLogs: { log: ParsedLogEvent; logIndex: number }[] = [];
        for (const log of group.logs) {
          if (
            disabledLevels &&
            disabledLevels.size > 0 &&
            disabledLevels.has(log.level)
          ) {
            continue;
          }
          const logIndex = logToIndex.get(log);
          if (logIndex !== undefined) {
            visibleLogs.push({ log, logIndex });
          }
        }

        // Skip groups with no visible log entries
        if (visibleLogs.length === 0) {
          continue;
        }

        items.push({ type: "header", group });
        if (!collapsedGroups.has(group.id)) {
          for (const { log, logIndex } of visibleLogs) {
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
  const disabledLevels = useLogStore((s) => s.disabledLevels);
  const effectiveMode = useLogStore((s) => s.effectiveGroupByMode);
  const collapsedGroups = useLogStore((s) => s.collapsedGroups);
  const groupFilter = useLogStore((s) => s.groupFilter);
  const filterText = useLogStore((s) => s.filterText);

  // Groups are always computed from ALL logs (unfiltered) so that
  // invocation boundaries (START/END/REPORT) and stream assignments
  // are never broken by text or level filters.
  // Filtering only affects which logs are *visible* within each group
  // (handled by computeDisplayItems).
  const groups = useMemo(() => {
    if (effectiveMode === "none") {
      return [];
    } else if (effectiveMode === "invocation") {
      return groupLogsByInvocation(logs);
    } else {
      return groupLogsByStream(logs);
    }
  }, [logs, effectiveMode]);

  const displayItems = useMemo(
    () =>
      computeDisplayItems(
        filteredLogs,
        effectiveMode,
        collapsedGroups,
        groups,
        disabledLevels,
        groupFilter,
        filterText,
      ),
    [
      filteredLogs,
      effectiveMode,
      collapsedGroups,
      groups,
      disabledLevels,
      groupFilter,
      filterText,
    ],
  );

  return { groups, displayItems, effectiveMode };
}
