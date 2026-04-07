import Fuse from "fuse.js";
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MdArrowDropDown } from "react-icons/md";
import { List, type ListImperativeAPI } from "react-window";
import { useSystemTheme } from "../hooks/useSystemTheme";
import { useConnectionStore } from "../stores/connectionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { getSourceColor } from "./MergedFilterBar";
import type { LogGroup } from "../types";

const ITEM_HEIGHT = 32;
const MAX_VISIBLE_ITEMS = 10;

interface MultiSelectRowProps {
  index: number;
  style: CSSProperties;
  groups: LogGroup[];
  highlightedIndex: number;
  selectedNames: Set<string>;
  sourceColorMap: Map<string, number>;
  onToggle: (name: string) => void;
  onHighlight: (index: number) => void;
  isDark: boolean;
}

const MultiSelectRow = memo(function MultiSelectRow({
  index,
  style,
  groups,
  highlightedIndex,
  selectedNames,
  sourceColorMap,
  onToggle,
  onHighlight,
  isDark,
}: MultiSelectRowProps) {
  const group = groups[index];
  const isHighlighted = index === highlightedIndex;
  const isSelected = selectedNames.has(group.name);
  const colorIdx = sourceColorMap.get(group.name);

  return (
    <div
      id={`merged-log-group-option-${index}`}
      role="option"
      aria-selected={isHighlighted}
      style={style}
      onClick={() => onToggle(group.name)}
      onMouseEnter={() => onHighlight(index)}
      className={`flex items-center gap-2 px-3 cursor-pointer text-sm ${
        isHighlighted
          ? isDark
            ? "bg-blue-600/30 text-gray-100"
            : "bg-blue-100 text-gray-900"
          : isDark
            ? "text-gray-300 hover:bg-gray-700"
            : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {/* Checkbox */}
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          isSelected
            ? "bg-blue-600 border-blue-600 text-white"
            : isDark
              ? "border-gray-600"
              : "border-gray-400"
        }`}
      >
        {isSelected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {/* Color dot for selected sources */}
      {isSelected && colorIdx !== undefined && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${getSourceColor(colorIdx).dot}`}
        />
      )}
      <span className="truncate">{group.name}</span>
    </div>
  );
});

interface MergedLogGroupSelectorProps {
  /** Panel IDs in this merged group */
  panelIds: string[];
}

export function MergedLogGroupSelector({
  panelIds,
}: MergedLogGroupSelectorProps) {
  const { logGroups, isConnected, connectionError } = useConnectionStore();
  const panels = useWorkspaceStore((s) => s.panels);
  const mergedSourceToggles = useWorkspaceStore((s) => s.mergedSourceToggles);
  const setMergedSourceToggle = useWorkspaceStore(
    (s) => s.setMergedSourceToggle,
  );
  const isDark = useSystemTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<ListImperativeAPI>(null);

  // Build set of selected log group names and their source color indices
  const { selectedNames, sourceColorMap, tags } = useMemo(() => {
    const names = new Set<string>();
    const colorMap = new Map<string, number>();
    const tags: { label: string; colorIdx: number }[] = [];
    let idx = 0;
    for (const panelId of panelIds) {
      const panel = panels.get(panelId);
      if (panel?.logGroupName) {
        const isVisible = mergedSourceToggles.get(panelId) !== false;
        if (isVisible) {
          names.add(panel.logGroupName);
          colorMap.set(panel.logGroupName, idx);
          const parts = panel.logGroupName.split("/");
          tags.push({
            label: parts[parts.length - 1] || panel.logGroupName,
            colorIdx: idx,
          });
        }
        idx++;
      }
    }
    return {
      selectedNames: names,
      sourceColorMap: colorMap,
      tags,
    };
  }, [panelIds, panels, mergedSourceToggles]);

  // Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(logGroups, {
      keys: ["name"],
      threshold: 0.4,
      ignoreLocation: true,
      useExtendedSearch: true,
    });
  }, [logGroups]);

  // Filter log groups based on search
  const filteredGroups = useMemo(() => {
    if (!isOpen || !searchValue) return logGroups;
    const terms = searchValue.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return logGroups;
    const query = terms.map((t) => `'${t}`).join(" ");
    const results = fuse.search(query);
    return results.map((r) => r.item);
  }, [logGroups, searchValue, isOpen, fuse]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredGroups]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchValue("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Toggle a log group: find the panel with this name and toggle its source visibility
  const handleToggle = useCallback(
    (logGroupName: string) => {
      for (const panelId of panelIds) {
        const panel = panels.get(panelId);
        if (panel?.logGroupName === logGroupName) {
          const isVisible = mergedSourceToggles.get(panelId) !== false;
          setMergedSourceToggle(panelId, !isVisible);
          break;
        }
      }
    },
    [panelIds, panels, mergedSourceToggles, setMergedSourceToggle],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          Math.min(prev + 1, filteredGroups.length - 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (filteredGroups[highlightedIndex]) {
          handleToggle(filteredGroups[highlightedIndex].name);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setSearchValue("");
      }
    },
    [isOpen, filteredGroups, highlightedIndex, handleToggle],
  );

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollToRow({
        index: highlightedIndex,
        align: "smart",
      });
    }
  }, [highlightedIndex, isOpen]);

  const placeholderText = !isConnected
    ? connectionError
      ? "Not connected"
      : "Connecting..."
    : "Search log groups...";

  const dropdownHeight =
    Math.min(filteredGroups.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

  return (
    <div ref={containerRef} className="flex items-center gap-2 relative">
      <label
        className={`text-sm whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}
      >
        Log Groups:
      </label>
      <div className="relative flex-1">
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={!isConnected}
            className={`w-full rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${
              isDark
                ? "bg-gray-800 border border-gray-700 text-gray-100"
                : "bg-white border border-gray-300 text-gray-900"
            }`}
          />
        ) : (
          <div
            onClick={() => {
              setIsOpen(true);
              setSearchValue("");
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className={`w-full rounded px-2 py-1 pr-8 text-sm flex items-center gap-1 flex-wrap min-h-[34px] cursor-pointer ${
              isDark
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-300"
            }`}
          >
            {tags.length === 0 && (
              <span className={isDark ? "text-gray-500" : "text-gray-400"}>
                {placeholderText}
              </span>
            )}
            {tags.map((tag, i) => {
              const color = getSourceColor(tag.colorIdx);
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${color.bg} ${color.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  <span className="truncate max-w-28">{tag.label}</span>
                </span>
              );
            })}
            {/* Hidden input for focus management */}
            <input ref={inputRef} className="sr-only" tabIndex={-1} />
          </div>
        )}
        <MdArrowDropDown
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-lg pointer-events-none ${
            isDark ? "text-gray-500" : "text-gray-400"
          } ${isOpen ? "rotate-180" : ""} transition-transform`}
        />

        {isOpen && filteredGroups.length > 0 && (
          <div
            role="listbox"
            aria-multiselectable="true"
            className={`absolute top-full left-0 right-0 mt-1 z-50 rounded border shadow-lg overflow-hidden ${
              isDark
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-300"
            }`}
          >
            <List
              listRef={listRef}
              rowCount={filteredGroups.length}
              rowHeight={ITEM_HEIGHT}
              style={{ height: dropdownHeight }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rowComponent={MultiSelectRow as any}
              rowProps={{
                groups: filteredGroups,
                highlightedIndex,
                selectedNames,
                sourceColorMap,
                onToggle: handleToggle,
                onHighlight: setHighlightedIndex,
                isDark,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
