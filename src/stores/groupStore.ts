import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LayoutNode,
  LeafNode,
  SplitNode,
  SplitDirection,
  GroupLayoutConfig,
} from "../types/workspace";

// Circular import: groupStore <-> workspaceStore
// Safe because cross-store calls only happen inside actions (after both modules load).
import { useWorkspaceStore } from "./workspaceStore";

const MAX_LEAVES = 10;

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

// ─── Tree Utilities ─────────────────────────────────────────────────────────

/** Find a leaf node by ID */
export function findLeaf(node: LayoutNode, leafId: string): LeafNode | null {
  if (node.type === "leaf") {
    return node.id === leafId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) return found;
  }
  return null;
}

/** Find the leaf containing a specific panel */
function findLeafByPanel(node: LayoutNode, panelId: string): LeafNode | null {
  if (node.type === "leaf") {
    return node.panelIds.includes(panelId) ? node : null;
  }
  for (const child of node.children) {
    const found = findLeafByPanel(child, panelId);
    if (found) return found;
  }
  return null;
}

/** Collect all leaf nodes */
function collectLeaves(node: LayoutNode): LeafNode[] {
  if (node.type === "leaf") return [node];
  return node.children.flatMap(collectLeaves);
}

/** Collect all panel IDs across all leaves */
function collectAllPanelIds(node: LayoutNode): string[] {
  return collectLeaves(node).flatMap((leaf) => leaf.panelIds);
}

/** Replace a node in the tree by ID, returning a new tree */
function replaceNode(
  tree: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (tree.id === targetId) return replacement;
  if (tree.type === "leaf") return tree;
  return {
    ...tree,
    children: tree.children.map((child) =>
      replaceNode(child, targetId, replacement),
    ),
  };
}

/** Remove a node from the tree by ID, collapsing single-child splits */
function removeNode(tree: LayoutNode, targetId: string): LayoutNode | null {
  if (tree.id === targetId) return null;
  if (tree.type === "leaf") return tree;

  const newChildren = tree.children
    .map((child) => removeNode(child, targetId))
    .filter((c): c is LayoutNode => c !== null);

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // collapse single-child split
  return {
    ...tree,
    children: newChildren,
    sizes: evenSizes(newChildren.length),
  };
}

/** Update a leaf in the tree by ID */
function updateLeaf(
  tree: LayoutNode,
  leafId: string,
  updater: (leaf: LeafNode) => LeafNode,
): LayoutNode {
  if (tree.type === "leaf") {
    return tree.id === leafId ? updater(tree) : tree;
  }
  return {
    ...tree,
    children: tree.children.map((child) => updateLeaf(child, leafId, updater)),
  };
}

/** Generate even sizes array */
function evenSizes(count: number): number[] {
  return Array(count).fill(1 / count);
}

/** Create a default leaf */
function createDefaultLeaf(): LeafNode {
  const panelId = generateId("panel");
  return {
    type: "leaf",
    id: generateId("leaf"),
    panelIds: [panelId],
    activePanelId: panelId,
    merged: false,
  };
}

// ─── Store ──────────────────────────────────────────────────────────────────

export interface GroupStore {
  // Layout tree
  root: LayoutNode;
  activeGroupId: string;

  // Modes
  timeSyncEnabled: boolean;

  // Group operations
  setActiveGroup: (groupId: string) => void;
  toggleGroupMerged: (groupId: string) => void;
  setTimeSyncEnabled: (enabled: boolean) => void;

  // Split operations
  splitGroup: (groupId: string, direction: SplitDirection) => void;
  addGroup: () => void;

  // Tab operations within a leaf
  addPanelToGroup: (groupId: string, panelId?: string) => string;
  removePanelFromGroup: (groupId: string, panelId: string) => void;
  setActiveGroupPanel: (groupId: string, panelId: string) => void;
  reorderPanelsInGroup: (groupId: string, panelIds: string[]) => void;

  // Cross-group operations
  movePanel: (
    panelId: string,
    fromGroupId: string,
    toGroupId: string,
    position?: number,
  ) => void;
  splitPanelToNewGroup: (
    panelId: string,
    fromGroupId: string,
    direction: SplitDirection,
  ) => void;
  movePanelToSplitAtTarget: (
    panelId: string,
    fromGroupId: string,
    targetGroupId: string,
    direction: SplitDirection,
    position: "before" | "after",
  ) => void;

  // Resize
  resizeSplit: (splitId: string, sizes: number[]) => void;

  // Workspace persistence
  saveGroupLayout: () => GroupLayoutConfig;
  loadGroupLayout: (config: GroupLayoutConfig) => void;

  // Helpers
  getAllPanelIds: () => string[];
  getGroupForPanel: (panelId: string) => string | null;
  getActivePanelId: () => string;
  getLeaf: (groupId: string) => LeafNode | null;
}

export const useGroupStore = create<GroupStore>()(
  persist(
    (set, get) => {
      const defaultLeaf = createDefaultLeaf();

      return {
        root: defaultLeaf,
        activeGroupId: defaultLeaf.id,
        timeSyncEnabled: false,

        setActiveGroup: (groupId: string) => {
          if (findLeaf(get().root, groupId)) {
            set({ activeGroupId: groupId });
          }
        },

        toggleGroupMerged: (groupId: string) => {
          const newRoot = updateLeaf(get().root, groupId, (l) => ({
            ...l,
            merged: !l.merged,
          }));
          set({ root: newRoot });
        },

        setTimeSyncEnabled: (enabled: boolean) => {
          set({ timeSyncEnabled: enabled });
        },

        // Split an existing group in place, subdividing it
        splitGroup: (groupId: string, direction: SplitDirection) => {
          const state = get();
          const totalLeaves = collectLeaves(state.root).length;
          if (totalLeaves >= MAX_LEAVES) {
            console.warn(`[GroupStore] Maximum ${MAX_LEAVES} panes reached`);
            return;
          }

          const leaf = findLeaf(state.root, groupId);
          if (!leaf) return;

          // Create new leaf with a new panel
          const newPanelId = generateId("panel");
          useWorkspaceStore.getState().createPanel(newPanelId);

          const newLeaf: LeafNode = {
            type: "leaf",
            id: generateId("leaf"),
            panelIds: [newPanelId],
            activePanelId: newPanelId,
            merged: false,
          };

          // Replace the leaf with a split containing original + new
          const splitNode: SplitNode = {
            type: "split",
            id: generateId("split"),
            direction,
            children: [leaf, newLeaf],
            sizes: [0.5, 0.5],
          };

          const newRoot = replaceNode(state.root, groupId, splitNode);
          set({ root: newRoot, activeGroupId: newLeaf.id });
        },

        // Add a new group at the root level (fallback, e.g. Cmd+D with single leaf)
        addGroup: () => {
          const state = get();
          const totalLeaves = collectLeaves(state.root).length;
          if (totalLeaves >= MAX_LEAVES) {
            console.warn(`[GroupStore] Maximum ${MAX_LEAVES} panes reached`);
            return;
          }

          const newPanelId = generateId("panel");
          useWorkspaceStore.getState().createPanel(newPanelId);

          const newLeaf: LeafNode = {
            type: "leaf",
            id: generateId("leaf"),
            panelIds: [newPanelId],
            activePanelId: newPanelId,
            merged: false,
          };

          // If root is a leaf, wrap in a split
          if (state.root.type === "leaf") {
            const splitNode: SplitNode = {
              type: "split",
              id: generateId("split"),
              direction: "horizontal",
              children: [state.root, newLeaf],
              sizes: [0.5, 0.5],
            };
            set({ root: splitNode, activeGroupId: newLeaf.id });
          } else {
            // Add to root split's children
            const newRoot: SplitNode = {
              ...state.root,
              children: [...state.root.children, newLeaf],
              sizes: evenSizes(state.root.children.length + 1),
            };
            set({ root: newRoot, activeGroupId: newLeaf.id });
          }
        },

        // Tab operations
        addPanelToGroup: (groupId: string, panelId?: string) => {
          const state = get();
          const totalPanels = collectAllPanelIds(state.root).length;
          if (totalPanels >= MAX_LEAVES * 5) {
            console.warn("[GroupStore] Too many panels");
            return "";
          }

          const leaf = findLeaf(state.root, groupId);
          if (!leaf) return "";

          const newPanelId = panelId || generateId("panel");
          if (!panelId) {
            useWorkspaceStore.getState().createPanel(newPanelId);
          }

          const newRoot = updateLeaf(state.root, groupId, (l) => ({
            ...l,
            panelIds: [...l.panelIds, newPanelId],
            activePanelId: newPanelId,
          }));

          set({ root: newRoot, activeGroupId: groupId });
          return newPanelId;
        },

        removePanelFromGroup: (groupId: string, panelId: string) => {
          const state = get();
          const leaf = findLeaf(state.root, groupId);
          if (!leaf) return;

          useWorkspaceStore.getState().removePanel(panelId);

          const newPanelIds = leaf.panelIds.filter((id) => id !== panelId);

          // Auto-collapse: if leaf is now empty, remove it from tree
          if (newPanelIds.length === 0) {
            const newRoot = removeNode(state.root, groupId);
            if (!newRoot) {
              // Tree is empty, create a fresh default
              const fresh = createDefaultLeaf();
              useWorkspaceStore.getState().createPanel(fresh.panelIds[0]);
              set({ root: fresh, activeGroupId: fresh.id });
            } else {
              // Pick a new active group if the removed one was active
              const leaves = collectLeaves(newRoot);
              const newActive =
                groupId === state.activeGroupId
                  ? leaves[0].id
                  : state.activeGroupId;
              set({ root: newRoot, activeGroupId: newActive });
            }
            return;
          }

          const newActivePanelId =
            panelId === leaf.activePanelId
              ? newPanelIds[
                  Math.min(
                    leaf.panelIds.indexOf(panelId),
                    newPanelIds.length - 1,
                  )
                ]
              : leaf.activePanelId;

          const newRoot = updateLeaf(state.root, groupId, (l) => ({
            type: "leaf" as const,
            id: groupId,
            panelIds: newPanelIds,
            activePanelId: newActivePanelId,
            merged: l.merged,
          }));

          set({ root: newRoot });
        },

        setActiveGroupPanel: (groupId: string, panelId: string) => {
          const state = get();
          const leaf = findLeaf(state.root, groupId);
          if (!leaf || !leaf.panelIds.includes(panelId)) return;

          const newRoot = updateLeaf(state.root, groupId, (l) => ({
            ...l,
            activePanelId: panelId,
          }));
          set({ root: newRoot, activeGroupId: groupId });
        },

        reorderPanelsInGroup: (groupId: string, panelIds: string[]) => {
          const newRoot = updateLeaf(get().root, groupId, (l) => ({
            ...l,
            panelIds,
          }));
          set({ root: newRoot });
        },

        // Cross-group operations
        movePanel: (
          panelId: string,
          fromGroupId: string,
          toGroupId: string,
          position?: number,
        ) => {
          const state = get();
          if (fromGroupId === toGroupId) return;

          const fromLeaf = findLeaf(state.root, fromGroupId);
          const toLeaf = findLeaf(state.root, toGroupId);
          if (!fromLeaf || !toLeaf) return;

          // Remove from source
          const newFromPanelIds = fromLeaf.panelIds.filter(
            (id) => id !== panelId,
          );

          // Add to target
          const newToPanelIds = [...toLeaf.panelIds];
          const insertAt =
            position !== undefined
              ? Math.min(position, newToPanelIds.length)
              : newToPanelIds.length;
          newToPanelIds.splice(insertAt, 0, panelId);

          let newRoot = state.root;

          // Update target
          newRoot = updateLeaf(newRoot, toGroupId, (l) => ({
            ...l,
            panelIds: newToPanelIds,
            activePanelId: panelId,
          }));

          // Update or remove source
          if (newFromPanelIds.length === 0) {
            newRoot = removeNode(newRoot, fromGroupId) ?? newRoot;
          } else {
            const newFromActive =
              panelId === fromLeaf.activePanelId
                ? newFromPanelIds[0]
                : fromLeaf.activePanelId;
            newRoot = updateLeaf(newRoot, fromGroupId, (l) => ({
              ...l,
              panelIds: newFromPanelIds,
              activePanelId: newFromActive,
            }));
          }

          set({ root: newRoot, activeGroupId: toGroupId });
        },

        splitPanelToNewGroup: (
          panelId: string,
          fromGroupId: string,
          direction: SplitDirection,
        ) => {
          const state = get();
          const totalLeaves = collectLeaves(state.root).length;
          if (totalLeaves >= MAX_LEAVES) return;

          const fromLeaf = findLeaf(state.root, fromGroupId);
          if (!fromLeaf) return;

          // Remove panel from source
          const newFromPanelIds = fromLeaf.panelIds.filter(
            (id) => id !== panelId,
          );

          // Create new leaf with the panel
          const newLeaf: LeafNode = {
            type: "leaf",
            id: generateId("leaf"),
            panelIds: [panelId],
            activePanelId: panelId,
            merged: false,
          };

          let newRoot = state.root;

          if (newFromPanelIds.length === 0) {
            // Source leaf becomes empty, replace it with just the new leaf
            // (effectively a no-op move, but direction may differ)
            newRoot = replaceNode(newRoot, fromGroupId, newLeaf);
          } else {
            // Update source leaf
            const updatedFrom: LeafNode = {
              ...fromLeaf,
              panelIds: newFromPanelIds,
              activePanelId:
                panelId === fromLeaf.activePanelId
                  ? newFromPanelIds[0]
                  : fromLeaf.activePanelId,
            };

            // Replace the source leaf with a split containing updated + new
            const splitNode: SplitNode = {
              type: "split",
              id: generateId("split"),
              direction,
              children: [updatedFrom, newLeaf],
              sizes: [0.5, 0.5],
            };

            newRoot = replaceNode(newRoot, fromGroupId, splitNode);
          }

          set({ root: newRoot, activeGroupId: newLeaf.id });
        },

        movePanelToSplitAtTarget: (
          panelId: string,
          fromGroupId: string,
          targetGroupId: string,
          direction: SplitDirection,
          position: "before" | "after",
        ) => {
          const state = get();
          const totalLeaves = collectLeaves(state.root).length;
          if (totalLeaves >= MAX_LEAVES) return;

          const fromLeaf = findLeaf(state.root, fromGroupId);
          const targetLeaf = findLeaf(state.root, targetGroupId);
          if (!fromLeaf || !targetLeaf) return;

          // Remove panel from source group
          const newFromPanelIds = fromLeaf.panelIds.filter(
            (id) => id !== panelId,
          );

          // Create new leaf at target position with the dragged panel
          const newLeaf: LeafNode = {
            type: "leaf",
            id: generateId("leaf"),
            panelIds: [panelId],
            activePanelId: panelId,
            merged: false,
          };

          // Split the target leaf: dragged panel goes before or after target
          const splitChildren: [LeafNode, LeafNode] =
            position === "after"
              ? [targetLeaf, newLeaf]
              : [newLeaf, targetLeaf];

          const splitNode: SplitNode = {
            type: "split",
            id: generateId("split"),
            direction,
            children: splitChildren,
            sizes: [0.5, 0.5],
          };

          let newRoot = state.root;

          // Replace target leaf with the new split node
          newRoot = replaceNode(newRoot, targetGroupId, splitNode);

          // Update or remove source leaf
          if (newFromPanelIds.length === 0) {
            newRoot = removeNode(newRoot, fromGroupId) ?? newRoot;
          } else {
            const newFromActive =
              panelId === fromLeaf.activePanelId
                ? newFromPanelIds[0]
                : fromLeaf.activePanelId;
            newRoot = updateLeaf(newRoot, fromGroupId, (l) => ({
              ...l,
              panelIds: newFromPanelIds,
              activePanelId: newFromActive,
            }));
          }

          set({ root: newRoot, activeGroupId: newLeaf.id });
        },

        // Resize
        resizeSplit: (splitId: string, sizes: number[]) => {
          const state = get();

          function updateSplit(node: LayoutNode): LayoutNode {
            if (node.type === "leaf") return node;
            if (node.id === splitId) {
              return { ...node, sizes };
            }
            return {
              ...node,
              children: node.children.map(updateSplit),
            };
          }

          set({ root: updateSplit(state.root) });
        },

        // Workspace persistence
        saveGroupLayout: (): GroupLayoutConfig => {
          const state = get();
          return {
            root: state.root,
            activeGroupId: state.activeGroupId,
          };
        },

        loadGroupLayout: (config: GroupLayoutConfig) => {
          set({
            root: config.root,
            activeGroupId: config.activeGroupId,
          });
        },

        // Helpers
        getAllPanelIds: () => collectAllPanelIds(get().root),

        getGroupForPanel: (panelId: string) => {
          const leaf = findLeafByPanel(get().root, panelId);
          return leaf?.id ?? null;
        },

        getActivePanelId: () => {
          const state = get();
          const leaf = findLeaf(state.root, state.activeGroupId);
          return leaf?.activePanelId ?? "";
        },

        getLeaf: (groupId: string) => findLeaf(get().root, groupId),
      };
    },
    {
      name: "loggy-groups",
      version: 2,
      partialize: (state) => ({
        timeSyncEnabled: state.timeSyncEnabled,
        root: state.root,
        activeGroupId: state.activeGroupId,
      }),
      migrate: (persisted: unknown, version: number) => {
        if (version === 1) {
          // v1 had no root/activeGroupId — just return what we have, defaults kick in
          return persisted;
        }
        return persisted;
      },
    },
  ),
);

// ─── Convenience Hooks ──────────────────────────────────────────────────────

/** Hook to get a specific leaf */
export function useLeaf(groupId: string): LeafNode | undefined {
  return useGroupStore((s) => {
    const leaf = findLeaf(s.root, groupId);
    return leaf ?? undefined;
  });
}

/** Initialize group panels in workspaceStore. Call once at app startup. */
export function initializeGroups(): void {
  const panelIds = collectAllPanelIds(useGroupStore.getState().root);
  for (const panelId of panelIds) {
    useWorkspaceStore.getState().createPanel(panelId);
  }
}
