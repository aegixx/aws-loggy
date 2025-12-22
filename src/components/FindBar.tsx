import { useCallback, type RefObject } from "react";
import {
  VscChevronUp,
  VscChevronDown,
  VscClose,
  VscCaseSensitive,
  VscWholeWord,
  VscRegex,
} from "react-icons/vsc";
import type { HighlightOptions } from "../utils/highlightMatches";

interface FindBarProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  options: HighlightOptions;
  onToggleOption: (option: keyof HighlightOptions) => void;
  currentMatchIndex: number;
  totalMatches: number;
  onNavigate: (direction: "prev" | "next") => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDark: boolean;
}

export function FindBar({
  isOpen,
  onClose,
  searchTerm,
  onSearchTermChange,
  options,
  onToggleOption,
  currentMatchIndex,
  totalMatches,
  onNavigate,
  inputRef,
  isDark,
}: FindBarProps) {
  // Handle keyboard events - stop propagation to prevent LogViewer from handling them
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          onNavigate("prev");
        } else {
          onNavigate("next");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        // Allow CMD+A to select all text in input (browser default)
        e.stopPropagation();
      } else if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
        // Allow CMD+C to copy selected text (browser default)
        e.stopPropagation();
      } else if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        // Prevent CMD+F from doing anything special, just stay in input
        e.preventDefault();
        e.stopPropagation();
      } else if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
          e.key,
        )
      ) {
        // Prevent navigation keys from bubbling to LogViewer
        e.stopPropagation();
      }
    },
    [onNavigate, onClose],
  );

  if (!isOpen) return null;

  const matchCountText =
    totalMatches === 0
      ? searchTerm
        ? "No results"
        : ""
      : `${currentMatchIndex + 1} of ${totalMatches}`;

  const buttonBaseClass = `p-1 rounded transition-colors cursor-pointer`;
  const activeToggleClass = isDark
    ? "bg-blue-600 text-white"
    : "bg-blue-500 text-white";
  const inactiveToggleClass = isDark
    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
    : "text-gray-600 hover:text-gray-800 hover:bg-gray-200";
  const navButtonClass = isDark
    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    : "text-gray-600 hover:text-gray-800 hover:bg-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed";

  return (
    <div
      className={`absolute top-2 right-4 z-50 flex items-center gap-1 px-2 py-1 rounded-md shadow-lg border ${
        isDark
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-300 shadow-md"
      }`}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        className={`w-48 px-2 py-1 text-sm rounded border outline-none focus:ring-1 ${
          isDark
            ? "bg-gray-900 border-gray-600 text-gray-200 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
            : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-400 focus:border-blue-400"
        }`}
        autoFocus
      />

      {/* Match counter */}
      <span
        className={`text-xs min-w-[60px] text-center ${
          isDark ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {matchCountText}
      </span>

      {/* Navigation arrows */}
      <button
        onClick={() => onNavigate("prev")}
        disabled={totalMatches === 0}
        className={`${buttonBaseClass} ${navButtonClass}`}
        title="Previous match (Shift+Enter)"
      >
        <VscChevronUp size={16} />
      </button>
      <button
        onClick={() => onNavigate("next")}
        disabled={totalMatches === 0}
        className={`${buttonBaseClass} ${navButtonClass}`}
        title="Next match (Enter)"
      >
        <VscChevronDown size={16} />
      </button>

      {/* Divider */}
      <div
        className={`w-px h-4 mx-1 ${isDark ? "bg-gray-600" : "bg-gray-300"}`}
      />

      {/* Option toggles */}
      <button
        onClick={() => onToggleOption("caseSensitive")}
        className={`${buttonBaseClass} ${options.caseSensitive ? activeToggleClass : inactiveToggleClass}`}
        title="Match Case"
      >
        <VscCaseSensitive size={16} />
      </button>
      <button
        onClick={() => onToggleOption("wholeWord")}
        className={`${buttonBaseClass} ${options.wholeWord ? activeToggleClass : inactiveToggleClass}`}
        title="Match Whole Word"
      >
        <VscWholeWord size={16} />
      </button>
      <button
        onClick={() => onToggleOption("regex")}
        className={`${buttonBaseClass} ${options.regex ? activeToggleClass : inactiveToggleClass}`}
        title="Use Regular Expression"
      >
        <VscRegex size={16} />
      </button>

      {/* Divider */}
      <div
        className={`w-px h-4 mx-1 ${isDark ? "bg-gray-600" : "bg-gray-300"}`}
      />

      {/* Close button */}
      <button
        onClick={onClose}
        className={`${buttonBaseClass} ${navButtonClass}`}
        title="Close (Escape)"
      >
        <VscClose size={16} />
      </button>
    </div>
  );
}
