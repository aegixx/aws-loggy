import { useEffect, useCallback, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import LoggyMascot from "../assets/loggy-mascot.png";
import LoggyName from "../assets/loggy-name.png";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_URL = "https://github.com/aegixx/aws-loggy";

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const { theme } = useSettingsStore();
  const [version, setVersion] = useState<string>("");

  // Determine if dark mode
  const systemPrefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "system" ? systemPrefersDark : theme === "dark";

  // Load app version
  useEffect(() => {
    if (isOpen) {
      invoke<string>("get_app_version")
        .then((v) => setVersion(v))
        .catch((err) => {
          console.error("Failed to get app version:", err);
          setVersion("Unknown");
        });
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const openGitHub = () => {
    openUrl(GITHUB_URL);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={`relative rounded-2xl shadow-2xl w-[420px] flex flex-col border overflow-hidden ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}
      >
        {/* Header with gradient and mascot */}
        <div
          className={`relative flex flex-col items-center pt-8 pb-6 ${isDark ? "bg-gradient-to-br from-emerald-900/40 via-gray-800 to-gray-900" : "bg-gradient-to-br from-emerald-100 via-white to-gray-50"}`}
        >
          {/* Decorative circles */}
          <div
            className={`absolute top-4 left-4 w-20 h-20 rounded-full blur-2xl ${isDark ? "bg-emerald-500/20" : "bg-emerald-300/30"}`}
          />
          <div
            className={`absolute bottom-2 right-8 w-16 h-16 rounded-full blur-xl ${isDark ? "bg-teal-500/15" : "bg-teal-200/40"}`}
          />

          <div className="relative flex items-center gap-1 mb-2">
            <img
              src={LoggyMascot}
              alt="Loggy Mascot"
              className="h-28 drop-shadow-lg"
              draggable={false}
            />
            <img
              src={LoggyName}
              alt="Loggy"
              className="w-32 drop-shadow-md"
              draggable={false}
            />
          </div>
          <p
            className={`text-sm font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
          >
            Version {version || "Loading..."}
          </p>
        </div>

        {/* Content */}
        <div
          className={`px-6 py-5 ${isDark ? "text-gray-300" : "text-gray-700"}`}
        >
          <p className="text-center text-sm leading-relaxed mb-5">
            A fast, native desktop app for browsing and tailing AWS CloudWatch
            logs with real-time streaming and powerful filtering.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {[
              "Live Streaming",
              "JSON Queries",
              "50k+ Logs",
              "Custom Colors",
            ].map((feature) => (
              <span
                key={feature}
                className={`px-3 py-1 text-xs rounded-full ${isDark ? "bg-gray-800 text-gray-300 border border-gray-700" : "bg-gray-100 text-gray-600 border border-gray-200"}`}
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Tech stack */}
          <div
            className={`rounded-xl p-4 ${isDark ? "bg-gray-800/50 border border-gray-700/50" : "bg-gray-50 border border-gray-100"}`}
          >
            <h3
              className={`text-xs font-semibold uppercase tracking-wider mb-3 text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}
            >
              Built With
            </h3>
            <div className="flex justify-center gap-4">
              {[
                { name: "Tauri", color: "text-amber-500" },
                { name: "Rust", color: "text-orange-500" },
                { name: "React", color: "text-cyan-500" },
                { name: "TypeScript", color: "text-blue-500" },
              ].map((tech) => (
                <span
                  key={tech.name}
                  className={`text-xs font-medium ${tech.color}`}
                >
                  {tech.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-4 border-t flex items-center justify-between ${isDark ? "border-gray-700/50 bg-gray-800/30" : "border-gray-100 bg-gray-50/50"}`}
        >
          <div className="flex items-center gap-3">
            <p
              className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}
            >
              &copy; 2024 Bryan Stone
            </p>
            <button
              onClick={openGitHub}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${isDark ? "text-gray-400 hover:text-emerald-400" : "text-gray-500 hover:text-emerald-600"}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </button>
          </div>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${isDark ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
