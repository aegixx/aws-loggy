import { useState, useRef, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { WorkspaceConfig } from "../types/workspace";

interface WorkspaceMenuProps {
  isDark: boolean;
}

export function WorkspaceMenu({ isDark }: WorkspaceMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const saveWorkspace = useWorkspaceStore((s) => s.saveWorkspace);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const savedWorkspaces = useSettingsStore((s) => s.savedWorkspaces);
  const addSavedWorkspace = useSettingsStore((s) => s.addSavedWorkspace);
  const removeSavedWorkspace = useSettingsStore((s) => s.removeSavedWorkspace);
  const renameSavedWorkspace = useSettingsStore((s) => s.renameSavedWorkspace);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsSaving(false);
        setRenamingId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setIsSaving(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus save input when saving mode activates
  useEffect(() => {
    if (isSaving && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [isSaving]);

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    const config = saveWorkspace(name);
    addSavedWorkspace(config);
    setSaveName("");
    setIsSaving(false);
  }, [saveName, saveWorkspace, addSavedWorkspace]);

  const handleLoad = useCallback(
    (config: WorkspaceConfig) => {
      loadWorkspace(config);
      setIsOpen(false);
    },
    [loadWorkspace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeSavedWorkspace(id);
    },
    [removeSavedWorkspace],
  );

  const handleRename = useCallback(
    (id: string) => {
      const name = renameValue.trim();
      if (!name) return;
      renameSavedWorkspace(id, name);
      setRenamingId(null);
    },
    [renameValue, renameSavedWorkspace],
  );

  const menuItemBase = `flex items-center px-3 py-1.5 text-xs`;
  const menuItemEnabled = isDark
    ? "text-gray-200 hover:bg-gray-700 cursor-pointer"
    : "text-gray-800 hover:bg-gray-100 cursor-pointer";
  const separatorClass = isDark ? "border-gray-700" : "border-gray-200";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors border ${
          isDark
            ? "text-gray-400 hover:text-gray-200 border-gray-600 hover:bg-gray-700"
            : "text-gray-500 hover:text-gray-800 border-gray-300 hover:bg-gray-200"
        }`}
        title="Workspace menu — save, load, or delete workspace configurations"
      >
        WS
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 top-full mt-1 z-50 min-w-[220px] py-1 rounded-md shadow-lg border ${
            isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-300 shadow-md"
          }`}
        >
          {/* Save current workspace */}
          {isSaving ? (
            <div className="px-3 py-1.5">
              <input
                ref={saveInputRef}
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") {
                    setIsSaving(false);
                    setSaveName("");
                  }
                }}
                placeholder="Workspace name..."
                className={`w-full px-2 py-1 text-xs rounded border ${
                  isDark
                    ? "bg-gray-900 border-gray-600 text-gray-200 placeholder-gray-500"
                    : "bg-white border-gray-300 text-gray-800 placeholder-gray-400"
                }`}
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className={`flex-1 px-2 py-0.5 text-[10px] rounded ${
                    saveName.trim()
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : isDark
                        ? "bg-gray-700 text-gray-500"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsSaving(false);
                    setSaveName("");
                  }}
                  className={`flex-1 px-2 py-0.5 text-[10px] rounded ${
                    isDark
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`${menuItemBase} ${menuItemEnabled}`}
              onClick={() => setIsSaving(true)}
            >
              Save current workspace...
            </div>
          )}

          {/* Separator */}
          {savedWorkspaces.length > 0 && (
            <div className={`border-t my-1 ${separatorClass}`} />
          )}

          {/* Saved workspaces list */}
          {savedWorkspaces.map((ws) => (
            <div
              key={ws.id}
              className={`${menuItemBase} ${menuItemEnabled} justify-between gap-2`}
            >
              {renamingId === ws.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(ws.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => handleRename(ws.id)}
                  className={`flex-1 px-1 py-0 text-xs rounded border ${
                    isDark
                      ? "bg-gray-900 border-gray-600 text-gray-200"
                      : "bg-white border-gray-300 text-gray-800"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="truncate flex-1"
                  onClick={() => handleLoad(ws)}
                  title={`Load "${ws.name}" — ${ws.panels.length} panel(s), ${ws.layoutMode}`}
                >
                  {ws.name}
                </span>
              )}
              <span className="flex gap-0.5 shrink-0">
                <span
                  className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}
                >
                  {ws.panels.length}p
                </span>
                {renamingId !== ws.id && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(ws.id);
                        setRenameValue(ws.name);
                      }}
                      className={`w-4 h-4 flex items-center justify-center rounded text-[10px] ${
                        isDark
                          ? "hover:bg-gray-600 text-gray-500 hover:text-gray-200"
                          : "hover:bg-gray-300 text-gray-400 hover:text-gray-700"
                      }`}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ws.id);
                      }}
                      className={`w-4 h-4 flex items-center justify-center rounded text-[10px] ${
                        isDark
                          ? "hover:bg-red-900/50 text-gray-500 hover:text-red-400"
                          : "hover:bg-red-50 text-gray-400 hover:text-red-600"
                      }`}
                      title="Delete"
                    >
                      &times;
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}

          {/* Empty state */}
          {savedWorkspaces.length === 0 && (
            <div
              className={`px-3 py-1.5 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}
            >
              No saved workspaces
            </div>
          )}
        </div>
      )}
    </div>
  );
}
