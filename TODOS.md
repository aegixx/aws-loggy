# TODOs

## CI pipeline for E2E tests

Create a GitHub Actions workflow that runs `npm run test:e2e` on PRs.

- Playwright + Chromium runs headlessly on `ubuntu-latest` with no display needed
- `playwright.config.ts` already handles CI via `reuseExistingServer: !process.env.CI`
- Workflow steps: `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e`
- Consider caching the Playwright browser install (~100MB) for faster runs

**Depends on:** Playwright E2E test suite (this branch)

## Multi-Process: Recent Workspaces quick-launcher

Add a "Recent Workspaces" submenu under `Loggy → New Window with Workspace →` that shows the last 5 workspaces the user opened, regardless of whether they're saved. Complement to the existing saved-workspace submenu — faster path to "give me another `dev` window."

**Priority:** P3 (polish)
**Deferred from:** `feat/multi-process` plan

## Multi-Process: cross-window trace correlation

When the user clicks a trace ID in window A (dev), surface any matching events in other open windows (e.g., prod) via a cross-process IPC signal or a shared file. Enables end-to-end debugging across environment boundaries.

**Priority:** P3
**Deferred from:** `feat/multi-process` plan. Significant new feature, not a polish item.

## Multi-Process: per-window bounds persistence

Remember each Loggy window's size and position independently so ⌘N reopens land in the same place they closed. Currently all windows share the Tauri-managed default bounds.

**Priority:** P3
**Deferred from:** `feat/multi-process` plan

## Multi-Process: concurrent settings edit conflict detection

If two windows both have the Settings dialog open and edit the same color/pattern within the same debounce window, last writer wins silently. Add a diff-on-hydrate check that toasts the user when a concurrent edit was overwritten.

**Priority:** P4 (rare in practice for a single-user desktop app)
**Deferred from:** `feat/multi-process` plan

## Multi-Process: Playwright multi-window E2E harness

Investigate whether Tauri + Playwright can launch two app instances in one test run so multi-window scenarios (cross-window settings sync, primary-crash-recovery, spawn-with-workspace) can be covered in CI. Currently manual QA only.

**Priority:** P2 (regression risk without it)
**Deferred from:** `feat/multi-process` plan

## Multi-Process: savedWorkspaces size limit

Enforce a soft cap on `savedWorkspaces.length` (e.g., 50) with a Settings warning when the user approaches it, and hard rejection of new saves past a higher ceiling. Prevents `settings.json` growing unbounded.

**Priority:** P4
**Deferred from:** `feat/multi-process` plan

## Multi-Process: child-process crash-on-boot detection

If `open_new_window` spawns a child that crashes before its window is visible, the parent has no feedback. Add a handshake: child emits a `child-booted` event within 5s of spawn, otherwise the parent surfaces a toast. Currently a silent failure mode.

**Priority:** P3
**Deferred from:** `feat/multi-process` plan

## Multi-Process: mtime-gated focus-safety-net re-read

The FSEvents safety net in `WindowEvent::Focused(true)` currently emits `settings-changed` unconditionally on every focus-gained event, which forces a `get_settings` IPC round trip and a diff check on routine window switching (cmd-tab, dock click). Correctness is fine (the diff guard in `subscribeSettingsChanged` prevents spurious `setState`), but it is a file read per focus, not just an in-memory check. Track a `last_seen_mtime` in `MultiProcessState` and only emit when `settings.json`'s mtime has advanced since last read.

**Priority:** P4 (speculative optimization — revisit if a user hits jank on a network-mounted home dir)
**Deferred from:** `feat/multi-process` PR review

## Multi-Process: toast system for spawn errors

`App.tsx` currently uses a blocking `alert()` to surface `open_new_window` errors (the main path: "development build is not an .app bundle"). Replace with a tail-style status-bar toast once Loggy grows a toast utility. Low-priority because this path is only hit in dev builds.

**Priority:** P4
**Deferred from:** `feat/multi-process` PR review

## Completed

### Expand E2E coverage to remaining features

**Completed:** v3.12.2 (2026-04-08)

All listed features now have E2E coverage: find-in-log, context menu, keyboard shortcuts, group by, settings dialog, plus multi-panel persistence, level toggle styling, and workspace restore tests. Total: 107 Playwright tests.
