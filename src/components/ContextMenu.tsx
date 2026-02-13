import { useEffect, useRef, useState } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  isDark: boolean;
  onCopy: () => void;
  copyDisabled?: boolean;
  onRefresh: () => void;
  onClear: () => void;
  clearDisabled?: boolean;
  onFindBy: () => void;
  onFilterBySelection: () => void;
  onFilterByRequestId: () => void;
  onFilterByTraceId: () => void;
  onFilterByClientIP: () => void;
  hasTextSelection: boolean;
  selectedText: string;
  requestId: string | null;
  traceId: string | null;
  clientIP: string | null;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 200;
const SUBMENU_WIDTH = 200;

function truncateText(text: string, maxLength: number = 20): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function ContextMenu({
  x,
  y,
  onClose,
  isDark,
  onCopy,
  copyDisabled,
  onRefresh,
  onClear,
  clearDisabled,
  onFindBy,
  onFilterBySelection,
  onFilterByRequestId,
  onFilterByTraceId,
  onFilterByClientIP,
  hasTextSelection,
  selectedText,
  requestId,
  traceId,
  clientIP,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showFilterSubmenu, setShowFilterSubmenu] = useState(false);
  const filterItemRef = useRef<HTMLDivElement>(null);

  // Calculate position to keep menu within viewport
  const adjustedX = x + MENU_WIDTH > window.innerWidth ? x - MENU_WIDTH : x;
  const adjustedY = y + MENU_HEIGHT > window.innerHeight ? y - MENU_HEIGHT : y;

  // Calculate submenu position
  const submenuOnLeft =
    adjustedX + MENU_WIDTH + SUBMENU_WIDTH > window.innerWidth;

  // Check if any filter option is available
  const hasAnyFilterOption =
    hasTextSelection || !!requestId || !!traceId || !!clientIP;

  // Close on click outside (use capture phase to catch events before stopPropagation)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const menuItemBase = `flex items-center justify-between px-3 py-1.5 text-sm`;
  const menuItemEnabled = isDark
    ? "text-gray-200 hover:bg-gray-700 cursor-pointer"
    : "text-gray-800 hover:bg-gray-100 cursor-pointer";
  const menuItemDisabled = isDark
    ? "text-gray-600 cursor-not-allowed"
    : "text-gray-400 cursor-not-allowed";
  const shortcutClass = isDark ? "text-gray-500" : "text-gray-400";
  const separatorClass = isDark ? "border-gray-700" : "border-gray-200";

  const handleItemClick = (action: () => void, disabled: boolean = false) => {
    if (disabled) return;
    action();
    onClose();
  };

  const truncatedText = truncateText(selectedText);

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 min-w-[180px] py-1 rounded-md shadow-lg border ${
        isDark
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-300 shadow-md"
      }`}
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {/* Copy */}
      <div
        className={`${menuItemBase} ${copyDisabled ? menuItemDisabled : menuItemEnabled}`}
        onClick={() => handleItemClick(onCopy, copyDisabled)}
      >
        <span>{hasTextSelection ? "Copy selection" : "Copy"}</span>
        <span className={shortcutClass}>Cmd+C</span>
      </div>

      {/* Separator */}
      <div className={`border-t my-1 ${separatorClass}`} />

      {/* Find by... */}
      <div
        className={`${menuItemBase} ${hasTextSelection ? menuItemEnabled : menuItemDisabled}`}
        onClick={() => handleItemClick(onFindBy, !hasTextSelection)}
      >
        <span>
          {hasTextSelection ? `Find "${truncatedText}"` : "Find by..."}
        </span>
      </div>

      {/* Filter by with submenu */}
      <div
        ref={filterItemRef}
        className={`${menuItemBase} relative ${hasAnyFilterOption ? menuItemEnabled : menuItemDisabled}`}
        onClick={() =>
          hasAnyFilterOption && setShowFilterSubmenu((prev) => !prev)
        }
        onMouseEnter={() => hasAnyFilterOption && setShowFilterSubmenu(true)}
        onMouseLeave={() => setShowFilterSubmenu(false)}
      >
        <span>Filter by</span>
        <span className={shortcutClass}>▶</span>

        {/* Filter submenu */}
        {showFilterSubmenu && hasAnyFilterOption && (
          <div
            className={`absolute z-50 min-w-[180px] py-1 rounded-md shadow-lg border ${
              isDark
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-300 shadow-md"
            }`}
            style={{
              top: -4,
              left: submenuOnLeft ? -SUBMENU_WIDTH - 4 : "100%",
              marginLeft: submenuOnLeft ? 0 : 4,
            }}
            onMouseEnter={() => setShowFilterSubmenu(true)}
            onMouseLeave={() => setShowFilterSubmenu(false)}
          >
            {/* Selection option */}
            <div
              className={`${menuItemBase} ${hasTextSelection ? menuItemEnabled : menuItemDisabled}`}
              onClick={() =>
                handleItemClick(onFilterBySelection, !hasTextSelection)
              }
            >
              <span>Selection</span>
            </div>

            {/* RequestId option */}
            <div
              className={`${menuItemBase} ${requestId ? menuItemEnabled : menuItemDisabled}`}
              onClick={() => handleItemClick(onFilterByRequestId, !requestId)}
            >
              <span>Request ID</span>
            </div>

            {/* TraceId option */}
            <div
              className={`${menuItemBase} ${traceId ? menuItemEnabled : menuItemDisabled}`}
              onClick={() => handleItemClick(onFilterByTraceId, !traceId)}
            >
              <span>Trace ID</span>
            </div>

            {/* ClientIP option */}
            <div
              className={`${menuItemBase} ${clientIP ? menuItemEnabled : menuItemDisabled}`}
              onClick={() => handleItemClick(onFilterByClientIP, !clientIP)}
            >
              <span>Client IP</span>
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className={`border-t my-1 ${separatorClass}`} />

      {/* Refresh */}
      <div
        className={`${menuItemBase} ${menuItemEnabled}`}
        onClick={() => handleItemClick(onRefresh)}
      >
        <span>Refresh</span>
        <span className={shortcutClass}>Cmd+R</span>
      </div>

      {/* Clear */}
      <div
        className={`${menuItemBase} ${clearDisabled ? menuItemDisabled : menuItemEnabled}`}
        onClick={() => handleItemClick(onClear, clearDisabled)}
      >
        <span>Clear</span>
        <span className={shortcutClass}>Cmd+K</span>
      </div>
    </div>
  );
}
