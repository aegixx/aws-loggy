import type { ParsedLogEvent } from "../types";
import type { MergedLogRef } from "../types/workspace";

/** Generate a stable event key that survives filter changes */
export function makeEventKey(log: ParsedLogEvent, idx: number): string {
  return `${log.timestamp}|${log.log_stream_name ?? ""}|${idx}`;
}

/**
 * Build a lookup map from eventKey → ParsedLogEvent for O(1) resolution.
 * Each panel contributes its logs with panel-scoped keys.
 */
export function buildEventKeyMap(
  panelLogs: Map<string, ParsedLogEvent[]>,
): Map<string, ParsedLogEvent> {
  const map = new Map<string, ParsedLogEvent>();
  for (const [panelId, logs] of panelLogs) {
    for (let i = 0; i < logs.length; i++) {
      const key = `${panelId}:${makeEventKey(logs[i], i)}`;
      map.set(key, logs[i]);
    }
  }
  return map;
}

/**
 * Merge logs from multiple panels into a single chronologically sorted
 * array of MergedLogRef. Uses pairwise merge of pre-sorted arrays.
 *
 * @param panelLogs - Map of panelId → sorted ParsedLogEvent[]
 * @returns MergedLogRef[] sorted by timestamp ascending
 */
export function mergePanelLogs(
  panelLogs: Map<string, ParsedLogEvent[]>,
): MergedLogRef[] {
  const allRefs: MergedLogRef[][] = [];

  for (const [panelId, logs] of panelLogs) {
    const refs: MergedLogRef[] = logs.map((log, idx) => ({
      panelId,
      eventKey: `${panelId}:${makeEventKey(log, idx)}`,
      timestamp: log.timestamp,
    }));
    allRefs.push(refs);
  }

  if (allRefs.length === 0) return [];
  if (allRefs.length === 1) return allRefs[0];

  // Pairwise merge of sorted arrays
  let result = allRefs[0];
  for (let i = 1; i < allRefs.length; i++) {
    result = mergeTwoSorted(result, allRefs[i]);
  }
  return result;
}

/** Merge two sorted MergedLogRef arrays by timestamp */
function mergeTwoSorted(a: MergedLogRef[], b: MergedLogRef[]): MergedLogRef[] {
  const merged: MergedLogRef[] = new Array(a.length + b.length);
  let ai = 0;
  let bi = 0;
  let mi = 0;

  while (ai < a.length && bi < b.length) {
    if (a[ai].timestamp <= b[bi].timestamp) {
      merged[mi++] = a[ai++];
    } else {
      merged[mi++] = b[bi++];
    }
  }

  while (ai < a.length) {
    merged[mi++] = a[ai++];
  }

  while (bi < b.length) {
    merged[mi++] = b[bi++];
  }

  return merged;
}

/**
 * Append new log refs from a single panel into an existing merged array.
 * Fast path: if all new logs are >= last timestamp, just append & merge tail.
 * Fallback: full re-merge via mergePanelLogs.
 *
 * @returns true if fast-path was used, false if full re-merge needed
 */
export function appendToMergedRefs(
  existing: MergedLogRef[],
  panelId: string,
  newLogs: ParsedLogEvent[],
  startIdx: number,
): { refs: MergedLogRef[]; fastPath: boolean } {
  if (newLogs.length === 0) {
    return { refs: existing, fastPath: true };
  }

  const lastExistingTs =
    existing.length > 0 ? existing[existing.length - 1].timestamp : 0;
  const firstNewTs = newLogs[0].timestamp;

  // Fast path: all new logs are in order
  if (firstNewTs >= lastExistingTs) {
    const newRefs: MergedLogRef[] = newLogs.map((log, i) => ({
      panelId,
      eventKey: `${panelId}:${makeEventKey(log, startIdx + i)}`,
      timestamp: log.timestamp,
    }));
    return { refs: [...existing, ...newRefs], fastPath: true };
  }

  // Out of order — caller should do full re-merge
  return { refs: existing, fastPath: false };
}
