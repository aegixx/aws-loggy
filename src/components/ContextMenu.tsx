import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  isDark: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onFindBy: () => void;
  onFilterBy: () => void;
  hasTextSelection: boolean;
  selectedText: string;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 180;

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
  onRefresh,
  onClear,
  onFindBy,
  onFilterBy,
  hasTextSelection,
  selectedText,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position to keep menu within viewport
  const adjustedX = x + MENU_WIDTH > window.innerWidth ? x - MENU_WIDTH : x;
  const adjustedY = y + MENU_HEIGHT > window.innerHeight ? y - MENU_HEIGHT : y;

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
        className={`${menuItemBase} ${menuItemEnabled}`}
        onClick={() => handleItemClick(onCopy)}
      >
        <span>Copy</span>
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

      {/* Filter by... */}
      <div
        className={`${menuItemBase} ${hasTextSelection ? menuItemEnabled : menuItemDisabled}`}
        onClick={() => handleItemClick(onFilterBy, !hasTextSelection)}
      >
        <span>
          {hasTextSelection ? `Filter "${truncatedText}"` : "Filter by..."}
        </span>
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
        className={`${menuItemBase} ${menuItemEnabled}`}
        onClick={() => handleItemClick(onClear)}
      >
        <span>Clear</span>
        <span className={shortcutClass}>Cmd+K</span>
      </div>
    </div>
  );
}
