import { useLogStore } from '../stores/logStore';

export function LogGroupSelector() {
  const { logGroups, selectedLogGroup, selectLogGroup, isConnected, connectionError } = useLogStore();

  if (!isConnected) {
    return (
      <div className="p-4 text-center">
        {connectionError ? (
          <div className="text-red-400">
            <p className="font-semibold">Connection Error</p>
            <p className="text-sm mt-1">{connectionError}</p>
          </div>
        ) : (
          <p className="text-gray-400">Connecting to AWS...</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="log-group" className="text-sm text-gray-400 whitespace-nowrap">
        Log Group:
      </label>
      <select
        id="log-group"
        value={selectedLogGroup ?? ''}
        onChange={(e) => selectLogGroup(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">Select a log group...</option>
        {logGroups.map((group) => (
          <option key={group.name} value={group.name}>
            {group.name}
          </option>
        ))}
      </select>
    </div>
  );
}
