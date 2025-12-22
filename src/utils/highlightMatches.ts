import type { ReactNode } from "react";
import { createElement } from "react";

export interface HighlightOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface MatchInfo {
  index: number;
  start: number;
  length: number;
}

export const defaultHighlightOptions: HighlightOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

/**
 * Escapes special regex characters in a string for use in a regex pattern
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds all matches of a search term in text
 */
export function findAllMatches(
  text: string,
  searchTerm: string,
  options: HighlightOptions = defaultHighlightOptions,
): MatchInfo[] {
  if (!searchTerm || !text) {
    return [];
  }

  try {
    let pattern: string;

    if (options.regex) {
      pattern = searchTerm;
    } else {
      pattern = escapeRegex(searchTerm);
    }

    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const flags = options.caseSensitive ? "g" : "gi";
    const regex = new RegExp(pattern, flags);

    const matches: MatchInfo[] = [];
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index,
        start: match.index,
        length: match[0].length,
      });
      index++;

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return matches;
  } catch {
    // Invalid regex - return empty matches
    return [];
  }
}

/**
 * Splits text into segments with highlighted matches
 * Returns an array of ReactNodes with highlighted spans for matches
 */
export function highlightText(
  text: string,
  searchTerm: string,
  options: HighlightOptions = defaultHighlightOptions,
  currentMatchIndex?: number,
): ReactNode[] {
  if (!searchTerm || !text) {
    return [text];
  }

  const matches = findAllMatches(text, searchTerm, options);

  if (matches.length === 0) {
    return [text];
  }

  const result: ReactNode[] = [];
  let lastEnd = 0;

  matches.forEach((match, idx) => {
    // Add text before match
    if (match.start > lastEnd) {
      result.push(text.slice(lastEnd, match.start));
    }

    // Add highlighted match
    const matchText = text.slice(match.start, match.start + match.length);
    const isCurrent = currentMatchIndex === idx;
    const className = isCurrent
      ? "find-highlight find-highlight-current"
      : "find-highlight";

    result.push(
      createElement(
        "mark",
        {
          key: `match-${match.start}-${idx}`,
          className,
          "data-match-index": idx,
        },
        matchText,
      ),
    );

    lastEnd = match.start + match.length;
  });

  // Add remaining text after last match
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }

  return result;
}

/**
 * Counts total matches in text
 */
export function countMatches(
  text: string,
  searchTerm: string,
  options: HighlightOptions = defaultHighlightOptions,
): number {
  return findAllMatches(text, searchTerm, options).length;
}
