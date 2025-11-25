import { useState, useCallback, type ReactNode } from "react";

interface JsonSyntaxHighlightProps {
  data: unknown;
  indent?: number;
  defaultExpanded?: boolean;
}

interface CollapsibleContainerProps {
  isArray: boolean;
  children: ReactNode;
  preview: string;
  comma: string;
  defaultExpanded: boolean;
}

function CollapsibleContainer({
  isArray,
  children,
  preview,
  comma,
  defaultExpanded,
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
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Click to expand"
        >
          <span className="text-gray-400">{openBracket}</span>
          <span className="text-gray-500 mx-1">{preview}</span>
          <span className="text-gray-400">{closeBracket}</span>
        </button>
        <span className="text-gray-400">{comma}</span>
      </span>
    );
  }

  return (
    <>
      <button
        onClick={toggle}
        className="text-gray-400 hover:text-gray-200 transition-colors"
        title="Click to collapse"
      >
        {openBracket}
      </button>
      <div style={{ paddingLeft: "1rem" }}>{children}</div>
      <span className="text-gray-400">
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
): ReactNode {
  const comma = isLast ? "" : ",";

  if (value === null) {
    return <span className="text-gray-500">null{comma}</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span className="text-purple-400">
        {value.toString()}
        {comma}
      </span>
    );
  }

  if (typeof value === "number") {
    return (
      <span className="text-yellow-400">
        {value}
        {comma}
      </span>
    );
  }

  if (typeof value === "string") {
    return (
      <span className="text-green-400">
        "{value}"{comma}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400">[]{comma}</span>;
    }

    const preview = `${value.length} item${value.length !== 1 ? "s" : ""}`;

    return (
      <CollapsibleContainer
        isArray={true}
        preview={preview}
        comma={comma}
        defaultExpanded={defaultExpanded}
      >
        {value.map((item, index) => (
          <div key={index}>
            {renderValue(
              item,
              indent + 1,
              index === value.length - 1,
              defaultExpanded,
              `${path}[${index}]`,
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
        <span className="text-gray-400">
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
      >
        {entries.map(([key, val], index) => (
          <div key={key}>
            <span className="text-blue-400">"{key}"</span>
            <span className="text-gray-400">: </span>
            {renderValue(
              val,
              indent + 1,
              index === entries.length - 1,
              defaultExpanded,
              `${path}.${key}`,
            )}
          </div>
        ))}
      </CollapsibleContainer>
    );
  }

  // Fallback for undefined or other types
  return (
    <span className="text-gray-500">
      {String(value)}
      {comma}
    </span>
  );
}

export function JsonSyntaxHighlight({
  data,
  indent = 0,
  defaultExpanded = true,
}: JsonSyntaxHighlightProps) {
  return (
    <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
      {renderValue(data, indent, true, defaultExpanded, "root")}
    </pre>
  );
}
