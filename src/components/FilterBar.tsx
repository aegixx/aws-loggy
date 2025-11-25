import { useLogStore } from '../stores/logStore';

export function FilterBar() {
  const {
    filterText,
    setFilterText,
    isTailing,
    startTail,
    stopTail,
    fetchLogs,
    clearLogs,
    selectedLogGroup,
    logs,
    filteredLogs,
  } = useLogStore();

  const handleRefresh = () => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    fetchLogs(thirtyMinutesAgo);
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800/50 border-b border-gray-700">
      {/* Filter input */}
      <div className="flex-1 relative">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter logs... (use field:value for JSON fields)"
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Log count */}
      <div className="text-sm text-gray-400 whitespace-nowrap">
        {filteredLogs.length !== logs.length ? (
          <span>
            {filteredLogs.length.toLocaleString()} / {logs.length.toLocaleString()}
          </span>
        ) : (
          <span>{logs.length.toLocaleString()} logs</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={!selectedLogGroup || isTailing}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          Refresh
        </button>

        <button
          onClick={isTailing ? stopTail : startTail}
          disabled={!selectedLogGroup}
          className={`px-3 py-1.5 text-sm rounded ${
            isTailing
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-green-600 hover:bg-green-500'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isTailing ? 'Stop Tail' : 'Live Tail'}
        </button>

        <button
          onClick={clearLogs}
          disabled={logs.length === 0}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          Clear
        </button>
      </div>

      {/* Tail indicator */}
      {isTailing && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Live
        </div>
      )}
    </div>
  );
}
