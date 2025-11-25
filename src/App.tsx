import { useEffect } from 'react';
import { LogGroupSelector } from './components/LogGroupSelector';
import { FilterBar } from './components/FilterBar';
import { LogViewer } from './components/LogViewer';
import { useLogStore } from './stores/logStore';
import './App.css';

function App() {
  const { initializeAws, isConnected, connectionError } = useLogStore();

  useEffect(() => {
    initializeAws();
  }, [initializeAws]);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-4 p-3 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-semibold text-blue-400">AWS Loggy</h1>
        <div className="flex-1">
          <LogGroupSelector />
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            Connected
          </div>
        )}
        {connectionError && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <span className="w-2 h-2 bg-red-400 rounded-full" />
            Disconnected
          </div>
        )}
      </header>

      {/* Filter bar */}
      <FilterBar />

      {/* Log viewer */}
      <LogViewer />
    </div>
  );
}

export default App;
