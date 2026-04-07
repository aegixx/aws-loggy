import { useGroupStore } from "../stores/groupStore";
import { useSystemTheme } from "../hooks/useSystemTheme";
import { WorkspaceMenu } from "./WorkspaceMenu";

export function WorkspaceBar() {
  const isDark = useSystemTheme();
  const timeSyncEnabled = useGroupStore((s) => s.timeSyncEnabled);
  const setTimeSyncEnabled = useGroupStore((s) => s.setTimeSyncEnabled);

  return (
    <div
      className={`flex items-center h-8 px-1 gap-1 border-b select-none ${
        isDark
          ? "bg-gray-800/80 border-gray-700"
          : "bg-gray-100 border-gray-300"
      }`}
    >
      {/* Spacer */}
      <div className="flex-1" />

      {/* Time sync toggle */}
      <button
        onClick={() => setTimeSyncEnabled(!timeSyncEnabled)}
        className={`p-1 rounded transition-colors border ${
          timeSyncEnabled
            ? "bg-blue-600 text-white border-blue-600"
            : isDark
              ? "text-gray-400 hover:text-gray-200 border-gray-600 hover:bg-gray-700"
              : "text-gray-500 hover:text-gray-800 border-gray-300 hover:bg-gray-200"
        }`}
        title={
          timeSyncEnabled
            ? "Time sync enabled — time range changes apply to all panels"
            : "Time sync disabled — each panel has independent time ranges"
        }
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle
            cx="5"
            cy="7"
            r="3.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="5"
            y1="4.5"
            x2="5"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="5"
            y1="7"
            x2="6.5"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M9 5.5h2.5M9 7h2.5M9 8.5h2.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Workspace save/load menu */}
      <WorkspaceMenu isDark={isDark} />
    </div>
  );
}
