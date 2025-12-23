import { useState, useCallback, type ReactNode } from "react";
import {
  highlightText,
  type HighlightOptions,
} from "../utils/highlightMatches";

interface JsonSyntaxHighlightProps {
  data: unknown;
  indent?: number;
  defaultExpanded?: boolean;
  isDark?: boolean;
  searchTerm?: string;
  searchOptions?: HighlightOptions;
}

interface CollapsibleContainerProps {
  isArray: boolean;
  children: ReactNode;
  preview: string;
  comma: string;
  defaultExpanded: boolean;
  isDark: boolean;
}

function CollapsibleContainer({
  isArray,
  children,
  preview,
  comma,
  defaultExpanded,
  isDark,
}: CollapsibleContainerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  if (!isExpanded) {
    return (
      <span>
        <button
          onClick={toggle}
          className={`transition-colors cursor-pointer ${isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"}`}
          title="Click to expand"
        >
          <span className="mr-1">▶</span>
          <span className={isDark ? "text-gray-400" : "text-gray-500"}>
            {openBracket}
          </span>
          <span
            className={`mx-1 ${isDark ? "text-gray-500" : "text-gray-600"}`}
          >
            {preview}
          </span>
          <span className={isDark ? "text-gray-400" : "text-gray-500"}>
            {closeBracket}
          </span>
        </button>
        <span className={isDark ? "text-gray-400" : "text-gray-500"}>
          {comma}
        </span>
      </span>
    );
  }

  return (
    <>
      <button
        onClick={toggle}
        className={`transition-colors cursor-pointer ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}
        title="Click to collapse"
      >
        <span className="mr-1">▼</span>
        {openBracket}
      </button>
      <div style={{ paddingLeft: "1rem" }}>{children}</div>
      <span className={isDark ? "text-gray-400" : "text-gray-500"}>
        {closeBracket}
        {comma}
      </span>
    </>
  );
}

function renderValue(
  value: unknown,
  indent: number,
  isLast: boolean,
  defaultExpanded: boolean,
  path: string,
  isDark: boolean,
  searchTerm?: string,
  searchOptions?: HighlightOptions,
): ReactNode {
  const comma = isLast ? "" : ",";

  if (value === null) {
    return (
      <span className={isDark ? "text-gray-500" : "text-gray-600"}>
        null{comma}
      </span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span className={isDark ? "text-purple-400" : "text-purple-600"}>
        {value.toString()}
        {comma}
      </span>
    );
  }

  if (typeof value === "number") {
    return (
      <span className={isDark ? "text-yellow-400" : "text-yellow-600"}>
        {value}
        {comma}
      </span>
    );
  }

  if (typeof value === "string") {
    const stringContent =
      searchTerm && searchOptions
        ? highlightText(value, searchTerm, searchOptions)
        : value;
    return (
      <span className={isDark ? "text-green-400" : "text-green-600"}>
        "{stringContent}"{comma}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className={isDark ? "text-gray-400" : "text-gray-500"}>
          []{comma}
        </span>
      );
    }

    const preview = `${value.length} item${value.length !== 1 ? "s" : ""}`;

    return (
      <CollapsibleContainer
        isArray={true}
        preview={preview}
        comma={comma}
        defaultExpanded={defaultExpanded}
        isDark={isDark}
      >
        {value.map((item, index) => (
          <div key={index}>
            {renderValue(
              item,
              indent + 1,
              index === value.length - 1,
              defaultExpanded,
              `${path}[${index}]`,
              isDark,
              searchTerm,
              searchOptions,
            )}
          </div>
        ))}
      </CollapsibleContainer>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <span className={isDark ? "text-gray-400" : "text-gray-500"}>
          {"{}"}
          {comma}
        </span>
      );
    }

    const preview = `${entries.length} key${entries.length !== 1 ? "s" : ""}`;

    return (
      <CollapsibleContainer
        isArray={false}
        preview={preview}
        comma={comma}
        defaultExpanded={defaultExpanded}
        isDark={isDark}
      >
        {entries.map(([key, val], index) => (
          <div key={key}>
            <span className={isDark ? "text-blue-400" : "text-blue-600"}>
              "{key}"
            </span>
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>
              :{" "}
            </span>
            {renderValue(
              val,
              indent + 1,
              index === entries.length - 1,
              defaultExpanded,
              `${path}.${key}`,
              isDark,
              searchTerm,
              searchOptions,
            )}
          </div>
        ))}
      </CollapsibleContainer>
    );
  }

  // Fallback for undefined or other types
  return (
    <span className={isDark ? "text-gray-500" : "text-gray-600"}>
      {String(value)}
      {comma}
    </span>
  );
}

export function JsonSyntaxHighlight({
  data,
  indent = 0,
  defaultExpanded = true,
  isDark = true,
  searchTerm,
  searchOptions,
}: JsonSyntaxHighlightProps) {
  return (
    <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
      {renderValue(
        data,
        indent,
        true,
        defaultExpanded,
        "root",
        isDark,
        searchTerm,
        searchOptions,
      )}
    </pre>
  );
}
