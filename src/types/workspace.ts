import type { GroupByMode } from "./index";

/** Split direction for layout nodes */
export type SplitDirection = "horizontal" | "vertical";

/** A leaf node: a tab group containing one or more panels */
export interface LeafNode {
  type: "leaf";
  id: string;
  panelIds: string[];
  activePanelId: string;
  merged: boolean;
}

/** A split node: divides space between children */
export interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  children: LayoutNode[];
  sizes: number[]; // proportional sizes, e.g. [0.5, 0.5] — must sum to 1
}

/** A node in the layout tree */
export type LayoutNode = LeafNode | SplitNode;

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

/** The full layout configuration (serializable) */
export interface GroupLayoutConfig {
  root: LayoutNode;
  activeGroupId: string;
}

/** A saved workspace configuration */
export interface WorkspaceConfig {
  id: string;
  name: string;
  awsProfile: string | null;
  layout: GroupLayoutConfig;
  panels: PanelConfig[];
  timeSyncEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Active correlation highlight across panels */
export interface CorrelationHighlight {
  field: string;
  value: string;
  sourcePanelId: string;
}

/** Reference into a panel's logs for the merged view (uses stable keys, not indices) */
export interface MergedLogRef {
  panelId: string;
  eventKey: string;
  timestamp: number;
}

/** AWS connection info returned from the backend */
export interface AwsConnectionInfo {
  profile: string | null;
  region: string | null;
}
