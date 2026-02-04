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
import { useLogStore } from "../stores/logStore";
import type { LogGroup } from "../types";

const ITEM_HEIGHT = 32;
const MAX_VISIBLE_ITEMS = 10;

interface LogGroupRowProps {
  index: number;
  style: CSSProperties;
  groups: LogGroup[];
  highlightedIndex: number;
  selectedLogGroup: string | null;
  onSelect: (name: string) => void;
  onHighlight: (index: number) => void;
  isDark: boolean;
}

const LogGroupRow = memo(function LogGroupRow({
  index,
  style,
  groups,
  highlightedIndex,
  selectedLogGroup,
  onSelect,
  onHighlight,
  isDark,
}: LogGroupRowProps) {
  const group = groups[index];
  const isHighlighted = index === highlightedIndex;
  const isSelected = group.name === selectedLogGroup;

  return (
    <div
      style={style}
      className={`px-3 py-1.5 text-sm cursor-pointer truncate flex items-center ${
        isHighlighted
          ? isDark
            ? "bg-blue-600 text-white"
            : "bg-blue-500 text-white"
          : isSelected
            ? isDark
              ? "bg-gray-700 text-gray-100"
              : "bg-gray-100 text-gray-900"
            : isDark
              ? "text-gray-100 hover:bg-gray-700"
              : "text-gray-900 hover:bg-gray-100"
      }`}
      onClick={() => onSelect(group.name)}
      onMouseEnter={() => onHighlight(index)}
    >
      {group.name}
    </div>
  );
});

export function LogGroupSelector() {
  const {
    logGroups,
    selectedLogGroup,
    selectLogGroup,
    isConnected,
    connectionError,
  } = useLogStore();
  const isDark = useSystemTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(selectedLogGroup ?? "");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<ListImperativeAPI>(null);

  // Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(logGroups, {
      keys: ["name"],
      threshold: 0.4,
      distance: 1000,
      ignoreLocation: true,
      useExtendedSearch: true,
    });
  }, [logGroups]);

  // Filter log groups based on search using fuzzy matching
  const filteredGroups = useMemo(() => {
    if (!isOpen || !searchValue || searchValue === selectedLogGroup) {
      return logGroups;
    }
    // Convert spaces to extended search AND syntax: "lam func" -> "'lam 'func"
    const terms = searchValue.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return logGroups;

    const query = terms.map((t) => `'${t}`).join(" ");
    const results = fuse.search(query);
    return results.map((r) => r.item);
  }, [logGroups, searchValue, isOpen, selectedLogGroup, fuse]);

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredGroups]);

  // Sync searchValue with selectedLogGroup when it changes externally
  useEffect(() => {
    if (!isOpen) {
      setSearchValue(selectedLogGroup ?? "");
    }
  }, [selectedLogGroup, isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchValue(selectedLogGroup ?? "");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, selectedLogGroup]);

  const handleSelect = useCallback(
    (name: string) => {
      selectLogGroup(name);
      setIsOpen(false);
      setSearchValue(name);
      inputRef.current?.blur();
    },
    [selectLogGroup],
  );

  const handleHighlight = useCallback((index: number) => {
    setHighlightedIndex(index);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
          setIsOpen(true);
          setSearchValue("");
          e.preventDefault();
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
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredGroups[highlightedIndex]) {
          handleSelect(filteredGroups[highlightedIndex].name);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setSearchValue(selectedLogGroup ?? "");
        inputRef.current?.blur();
      } else if (e.key === "Tab") {
        setIsOpen(false);
        setSearchValue(selectedLogGroup ?? "");
      }
    },
    [isOpen, filteredGroups, highlightedIndex, handleSelect, selectedLogGroup],
  );

  // Scroll highlighted item into view
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
        htmlFor="log-group-search"
        className={`text-sm whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}
      >
        Log Group:
      </label>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          id="log-group-search"
          type="text"
          value={isOpen ? searchValue : selectedLogGroup || ""}
          onChange={(e) => {
            if (!isOpen) setIsOpen(true);
            setSearchValue(e.target.value);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchValue("");
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={!isConnected}
          className={`w-full rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${
            isDark
              ? "bg-gray-800 border border-gray-700 text-gray-100"
              : "bg-white border border-gray-300 text-gray-900"
          }`}
        />
        <MdArrowDropDown
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-lg pointer-events-none ${
            isDark ? "text-gray-500" : "text-gray-400"
          } ${isOpen ? "rotate-180" : ""} transition-transform`}
        />
      </div>

      {isOpen && filteredGroups.length > 0 && (
        <div
          className={`absolute top-full left-0 right-0 mt-1 z-50 rounded border shadow-lg overflow-hidden ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
          }`}
          style={{ marginLeft: "76px" }}
        >
          <List
            listRef={listRef}
            rowCount={filteredGroups.length}
            rowHeight={ITEM_HEIGHT}
            style={{ height: dropdownHeight }}
            rowComponent={
              LogGroupRow as React.ComponentType<{
                index: number;
                style: CSSProperties;
              }>
            }
            rowProps={{
              groups: filteredGroups,
              highlightedIndex,
              selectedLogGroup,
              onSelect: handleSelect,
              onHighlight: handleHighlight,
              isDark,
            }}
          />
        </div>
      )}

      {isOpen && filteredGroups.length === 0 && searchValue && (
        <div
          className={`absolute top-full left-0 right-0 mt-1 z-50 rounded border shadow-lg px-3 py-2 text-sm ${
            isDark
              ? "bg-gray-800 border-gray-700 text-gray-400"
              : "bg-white border-gray-300 text-gray-500"
          }`}
          style={{ marginLeft: "76px" }}
        >
          No matching log groups
        </div>
      )}
    </div>
  );
}
