import type { GroupByMode } from "./index";

/** How panels are arranged visually */
export type LayoutMode =
  | "tabs"
  | "split-horizontal"
  | "split-vertical"
  | "merged";

/** A single panel's persisted configuration */
export interface PanelConfig {
  id: string;
  logGroupName: string | null;
  filterText: string;
  disabledLevels: string[];
  groupByMode: GroupByMode | "auto";
  groupFilter: boolean;
  timeRange: { start: number; end: number | null } | null;
  timePreset: string | null;
  wasTailing: boolean;
}

/** A saved workspace configuration */
export interface WorkspaceConfig {
  id: string;
  name: string;
  awsProfile: string | null;
  layoutMode: LayoutMode;
  panels: PanelConfig[];
  createdAt: number;
  updatedAt: number;
}

/** Active correlation highlight across panels */
export interface CorrelationHighlight {
  field: string; // e.g. "requestId"
  value: string; // e.g. "abc-123"
  sourcePanelId: string; // panel where user clicked
}

/** Reference into a panel's logs for the merged view (uses stable keys, not indices) */
export interface MergedLogRef {
  panelId: string;
  eventKey: string; // stable ID: `${timestamp}|${logStreamName}|${idx}` — survives filter changes
  timestamp: number; // denormalized for sort performance
}

/** AWS connection info returned from the backend */
export interface AwsConnectionInfo {
  profile: string | null;
  region: string | null;
}
