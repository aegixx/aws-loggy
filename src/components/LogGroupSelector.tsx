import { useLogStore } from "../stores/logStore";
import { useSystemTheme } from "../hooks/useSystemTheme";

export function LogGroupSelector() {
  const {
    logGroups,
    selectedLogGroup,
    selectLogGroup,
    isConnected,
    connectionError,
  } = useLogStore();
  const isDark = useSystemTheme();

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="log-group"
        className={`text-sm whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}
      >
        Log Group:
      </label>
      <select
        id="log-group"
        value={selectedLogGroup ?? ""}
        onChange={(e) => selectLogGroup(e.target.value)}
        disabled={!isConnected}
        className={`flex-1 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-300"}`}
      >
        <option value="">
          {!isConnected
            ? connectionError
              ? "Not connected"
              : "Connecting..."
            : "Select a log group..."}
        </option>
        {logGroups.map((group) => (
          <option key={group.name} value={group.name}>
            {group.name}
          </option>
        ))}
      </select>
    </div>
  );
}
