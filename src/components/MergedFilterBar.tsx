import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSystemTheme } from "../hooks/useSystemTheme";

/** Color palette for source badges — cycles for >6 panels */
const SOURCE_COLORS = [
  { bg: "bg-blue-600", text: "text-blue-100", dot: "bg-blue-400" },
  { bg: "bg-green-600", text: "text-green-100", dot: "bg-green-400" },
  { bg: "bg-purple-600", text: "text-purple-100", dot: "bg-purple-400" },
  { bg: "bg-orange-600", text: "text-orange-100", dot: "bg-orange-400" },
  { bg: "bg-pink-600", text: "text-pink-100", dot: "bg-pink-400" },
  { bg: "bg-teal-600", text: "text-teal-100", dot: "bg-teal-400" },
];

export function getSourceColor(index: number) {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}

/** Get short label from log group name */
function getShortLabel(logGroupName: string): string {
  const parts = logGroupName.split("/");
  return parts[parts.length - 1] || logGroupName;
}

export function MergedFilterBar() {
  const isDark = useSystemTheme();
  const panels = useWorkspaceStore((s) => s.panels);
  const mergedSourceToggles = useWorkspaceStore((s) => s.mergedSourceToggles);
  const setMergedSourceToggle = useWorkspaceStore(
    (s) => s.setMergedSourceToggle,
  );

  // Build list of panels with log groups
  const sources: { panelId: string; logGroupName: string; index: number }[] =
    [];
  let idx = 0;
  for (const [panelId, panel] of panels) {
    if (panel.logGroupName) {
      sources.push({ panelId, logGroupName: panel.logGroupName, index: idx });
      idx++;
    }
  }

  if (sources.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 border-b text-xs ${
        isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200"
      }`}
    >
      <span
        className={`mr-1 font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}
      >
        Sources:
      </span>
      {sources.map(({ panelId, logGroupName, index }) => {
        const color = getSourceColor(index);
        const isVisible = mergedSourceToggles.get(panelId) !== false;

        return (
          <button
            key={panelId}
            onClick={() => setMergedSourceToggle(panelId, !isVisible)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-opacity cursor-pointer ${
              isVisible ? "opacity-100" : "opacity-40"
            } ${color.bg} ${color.text}`}
            title={`${isVisible ? "Hide" : "Show"} ${logGroupName}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isVisible ? color.dot : "bg-gray-400"}`}
            />
            <span className="truncate max-w-32">
              {getShortLabel(logGroupName)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
