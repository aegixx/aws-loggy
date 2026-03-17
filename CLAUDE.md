# AI Agent Instructions

## Project Overview

Loggy is a desktop application for viewing AWS CloudWatch logs. Built with Tauri (Rust backend) + React/TypeScript frontend.

See `docs/DESIGN.md` for full architecture documentation.

## Tech Stack

- **Backend**: Tauri 2.x, Rust, AWS SDK for Rust
- **Frontend**: React 19, TypeScript, Zustand, react-window v2, Fuse.js, react-markdown, Tailwind CSS v4
- **Build**: Vite, trunk (formatting/linting)

## Key Files

### Backend

- `src-tauri/src/lib.rs` - Rust backend with AWS CloudWatch integration (per-panel commands and events)

### Stores (Zustand)

- `src/stores/connectionStore.ts` - AWS connection state, log groups (shared across panels)
- `src/stores/workspaceStore.ts` - Panel manager, merged view, correlation, workspace config (composed slices)
- `src/stores/panelSlice.ts` - Per-panel state factory (logs, filters, tail, grouping)
- `src/stores/settingsStore.ts` - Persisted settings (colors, patterns, time presets)
- `src/stores/LiveTailManager.ts` - Stream/poll transport orchestrator for live tail (per-panel)
- `src/stores/TailPoller.ts` - Polling transport (fallback for live tail)
- `src/stores/TailTransport.ts` - Transport interface

### Components

- `src/components/WorkspaceBar.tsx` - Tab bar for multi-panel switching (drag-to-reorder, status dots)
- `src/components/PanelContainer.tsx` - Renders all panels, hides inactive with CSS
- `src/components/PanelView.tsx` - Wraps per-panel components with PanelContext
- `src/components/LogViewer.tsx` - Virtualized log list
- `src/components/LogGroupSelector.tsx` - Fuzzy search log group selector (Fuse.js + virtualized dropdown)
- `src/components/FilterBar.tsx` - Filter input and level toggles
- `src/components/FindBar.tsx` - Find-in-log search bar (CMD-F)
- `src/components/ContextMenu.tsx` - Right-click context menu for log rows
- `src/components/SettingsDialog.tsx` - Settings dialog (CMD-,)
- `src/components/StatusBar.tsx` - Status bar with log counts and cache usage
- `src/components/GroupHeader.tsx` - Group header component for stream/invocation headers
- `src/components/UpdateDialog.tsx` - Auto-update dialog with changelog display and release notes link
- `src/components/TimePresetEditor.tsx` - Time preset editor for Settings dialog

### Contexts & Hooks

- `src/contexts/PanelContext.tsx` - React context for panel ID scoping + convenience hooks
- `src/hooks/useLogGroups.ts` - Hook for computing grouped display items
- `src/hooks/useFindInLog.ts` - Find-in-log state management hook
- `src/hooks/useUpdateCheck.ts` - Hook for checking updates (startup + manual via menu)

### Utilities

- `src/utils/logParsing.ts` - Log event parsing, JSON detection, fragment merging, timestamp formatting
- `src/utils/logFiltering.ts` - Text/level filtering, FilterCache class, field:value syntax
- `src/utils/connectionErrors.ts` - AWS connection/credential error detection
- `src/utils/highlightMatches.ts` - Text search and highlight utilities
- `src/utils/groupLogs.ts` - Log grouping logic (by stream and Lambda invocation)

### Types

- `src/types/index.ts` - Core TypeScript type definitions (LogEvent, ParsedLogEvent, event payloads)
- `src/types/workspace.ts` - Workspace types (PanelConfig, WorkspaceConfig, LayoutMode, etc.)

### Demo Mode

- `src/demo/demoStore.ts` - Demo mode state (Zustand, non-persisted)
- `src/demo/demoInvoke.ts` - Invoke wrapper that intercepts Tauri commands in demo mode
- `src/demo/mockData.ts` - Mock Lambda log groups and log event generators
- `src/demo/DemoTailTransport.ts` - Simulated live tail transport for demo mode

## Development

```bash
npm start          # Run app in dev mode with hot reload
npm run app:build  # Build production app
npm run fmt        # Format code
npm run lint       # Lint code
npm test           # Run tests
npm run test:watch # Run tests in watch mode
```

## Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use Zustand for state management
- Follow existing patterns in codebase
- Pre-commit hook runs `fmt`, `lint`, and `build` automatically

## Testing

Uses Vitest with React Testing Library. Tests are in `*.test.ts` / `*.test.tsx` files alongside source.

```bash
npm test           # Run all tests
npm run test:watch # Run in watch mode
```

## Common Tasks

### Adding a new component

1. Create component in `src/components/`
2. Export from component file
3. Import where needed
4. Run `npm run fmt && npm run lint`

### Modifying log parsing

- Edit `parseLogLevel()` in `src/utils/logParsing.ts`
- Default log levels: `error`, `warn`, `info`, `debug`, `trace`, `system`, `unknown`
- Log levels are configurable in Settings (colors, keywords, default visibility)

### Adding Tauri commands

1. Add command in `src-tauri/src/lib.rs`
2. Register in `tauri::Builder`
3. Call from frontend via `invoke()`

## Keyboard Shortcuts

| Shortcut            | Action                                       |
| ------------------- | -------------------------------------------- |
| `⌘F` / `Ctrl+F`     | Find text in logs                            |
| `⌘L` / `Ctrl+L`     | Focus filter input and select all            |
| `⌘R` / `Ctrl+R`     | Refresh - reconnect to AWS and re-query logs |
| `⌘K` / `Ctrl+K`     | Clear logs (keep filters, re-fetch)          |
| `⌘,` / `Ctrl+,`     | Open Settings                                |
| `⌘A` / `Ctrl+A`     | Select all visible logs                      |
| `⌘C` / `Ctrl+C`     | Copy selected messages to clipboard          |
| `Tab`               | Focus log viewer for keyboard navigation     |
| `↑` / `↓`           | Navigate between log rows                    |
| `Page Up` / `Down`  | Jump one page at a time                      |
| `Home` / `End`      | Jump to first / last log                     |
| `Space` / `Enter`   | Expand / collapse selected log               |
| `Escape`            | Close dialogs / collapse expanded log        |
| `⌘T` / `Ctrl+T`     | Open new tab                                 |
| `⌘W` / `Ctrl+W`     | Close active tab                             |
| `⌘⇧[` / `Ctrl+⇧[`   | Switch to previous tab                       |
| `⌘⇧]` / `Ctrl+⇧]`   | Switch to next tab                           |
| `⌘1-9` / `Ctrl+1-9` | Jump to tab by index                         |

## Menu Bar

The Loggy application menu includes:

| Item                 | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| About Loggy          | Show about dialog                                                  |
| Check for Updates... | Manually check for updates (shows result in status bar and dialog) |
| Preferences... (⌘,)  | Open settings                                                      |
| Demo Mode            | Toggle demo mode with mock Lambda data (no AWS required)           |

## Context Menu

Right-click on any log row to access the context menu with the following options:

| Action         | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| Copy/Copy sel. | Copy selection (if text selected), multi-selected rows, or row |
| Find "..."     | Open Find dialog with selected text (requires text selection)  |
| Filter by      | Submenu with filtering options (see below)                     |
| Refresh        | Reconnect to AWS and re-query logs                             |
| Clear          | Clear logs and re-fetch                                        |

### Filter by Submenu

| Option     | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| Selection  | Filter by selected text (requires text selection)           |
| Request ID | Filter by `metadata.requestId:value` (if requestId present) |
| Trace ID   | Filter by `metadata.traceId:value` (if traceId present)     |
| Client IP  | Filter by `metadata.clientIp:value` (if clientIP present)   |

**Note**: "Find" requires text selection in the expanded detail view. "Filter by" menu is disabled when no options are available. Each filter option checks both top-level and `metadata` nested fields (e.g., `requestId`, `RequestId`, `metadata.requestId`).

## Group By

The filter bar includes a "Group by" dropdown that organizes logs into collapsible sections:

| Mode        | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| No grouping | Default flat timeline view                                        |
| Stream      | Groups logs by log stream name                                    |
| Invocation  | Groups by Lambda invocation (START/END markers). Lambda only.     |
| Auto        | Invocation for `/aws/lambda/*` groups, Stream for everything else |

Group headers show metadata (log count, error indicator, relative time). Invocation headers additionally show request ID, duration, and memory usage parsed from Lambda REPORT lines. In-progress invocations (during live tail) show an "In progress" badge until the REPORT line arrives.

Grouping is purely visual — filtering, find-in-log, and selection operate on individual log rows unchanged.

## Group Filter Toggle

A toggle inside the filter input (layers icon) that switches text filtering to group scope:

- **ON (default)**: Shows all groups containing at least one text match; all logs in matching groups are visible (level filtering still per-row)
- **OFF**: Current behavior — only individually matching rows shown
- Only visible when grouping is active (Stream or Invocation mode)
- Persisted across sessions
- Does not affect log level filtering — levels always filter per-row

## Time Presets

The filter bar time quickfilter buttons are customizable in Settings (CMD-,):

- Up to 5 presets, each with a duration value and unit (minutes/hours/days)
- Defaults: 15m, 1h, 6h, 24h, 7d
- Add, remove, reorder, and reset to defaults
- Calendar picker (custom date range) always available regardless of presets
- Presets persisted to localStorage via settingsStore

## Notes

- AWS credentials use default provider chain (profiles, SSO, env vars)
- SSO credentials auto-refresh within a valid SSO session (no manual intervention needed)
- When SSO session expires, the app automatically opens the SSO login URL in the browser using `aws sso login --profile <profile>`
- After opening SSO login, the app polls every 2 seconds (up to 2 minutes) to detect when credentials become valid
- When credentials are valid, `aws-session-refreshed` event is emitted and the connection automatically refreshes
- Frontend also receives `aws-session-expired` event for UI feedback
- `reconnect_aws` Tauri command re-initializes the AWS client after credential refresh
- `refreshConnection` store action calls `reconnect_aws` and re-fetches logs with current filters
- Log cache limits configurable in Settings (default: 50,000 entries OR 100 MB)
- Live tail uses CloudWatch StartLiveTail streaming API (1-second updates from AWS)
- Falls back to 1-second polling if streaming is unavailable or sampling detected
- Sampling detection: if 500 events in one update, switches to polling from last clean timestamp
- Follow mode auto-scrolls to latest during live tail; pauses when scrolled up; "Jump to latest" button to resume
- Transport indicator shows "Streaming" or "Polling" during live tail
- Log group selector uses Fuse.js fuzzy matching with virtualized dropdown (keyboard nav: ArrowUp/Down, Enter, Escape)
- Filter bar uses AND matching: space-separated terms must all be present (in any order)
- Default time range is 15 minutes
- react-window v2 API differs from v1 (use `List`, not `FixedSizeList`)
- Settings persisted to localStorage via zustand/persist middleware
- Last selected log group is remembered and auto-selected on app launch
- Auto-update checks for new GitHub Releases on startup (configurable in Settings)
- Homebrew tap: `aegixx/homebrew-aws-loggy` — cask auto-updated by release workflow
- WinGet package: `SteampunkLabs.AWSLoggy` — manifest auto-submitted by release workflow via `vedantmgoyal9/winget-releaser`

## Demo Mode

- Toggled via Loggy > Demo Mode menu item (works in published builds)
- Hides real AWS profiles and shows only mock log groups when active
- Intercepts all Tauri `invoke()` calls at the frontend layer (`src/demo/demoInvoke.ts`)
- Provides 4 Lambda log groups with realistic invocations (START/END/REPORT, structured JSON, errors)
- Live tail simulation via `DemoTailTransport` generates new invocations every ~1.5 seconds
- StatusBar shows orange "DEMO" badge; profile dropdown shows "demo" and is disabled
- Toggling off reconnects to real AWS automatically
- Demo state is not persisted — always starts in normal mode
