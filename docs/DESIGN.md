# AWS Loggy - Design Document

## Overview

A desktop application for viewing, querying, and visualizing AWS CloudWatch logs with a focus on real-time streaming, client-side filtering, and responsive UX.

## Problem Statement

Existing tools like AWS Live Tail or CloudWatch Console make a roundtrip to AWS on each request, resulting in:

- No true live tail capability (just polling/refresh)
- Sluggish filtering (server roundtrip for each query)
- No client-side caching or intelligence

## Core Requirements

### Must Have

1. **Live Log Tailing** - True streaming of new log events as they arrive
2. **Historical Log Viewing** - Browse and search past logs with time range selection
3. **Real-time Client-side Filtering** - Instant filtering as user types (no AWS roundtrip)
4. **JSON Query Filtering** - Filter by JSON field values (e.g., `level:error`, `userId:123`)
5. **Pattern-based Colorization** - Highlight logs by level (ERROR=red, WARN=yellow) or custom patterns
6. **Desktop GUI** - Native-feeling cross-platform desktop application

### Nice to Have

- CloudWatch Logs Insights query support
- Saved/favorite queries
- Export to JSON/CSV
- Multiple log group support

## Design Principles

1. **Keyboard-First Interface** - The application must be fully operable via keyboard. All UI actions must have corresponding keyboard shortcuts. Mouse/trackpad usage should be optional, not required.

2. **Instant Feedback** - All filtering and UI interactions should feel instantaneous with no perceptible delay.

3. **Fail Fast** - Prefer clear error messages over silent failures or fallback behaviors.

## Keyboard Shortcuts

| Shortcut           | Action                                       |
| ------------------ | -------------------------------------------- |
| `⌘F` / `Ctrl+F`    | Find text in logs                            |
| `⌘L` / `Ctrl+L`    | Focus filter input and select all            |
| `⌘R` / `Ctrl+R`    | Refresh - reconnect to AWS and re-query logs |
| `⌘K` / `Ctrl+K`    | Clear logs (keep filters, re-fetch)          |
| `⌘,` / `Ctrl+,`    | Open Settings                                |
| `⌘A` / `Ctrl+A`    | Select all visible logs                      |
| `⌘C` / `Ctrl+C`    | Copy selected messages to clipboard          |
| `Tab`              | Focus log viewer for keyboard navigation     |
| `↑` / `↓`          | Navigate between log rows                    |
| `Page Up` / `Down` | Jump one page at a time                      |
| `Home` / `End`     | Jump to first / last log                     |
| `Space` / `Enter`  | Expand / collapse selected log               |
| `Escape`           | Close dialogs / collapse expanded log        |

## Technical Architecture

### Stack: Tauri + React + TypeScript

**Tauri Benefits:**

- Small bundle size (~10-15MB vs 150MB+ Electron)
- Rust backend for high-performance log parsing/streaming
- Native OS integration (system tray, notifications)
- Lower memory footprint (uses OS webview)

**Frontend:**

- React 19 with TypeScript
- Zustand for state management
- react-window v2 for virtualized log rendering
- Tailwind CSS v4 for styling

**Theme:** Follow system preference (dark/light mode)

**AWS Credentials:** Use AWS SDK default credential provider chain

- Automatically supports profiles, SSO, IAM roles, environment variables
- SSO credentials auto-refresh within a valid SSO session
- When SSO session expires, the app automatically opens the SSO login URL in the browser
- The app polls for valid credentials after opening SSO login (every 2 seconds, up to 2 minutes)
- When credentials become valid, `aws-session-refreshed` event is emitted and connection auto-refreshes
- `aws-session-expired` event is also emitted to frontend for UI feedback
- `reconnect_aws` command re-initializes client after credential refresh

### Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Log Viewer  │  │  Filters    │  │  Settings/Config    │  │
│  │ (Virtual    │  │  (Instant)  │  │  (AWS Profile,      │  │
│  │  Scroll)    │  │             │  │   Log Groups)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Tauri IPC (Events + Commands)
┌────────────────────────┴────────────────────────────────────┐
│                     Rust Backend                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ AWS SDK     │  │ Log Cache   │  │  Log Parser         │  │
│  │ (CloudWatch │  │ (In-memory  │  │  (JSON, Text,       │  │
│  │  Logs)      │  │  buffer)    │  │   Pattern Match)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### Rust Backend (Tauri)

- **AWS CloudWatch Client**: Use `aws-sdk-cloudwatchlogs` for API calls
- **Log Streamer**: Poll CloudWatch with `FilterLogEvents` in a background task
- **Log Cache**: In-memory ring buffer storing recent logs for instant client-side filtering
- **Log Parser**: Parse JSON logs, extract fields for querying

#### React Frontend

- **LogViewer**: Virtualized list (react-window) for rendering 100k+ logs smoothly
- **FilterBar**: Text input that filters cached logs instantly + level toggles
- **TimeRangePicker**: Preset buttons (15m, 1h, 6h, 24h, 7d) + custom date range
- **LogDetailInline**: Expandable detail view with JSON syntax highlighting
- **JsonSyntaxHighlight**: Colorized JSON renderer

### Data Flow

**Live Tail Mode:**

1. Backend polls CloudWatch every 2 seconds for new events
2. New events parsed, cached, and emitted to frontend
3. Frontend appends to virtualized list, applies active filters client-side
4. User filter changes = instant re-filter of cached data (no AWS call)

**Historical Mode:**

1. User selects time range
2. Backend fetches logs from CloudWatch (with pagination)
3. Logs cached and displayed
4. Client-side filtering on cached data

### Filtering System

**Filter Types:**

1. **Text Search**: Space-separated AND matching (all terms must be present in any order)
2. **JSON Field Query**: `field:value` or `field.nested:value` syntax
3. **Log Level**: Quick toggles for ERROR, WARN, INFO, DEBUG, TRACE, SYSTEM

**Implementation:**

- All filtering happens client-side on cached logs
- Debounce input to avoid excessive re-renders

### Log Grouping

Logs can be organized into collapsible sections via a "Group by" dropdown in the filter bar. Two grouping modes are available:

- **Stream**: Groups logs by `log_stream_name`. Available for all log groups. Sorted by most recent activity.
- **Invocation**: Groups logs by Lambda invocation, detected via `START`/`END`/`REPORT` system log markers. Only available for `/aws/lambda/*` log groups. Headers show request ID, duration, billed duration, and memory usage parsed from REPORT lines.

An **Auto** mode selects Invocation for Lambda log groups and Stream for everything else.

**Architecture:**

- `groupLogsByStream()` and `groupLogsByInvocation()` in `src/utils/groupLogs.ts` are pure functions that transform a `ParsedLogEvent[]` into `LogGroupSection[]`
- `useLogGroups` hook computes a flat `DisplayItem[]` array (interleaving headers and log rows) consumed by the virtualized list
- `GroupHeader` component renders inline in the `react-window` list at 32px height
- Grouping is a view-layer transformation — filtering, find, and selection operate on individual log rows unchanged
- `collapsedGroups` Set in the store tracks which groups are collapsed
- During live tail, in-progress invocations (START received, no REPORT yet) show an "In progress" badge; metadata fills in when REPORT arrives

### Log Level Detection

Priority order for determining log level:

1. **JSON `level` field**: Parse JSON and check `level` or `log_level` field
2. **Prefix pattern**: Match `INFO`, `WARN`, `ERROR`, `DEBUG` with surrounding whitespace
3. **Fallback**: Keyword matching anywhere in message

### Colorization

Log level colors are theme-adaptive, automatically adjusting for dark and light modes using CSS `color-mix()`:

- **Configuration**: Each log level has a single `baseColor` configurable in Settings
- **Theme Adaptation**: Colors are computed at runtime:
  - Dark mode: Text lightened, subtle dark-tinted background
  - Light mode: Text darkened, subtle light-tinted background
- **CSS Variables**: Colors are applied via `--log-{level}-text` and `--log-{level}-bg` CSS variables

Default levels: ERROR (red), WARN (yellow), INFO (blue), DEBUG (green), TRACE (purple), SYSTEM (gray)

## Multi-Process Architecture

Loggy supports running multiple windows simultaneously, each as an independent OS process. This enables the common SRE workflow of monitoring `dev` and `prod` at the same time without switching profiles.

### Process model

Each Loggy process has its own `AppState` (AWS client, live tail handles, cancellation flags), so AWS isolation is free. What needs coordination is frontend state:

- **Shared UI preferences** — theme, log levels, cache limits, time presets, auto-update setting, and the saved-workspaces catalog. Edited in one window, reflected in all others.
- **Per-window workspace state** — the AWS profile this window is connected to, the layout tree, per-panel configs (filters, time range, grouping), and the ID of any loaded saved-workspace. Completely independent across windows.

### Instance role

The first process to launch acquires an advisory `fs2` file lock at `<app-data>/loggy.lock` and becomes the **primary**. Subsequent processes become **secondaries**. Role is decided at boot (`src-tauri/src/instance.rs`) and never changes for the lifetime of the process. Dropping the lock handle (via RAII) or process exit (via the OS) releases the lock.

Primaries own persisted workspace state in localStorage (`loggy-groups` and the workspace slice of `loggy-workspace`). Secondaries run that state entirely in memory and discard it on close.

> ⚠️ Do not add `tauri-plugin-single-instance`. It would break the multi-process launch flow.

### Shared settings file

Shared UI prefs live in `<app-data>/settings.json` (`src-tauri/src/settings_store.rs`):

- Writes are atomic: serialize → write to `settings.json.tmp` → fsync → rename.
- Reads tolerate corruption: malformed JSON is renamed to `settings.json.corrupt.<unix_ts>` and defaults are returned, so the user retains a recovery option.
- Schema versioning: `schema_version` field; a reader that sees a version higher than it supports falls back to defaults and logs a warning.
- A `notify` watcher emits a `settings-changed` Tauri event when the file changes. Self-writes are suppressed for 500ms (monotonic `Instant::now`) to avoid feedback loops.

### Frontend split storage

`src/stores/settingsStore.ts` uses a custom zustand `PersistStorage` that routes fields between destinations:

- **Shared fields** (`theme`, `logLevels`, `cacheLimits`, `autoUpdateEnabled`, `timePresets`, `savedWorkspaces`) → `set_settings` / `get_settings` Tauri commands → `settings.json`. Writes debounce at 300ms.
- **Workspace fields** (`awsProfile`, `lastSelectedLogGroup`, `panelPersistedConfigs`, legacy global filter state) → `localStorage["loggy-workspace"]` on primaries, no-op on secondaries.

`src/stores/groupStore.ts` (layout tree) uses a similar role-aware `StateStorage` — localStorage on primaries, no-op on secondaries.

The v17 → v18 migration reads any legacy single-blob `loggy-settings` localStorage key, splits its fields between the two destinations, and removes the legacy key.

### ASCII diagram

```text
  ┌──────────────────────────────────────────────────────────────────────┐
  │                        macOS / Linux / Windows                       │
  │                                                                      │
  │   ┌──────────────────────┐             ┌──────────────────────┐      │
  │   │   Process A (prim)   │             │   Process B (sec)    │      │
  │   │  ┌────────────────┐  │             │  ┌────────────────┐  │      │
  │   │  │  Tauri webview │  │             │  │  Tauri webview │  │      │
  │   │  │   React UI     │  │             │  │   React UI     │  │      │
  │   │  │  settingsStore │◀─┼─ get/set ───┼─▶│  settingsStore │  │      │
  │   │  │  (split adapt) │  │             │  │  (split adapt) │  │      │
  │   │  │  groupStore    │  │             │  │  groupStore    │  │      │
  │   │  │  (localStorage)│  │             │  │  (in-memory)   │  │      │
  │   │  └────────┬───────┘  │             │  └────────┬───────┘  │      │
  │   │           │ Tauri cmds             │           │          │      │
  │   │  ┌────────▼───────┐  │             │  ┌────────▼───────┐  │      │
  │   │  │  Rust AppState │  │             │  │  Rust AppState │  │      │
  │   │  │  AWS client    │  │             │  │  AWS client    │  │      │
  │   │  │  LOCK (held)   │  │             │  │  LOCK (none)   │  │      │
  │   │  │  notify watch  │  │             │  │  notify watch  │  │      │
  │   │  └────────┬───────┘  │             │  └────────┬───────┘  │      │
  │   └───────────┼──────────┘             └───────────┼──────────┘      │
  │               │                                    │                 │
  │               ▼                                    ▼                 │
  │   ┌──────────────────────────────────────────────────────┐           │
  │   │             <app-data>/                              │           │
  │   │   loggy.lock     (fs2 advisory, held by Proc A)      │           │
  │   │   settings.json  (atomic rename, read by all)        │           │
  │   └──────────────────────────────────────────────────────┘           │
  └──────────────────────────────────────────────────────────────────────┘
```

### Launch flow

`Loggy → New Window` (⌘N) emits `new-window-requested`. The frontend listener calls the `open_new_window` Tauri command. On macOS, the command shells out to `open -n -a <path-to-Loggy.app>` (where the path is derived from `std::env::current_exe()` walked up to the `.app` bundle). On Linux/Windows, it spawns `current_exe()` detached. The child inherits `LOGGY_SECONDARY=1` and optionally `LOGGY_LOAD_WORKSPACE=<id>`.

On boot, the child calls `get_boot_workspace` to read `LOGGY_LOAD_WORKSPACE` and, if present, loads that saved workspace via `workspaceStore.loadWorkspace`.

### Close flow

`tauri://close-requested`:

1. `workspaceStore.autoSaveLoadedWorkspace()` writes the current layout back to `savedWorkspaces` if the window was opened with a workspace ID.
2. `flushPendingSettingsWrites()` flushes any debounced settings writes that would otherwise be lost.
3. The OS releases the instance lock on exit.

## Project Structure

```text
aws-loggy/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   └── lib.rs          # Tauri commands & AWS integration
│   └── Cargo.toml
├── src/                    # React frontend
│   ├── components/
│   │   ├── AboutDialog.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── FilterBar.tsx
│   │   ├── FindBar.tsx
│   │   ├── JsonSyntaxHighlight.tsx
│   │   ├── LogDetailInline.tsx
│   │   ├── LogGroupSelector.tsx
│   │   ├── LogRowDetail.tsx
│   │   ├── LogViewer.tsx
│   │   ├── MaximizedLogView.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── StatusBar.tsx
│   │   ├── TimeRangePicker.tsx
│   │   └── UpdateDialog.tsx
│   ├── stores/
│   │   ├── logStore.ts        # Zustand log/connection state
│   │   ├── settingsStore.ts   # Zustand persisted settings
│   │   ├── LiveTailManager.ts # Stream/poll transport orchestrator
│   │   ├── TailPoller.ts      # Polling transport (fallback)
│   │   └── TailTransport.ts   # Transport interface
│   ├── hooks/
│   │   ├── useDebounce.ts
│   │   ├── useDragSelection.ts
│   │   ├── useFindInLog.ts
│   │   ├── useKeyboardNavigation.ts
│   │   ├── useSystemTheme.ts
│   │   ├── useLogGroups.ts
│   │   └── useUpdateCheck.ts
│   ├── utils/
│   │   ├── extractFieldVariants.ts
│   │   ├── groupLogs.ts
│   │   └── highlightMatches.ts
│   ├── types/
│   │   └── index.ts
│   └── App.tsx
├── package.json
├── docs/DESIGN.md          # This file
└── CLAUDE.md               # AI agent instructions
```

## Configuration

- **Log cache limits**: Configurable in Settings
  - Default: 50,000 log entries OR 100 MB (whichever is hit first)
  - Progress displayed in status bar during fetch
  - Truncation warning shown when limits reached
- **Polling interval**: 2 seconds for live tail
- **Theme**: System preference (dark/light)

## Dependencies

### Rust (Cargo.toml)

- `tauri` - Desktop framework
- `aws-sdk-cloudwatchlogs` - CloudWatch Logs API
- `aws-config` - Default credential chain
- `tokio` - Async runtime
- `serde` / `serde_json` - Serialization

### Frontend (package.json)

- `react` / `react-dom` - UI framework
- `@tauri-apps/api` - Tauri JS bindings
- `zustand` - State management
- `react-window` - Virtual scrolling
- `tailwindcss` - Styling
- `date-fns` - Date utilities
- `react-icons` - Material Design icons
- `react-datepicker` - Date/time picker component
- `fuse.js` - Fuzzy search for log group selector
- `react-markdown` - Markdown rendering for update changelog

## Scripts

```bash
npm start          # Run in development mode
npm run app:build  # Build production app (.app + .dmg)
npm run fmt        # Format code (trunk)
npm run lint       # Lint code (trunk)
```

## Future Enhancements

- Regex filter support (`/pattern/`)
- Custom colorization rules
- Saved/favorite queries
- Export to JSON/CSV
- CloudWatch Logs Insights integration
- Multiple log group tabs/panes
