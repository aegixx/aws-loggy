import { useCallback, useRef, useState } from "react";
import { useGroupStore } from "../stores/groupStore";
import { EditorGroupView } from "./EditorGroupView";
import { useSystemTheme } from "../hooks/useSystemTheme";
import type { LayoutNode, SplitNode } from "../types/workspace";

// ─── Resize Handle ──────────────────────────────────────────────────────────

function ResizeHandle({
  direction,
  isDark,
  onResize,
}: {
  direction: "horizontal" | "vertical";
  isDark: boolean;
  onResize: (delta: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);
  // Use ref to always call the latest onResize (avoids stale closure during drag)
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        const current = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = current - startPos.current;
        if (Math.abs(delta) > 1) {
          onResizeRef.current(delta);
          startPos.current = current;
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction],
  );

  const isH = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`relative shrink-0 ${isH ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"} ${
        isDragging
          ? "bg-blue-500"
          : isDark
            ? "bg-gray-700 hover:bg-blue-500/50"
            : "bg-gray-300 hover:bg-blue-500/50"
      } transition-colors`}
    >
      {/* Invisible wider hit area for easier grabbing */}
      <div
        className={`absolute ${
          isH
            ? "-left-1 -right-1 top-0 bottom-0 cursor-col-resize"
            : "left-0 right-0 -top-1 -bottom-1 cursor-row-resize"
        }`}
      />
    </div>
  );
}

// ─── Layout Node Renderer ───────────────────────────────────────────────────

function LayoutNodeView({
  node,
  isDark,
}: {
  node: LayoutNode;
  isDark: boolean;
}) {
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const resizeSplit = useGroupStore((s) => s.resizeSplit);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(
    (splitNode: SplitNode, index: number, delta: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const totalSize =
        splitNode.direction === "horizontal" ? rect.width : rect.height;
      const deltaPct = delta / totalSize;

      const newSizes = [...splitNode.sizes];

      // Minimum 200px per pane (as a proportion of the container)
      const minPx = 200;
      const minSize = Math.max(0.1, minPx / totalSize);

      newSizes[index] += deltaPct;
      newSizes[index + 1] -= deltaPct;

      // Enforce minimums
      if (newSizes[index] < minSize || newSizes[index + 1] < minSize) return;

      resizeSplit(splitNode.id, newSizes);
    },
    [resizeSplit],
  );

  if (node.type === "leaf") {
    return (
      <EditorGroupView
        groupId={node.id}
        isActiveGroup={node.id === activeGroupId}
      />
    );
  }

  // Split node: render children with resize handles between them
  const isH = node.direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`flex ${isH ? "flex-row" : "flex-col"} flex-1 min-w-0 min-h-0`}
    >
      {node.children
        .map((child, i) => (
          <div
            key={child.id}
            className="flex"
            style={{
              flex: `${node.sizes[i]} 1 0%`,
              flexDirection: "column",
              minWidth: isH ? 200 : 0,
              minHeight: isH ? 0 : 200,
            }}
          >
            <LayoutNodeView node={child} isDark={isDark} />
            {/* No resize handle after the last child */}
          </div>
        ))
        .reduce<React.ReactNode[]>((acc, child, i) => {
          if (i > 0) {
            // Insert resize handle between children
            const splitNode = node;
            acc.push(
              <ResizeHandle
                key={`resize-${splitNode.id}-${i}`}
                direction={node.direction}
                isDark={isDark}
                onResize={(delta) => handleResize(splitNode, i - 1, delta)}
              />,
            );
          }
          acc.push(child);
          return acc;
        }, [])}
    </div>
  );
}

// ─── Panel Container ────────────────────────────────────────────────────────

export function PanelContainer() {
  const isDark = useSystemTheme();
  const root = useGroupStore((s) => s.root);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <LayoutNodeView node={root} isDark={isDark} />
    </div>
  );
}
