import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  findAllMatches,
  type HighlightOptions,
  type MatchInfo,
  defaultHighlightOptions,
} from "../utils/highlightMatches";
import { useDebounce } from "./useDebounce";

// Extended match info that includes which log the match is in
export interface LogMatch extends MatchInfo {
  logIndex: number;
}

export interface FindState {
  isOpen: boolean;
  searchTerm: string;
  options: HighlightOptions;
  currentMatchIndex: number;
  matches: LogMatch[];
  // Helper to get matches for a specific log
  getMatchesForLog: (logIndex: number) => MatchInfo[];
  // Get the current match's log index
  currentLogIndex: number | null;
}

export interface FindActions {
  open: () => void;
  close: () => void;
  setSearchTerm: (term: string) => void;
  toggleOption: (option: keyof HighlightOptions) => void;
  goToNext: () => void;
  goToPrev: () => void;
  focusInput: () => void;
}

interface LogEntry {
  message: string;
  parsedJson?: Record<string, unknown> | null;
}

export function useFindInLog(
  logs: LogEntry[],
  onNavigateToLog?: (logIndex: number) => void,
): [FindState, FindActions] {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTermState] = useState("");
  const [options, setOptions] = useState<HighlightOptions>(
    defaultHighlightOptions,
  );
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search term by 300ms
  const debouncedSearchTerm = useDebounce(inputValue, 300);

  // Sync debounced value to actual search term
  useEffect(() => {
    if (debouncedSearchTerm !== searchTerm) {
      setSearchTermState(debouncedSearchTerm);
      setCurrentMatchIndex(0);
    }
  }, [debouncedSearchTerm, searchTerm]);

  // Compute matches across all logs
  const matches = useMemo(() => {
    if (!isOpen || !searchTerm || logs.length === 0) {
      return [];
    }

    const allMatches: LogMatch[] = [];

    logs.forEach((log, logIndex) => {
      // Search in message
      const messageMatches = findAllMatches(log.message, searchTerm, options);
      messageMatches.forEach((match) => {
        allMatches.push({
          ...match,
          logIndex,
          index: allMatches.length, // Global match index
        });
      });
    });

    return allMatches;
  }, [isOpen, searchTerm, logs, options]);

  // Get matches for a specific log (for highlighting)
  const getMatchesForLog = useCallback(
    (logIndex: number): MatchInfo[] => {
      return matches
        .filter((m) => m.logIndex === logIndex)
        .map((m) => ({
          index: m.index,
          start: m.start,
          length: m.length,
        }));
    },
    [matches],
  );

  // Get the current match's log index
  const currentLogIndex = useMemo(() => {
    if (matches.length === 0 || currentMatchIndex >= matches.length) {
      return null;
    }
    return matches[currentMatchIndex].logIndex;
  }, [matches, currentMatchIndex]);

  // Clamp current match index when matches change
  const clampedCurrentMatchIndex = useMemo(() => {
    if (matches.length === 0) return 0;
    return Math.min(currentMatchIndex, matches.length - 1);
  }, [matches.length, currentMatchIndex]);

  // Update current match index if it's out of bounds
  if (clampedCurrentMatchIndex !== currentMatchIndex && matches.length > 0) {
    setCurrentMatchIndex(clampedCurrentMatchIndex);
  }

  const open = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInputValue("");
    setSearchTermState("");
    setCurrentMatchIndex(0);
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    setInputValue(term);
    // Note: actual searchTerm will be updated via debounce effect
  }, []);

  const toggleOption = useCallback((option: keyof HighlightOptions) => {
    setOptions((prev) => ({
      ...prev,
      [option]: !prev[option],
    }));
    setCurrentMatchIndex(0);
  }, []);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    // Navigate to the log containing this match
    if (onNavigateToLog) {
      onNavigateToLog(matches[nextIndex].logIndex);
    }
  }, [matches, currentMatchIndex, onNavigateToLog]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIndex);
    // Navigate to the log containing this match
    if (onNavigateToLog) {
      onNavigateToLog(matches[prevIndex].logIndex);
    }
  }, [matches, currentMatchIndex, onNavigateToLog]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const state: FindState = {
    isOpen,
    searchTerm: inputValue, // Return input value for immediate UI feedback
    options,
    currentMatchIndex: clampedCurrentMatchIndex,
    matches,
    getMatchesForLog,
    currentLogIndex,
  };

  const actions: FindActions = {
    open,
    close,
    setSearchTerm,
    toggleOption,
    goToNext,
    goToPrev,
    focusInput,
  };

  // Expose inputRef through a custom property for FindBar to use
  (actions as FindActions & { inputRef: typeof inputRef }).inputRef = inputRef;

  return [state, actions];
}

export type { HighlightOptions, MatchInfo };
