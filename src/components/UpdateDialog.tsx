import { useState, useEffect, useCallback } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSystemTheme } from "../hooks/useSystemTheme";
import { useSettingsStore } from "../stores/settingsStore";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (event: {
      event: string;
      data: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
}

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  update: UpdateInfo | null;
}

export function UpdateDialog({ isOpen, onClose, update }: UpdateDialogProps) {
  const isDark = useSystemTheme();
  const { autoUpdateEnabled, setAutoUpdateEnabled } = useSettingsStore();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDownloading) {
        onClose();
      }
    },
    [isOpen, onClose, isDownloading],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleUpdate = async () => {
    if (!update) return;

    setIsDownloading(true);
    setError(null);

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength ?? 0;
          if (totalBytes > 0) {
            setDownloadProgress(
              Math.round((downloadedBytes / totalBytes) * 100),
            );
          }
        }
      });

      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setIsDownloading(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleDisableAutoUpdate = (checked: boolean) => {
    setAutoUpdateEnabled(!checked);
  };

  if (!isOpen || !update) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isDownloading ? undefined : onClose}
      />

      {/* Dialog */}
      <div
        className={`relative rounded-lg shadow-xl w-[420px] flex flex-col border ${
          isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}
        >
          <h2
            className={`text-lg font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}
          >
            Update Available
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Version info */}
          <div
            className={`text-center mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}
          >
            <p className="text-sm">A new version of Loggy is available</p>
            <p
              className={`text-lg font-mono mt-2 ${isDark ? "text-gray-100" : "text-gray-900"}`}
            >
              {update.currentVersion} →{" "}
              <span className="text-emerald-500">{update.version}</span>
            </p>
          </div>

          {/* Download progress */}
          {isDownloading && (
            <div className="mt-4">
              <div
                className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-200"}`}
              >
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p
                className={`text-xs text-center mt-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                Downloading... {downloadProgress}%
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 rounded bg-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Disable auto-update checkbox */}
          {!isDownloading && (
            <label
              className={`flex items-center gap-2 mt-4 text-sm cursor-pointer ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              <input
                type="checkbox"
                checked={!autoUpdateEnabled}
                onChange={(e) => handleDisableAutoUpdate(e.target.checked)}
                className="rounded"
              />
              Don't check for updates automatically
            </label>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? "border-gray-700" : "border-gray-200"}`}
        >
          <button
            onClick={handleSkip}
            disabled={isDownloading}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:opacity-50"
            }`}
          >
            Skip
          </button>
          <button
            onClick={handleUpdate}
            disabled={isDownloading}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
              isDark
                ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                : "bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
            }`}
          >
            {isDownloading ? "Installing..." : "Update Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
