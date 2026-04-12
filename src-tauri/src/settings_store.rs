//! Shared UI-preferences file store with cross-process change watching.
//!
//! Pure UI preferences (theme, log levels, cache limits, auto-update setting, time
//! presets, saved workspaces) live in `<app-data>/settings.json`. All Loggy
//! processes read and write this file, so changing a color in one window
//! propagates to every other open window.
//!
//! ## Writes
//!
//! `save_settings` performs an atomic write: serialize to `settings.json.tmp`,
//! fsync, then rename to `settings.json`. File watchers on macOS/Linux/Windows
//! observe the rename as a single completed event.
//!
//! ## Watcher
//!
//! `start_watcher` spawns a `notify` watcher thread that emits a `settings-changed`
//! Tauri event to all windows when the file changes. Self-writes are suppressed
//! via a 500ms monotonic window (`Instant::now`) — any filesystem event arriving
//! within that window after our own write is dropped. The debounce in the
//! frontend adapter (300ms) combined with the Rust suppression (500ms) prevents
//! feedback loops.
//!
//! The watcher closure uses only `Result`-returning operations. Under the release
//! profile `panic = "abort"`, panic recovery is not available; we avoid panics
//! instead.
//!
//! ## Corruption recovery
//!
//! If `load_settings` encounters malformed JSON, the bad file is renamed to
//! `settings.json.corrupt.<unix_ts>` and defaults are returned. Users can recover
//! manually.
//!
//! ## Schema version
//!
//! The file has a top-level `schema_version` field. If a reader sees a higher
//! version than it supports, it returns defaults and logs a warning. Migrations
//! between versions happen on the frontend side in zustand's `migrate` hook.

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// Schema version this binary reads and writes. Bump when the file format
/// changes in a backward-incompatible way.
pub const SCHEMA_VERSION: u32 = 1;

/// Suppress watcher events that fire within this window after our own write.
const SELF_WRITE_SUPPRESS_MS: u64 = 500;

/// Shared state held in Tauri's AppState so `save_settings` can update the
/// self-write timestamp that the watcher consults.
#[derive(Clone, Default)]
pub struct SettingsWatchState {
    /// When we last wrote the file ourselves. Used to drop our own events.
    last_self_write: Arc<Mutex<Option<Instant>>>,
}

impl SettingsWatchState {
    pub fn mark_self_write(&self) {
        if let Ok(mut guard) = self.last_self_write.lock() {
            *guard = Some(Instant::now());
        }
    }

    fn is_self_write(&self) -> bool {
        if let Ok(guard) = self.last_self_write.lock() {
            if let Some(ts) = *guard {
                return ts.elapsed() < Duration::from_millis(SELF_WRITE_SUPPRESS_MS);
            }
        }
        false
    }
}

/// Compute the settings file path from the app data dir.
pub fn settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("settings.json")
}

/// Read the settings file. Missing / malformed / too-new files return `{}`.
///
/// On JSON parse failure, the bad file is renamed to `settings.json.corrupt.<unix>`
/// so the user can recover manually.
pub fn load_settings(path: &Path) -> Value {
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            log::info!(
                "settings: no file at {}; returning defaults",
                path.display()
            );
            return Value::Object(Default::default());
        }
        Err(e) => {
            log::warn!(
                "settings: could not read {}: {}. Returning defaults.",
                path.display(),
                e
            );
            return Value::Object(Default::default());
        }
    };

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                "settings: malformed JSON in {}: {}. Backing up and returning defaults.",
                path.display(),
                e
            );
            let _ = backup_corrupt(path);
            return Value::Object(Default::default());
        }
    };

    // Enforce schema version ceiling.
    if let Some(version) = parsed.get("schema_version").and_then(|v| v.as_u64()) {
        if version > SCHEMA_VERSION as u64 {
            log::warn!(
                "settings: file schema_version {} exceeds supported {}. Returning defaults.",
                version,
                SCHEMA_VERSION
            );
            return Value::Object(Default::default());
        }
    }

    parsed
}

/// Write settings atomically: write to `settings.json.tmp`, fsync, rename.
///
/// The caller should invoke `watch_state.mark_self_write()` before returning so
/// the watcher will drop the event this write triggers.
pub fn save_settings(path: &Path, mut value: Value) -> Result<(), String> {
    // Ensure parent dir exists.
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create app-data dir: {}", e))?;
    }

    // Stamp the schema version so readers can gate on it.
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "schema_version".to_string(),
            Value::from(SCHEMA_VERSION as u64),
        );
    }

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("serialize settings: {}", e))?;

    let tmp_path = path.with_extension("json.tmp");

    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path)
            .map_err(|e| format!("create tmp file {}: {}", tmp_path.display(), e))?;
        f.write_all(serialized.as_bytes())
            .map_err(|e| format!("write tmp file: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }

    fs::rename(&tmp_path, path).map_err(|e| format!("atomic rename: {}", e))?;
    Ok(())
}

/// Rename a corrupt settings file out of the way so defaults can be used.
fn backup_corrupt(path: &Path) -> std::io::Result<()> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut backup = path.as_os_str().to_os_string();
    backup.push(format!(".corrupt.{}", ts));
    fs::rename(path, PathBuf::from(&backup))
}

/// Start a filesystem watcher that fires a `settings-changed` Tauri event when
/// the settings file changes from any process. Self-writes are suppressed.
///
/// The returned `RecommendedWatcher` must be kept alive for the process
/// lifetime. Dropping it stops watching.
pub fn start_watcher(
    app: AppHandle,
    settings_path: PathBuf,
    watch_state: SettingsWatchState,
) -> Result<RecommendedWatcher, String> {
    // Watch the parent directory (notify cannot watch a file that does not
    // exist yet; the rename-swap also makes file-level watches unreliable).
    let parent = settings_path
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "settings path has no parent".to_string())?;

    if !parent.exists() {
        fs::create_dir_all(&parent).map_err(|e| format!("create watch dir: {}", e))?;
    }

    let settings_path_for_closure = settings_path.clone();
    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let event = match res {
                Ok(e) => e,
                Err(e) => {
                    log::warn!("settings: watcher error: {}", e);
                    return;
                }
            };

            // Only care about events that affect our settings file. Atomic
            // rename shows up as Modify(Name) + Create on some platforms.
            let touches_settings = event
                .paths
                .iter()
                .any(|p| p == &settings_path_for_closure);
            if !touches_settings {
                return;
            }

            match event.kind {
                EventKind::Modify(_) | EventKind::Create(_) => {}
                _ => return,
            }

            if watch_state.is_self_write() {
                log::trace!("settings: dropping self-write event");
                return;
            }

            if let Err(e) = app.emit("settings-changed", ()) {
                log::warn!("settings: could not emit settings-changed: {}", e);
            }
        })
        .map_err(|e| format!("create watcher: {}", e))?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| format!("start watch: {}", e))?;

    log::info!("settings: watching {}", parent.display());
    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[test]
    fn load_missing_returns_empty_object() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        let v = load_settings(&path);
        assert!(v.is_object());
        assert_eq!(v.as_object().unwrap().len(), 0);
    }

    #[test]
    fn save_then_load_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        let state = json!({"theme": "dark", "logLevels": []});
        save_settings(&path, state).unwrap();

        let loaded = load_settings(&path);
        assert_eq!(loaded["theme"], "dark");
        assert_eq!(loaded["schema_version"], SCHEMA_VERSION as u64);
        assert!(loaded["logLevels"].is_array());
    }

    #[test]
    fn load_malformed_backs_up_and_returns_defaults() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        fs::write(&path, b"{not valid json").unwrap();

        let loaded = load_settings(&path);
        assert_eq!(loaded.as_object().unwrap().len(), 0);

        // Original should have been renamed away; a .corrupt.<ts> backup
        // should exist in the same directory.
        assert!(!path.exists(), "corrupt file should be renamed away");
        let backups: Vec<_> = fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt."))
            .collect();
        assert_eq!(backups.len(), 1, "expected one corrupt backup file");
    }

    #[test]
    fn load_too_new_schema_returns_defaults() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        fs::write(
            &path,
            serde_json::to_string(&json!({
                "schema_version": SCHEMA_VERSION as u64 + 99,
                "theme": "dark",
            }))
            .unwrap(),
        )
        .unwrap();

        let loaded = load_settings(&path);
        assert_eq!(loaded.as_object().unwrap().len(), 0);
    }

    #[test]
    fn save_creates_parent_dir() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("a").join("b").join("settings.json");
        save_settings(&nested, json!({"theme": "light"})).unwrap();
        assert!(nested.exists());
    }

    #[test]
    fn save_is_atomic_tmp_file_removed() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        save_settings(&path, json!({"theme": "dark"})).unwrap();
        let tmp_path = path.with_extension("json.tmp");
        assert!(!tmp_path.exists(), "tmp file should be renamed away");
    }

    #[test]
    fn self_write_window_suppresses_events() {
        let state = SettingsWatchState::default();
        assert!(!state.is_self_write());
        state.mark_self_write();
        assert!(state.is_self_write());
        std::thread::sleep(Duration::from_millis(SELF_WRITE_SUPPRESS_MS + 50));
        assert!(!state.is_self_write());
    }
}
