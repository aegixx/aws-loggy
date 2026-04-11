//! Instance role determination via advisory file lock.
//!
//! The first process to acquire the lock becomes `Primary`. Any subsequent process
//! that cannot acquire it becomes `Secondary`. Role is boot-time-only and does not
//! change for the lifetime of the process. When a primary exits, the OS releases the
//! advisory lock; the next process launched will acquire it and become the new
//! primary.
//!
//! ## Fallback behavior
//!
//! If the lock file path is unwritable (unusual — only possible with a broken
//! app-data dir), this module logs a warning and returns `Primary` without holding
//! a real lock. The app still launches; multi-process isolation is lost for that
//! one case. We never panic on boot.
//!
//! ## Not compatible with `tauri-plugin-single-instance`
//!
//! Adding `tauri-plugin-single-instance` would break this module's premise. Do not
//! add that plugin without redesigning the multi-process launch flow.

use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::path::Path;

/// Which role this process holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstanceRole {
    /// First process launched. Owns persisted workspace state (localStorage keys).
    Primary,
    /// Subsequent process. Workspace state is in-memory only; shared settings are
    /// still read/written via the on-disk settings file.
    Secondary,
}

impl InstanceRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Primary => "Primary",
            Self::Secondary => "Secondary",
        }
    }
}

/// Handle that holds the advisory lock for the lifetime of the process.
///
/// Dropping this handle releases the lock. The OS also releases the lock
/// automatically on process death, so crashes never leave stale locks.
pub struct InstanceLock {
    pub role: InstanceRole,
    // Keep the file open so the advisory lock is held. `None` when we fell back to
    // Primary without a real lock (unwritable path case).
    _file: Option<File>,
}

impl InstanceLock {
    /// Try to acquire the instance lock at `lock_path`. Returns an `InstanceLock`
    /// with `role` set to whichever role this process ended up holding.
    ///
    /// This function never fails. A path that is unwritable logs a warning and
    /// returns `Primary` without a real lock.
    pub fn acquire(lock_path: &Path) -> Self {
        if let Some(parent) = lock_path.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    log::warn!(
                        "instance: could not create app-data dir {}: {}. Falling back to Primary without lock.",
                        parent.display(),
                        e
                    );
                    return Self {
                        role: InstanceRole::Primary,
                        _file: None,
                    };
                }
            }
        }

        let file = match OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(lock_path)
        {
            Ok(f) => f,
            Err(e) => {
                log::warn!(
                    "instance: could not open lock file {}: {}. Falling back to Primary without lock.",
                    lock_path.display(),
                    e
                );
                return Self {
                    role: InstanceRole::Primary,
                    _file: None,
                };
            }
        };

        match file.try_lock_exclusive() {
            Ok(()) => {
                log::info!("instance: acquired primary lock at {}", lock_path.display());
                Self {
                    role: InstanceRole::Primary,
                    _file: Some(file),
                }
            }
            Err(_) => {
                log::info!(
                    "instance: lock held by another process at {} — running as secondary",
                    lock_path.display()
                );
                Self {
                    role: InstanceRole::Secondary,
                    _file: None,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn empty_dir_yields_primary() {
        let tmp = TempDir::new().unwrap();
        let lock_path = tmp.path().join("loggy.lock");

        let lock = InstanceLock::acquire(&lock_path);
        assert_eq!(lock.role, InstanceRole::Primary);
        assert!(lock_path.exists());
    }

    #[test]
    fn second_acquire_in_same_process_yields_secondary() {
        let tmp = TempDir::new().unwrap();
        let lock_path = tmp.path().join("loggy.lock");

        let first = InstanceLock::acquire(&lock_path);
        assert_eq!(first.role, InstanceRole::Primary);

        // Second acquire must see the lock as held.
        let second = InstanceLock::acquire(&lock_path);
        assert_eq!(second.role, InstanceRole::Secondary);
    }

    #[test]
    fn drop_releases_lock() {
        let tmp = TempDir::new().unwrap();
        let lock_path = tmp.path().join("loggy.lock");

        {
            let first = InstanceLock::acquire(&lock_path);
            assert_eq!(first.role, InstanceRole::Primary);
        } // drop

        let second = InstanceLock::acquire(&lock_path);
        assert_eq!(second.role, InstanceRole::Primary);
    }

    #[test]
    fn missing_parent_dir_is_created() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("a").join("b").join("c");
        let lock_path = nested.join("loggy.lock");

        let lock = InstanceLock::acquire(&lock_path);
        assert_eq!(lock.role, InstanceRole::Primary);
        assert!(nested.exists());
    }
}
