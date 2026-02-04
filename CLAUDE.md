# AI Agent Instructions

## Project Overview

Loggy is a desktop application for viewing AWS CloudWatch logs. Built with Tauri (Rust backend) + React/TypeScript frontend.

See `DESIGN.md` for full architecture documentation.

## Tech Stack

- **Backend**: Tauri 2.x, Rust, AWS SDK for Rust
- **Frontend**: React 19, TypeScript, Zustand, react-window v2, Tailwind CSS v4
- **Build**: Vite, trunk (formatting/linting)

## Key Files

- `src-tauri/src/lib.rs` - Rust backend with AWS CloudWatch integration
- `src/stores/logStore.ts` - Zustand store with log/connection state
- `src/stores/settingsStore.ts` - Zustand store with persisted settings (colors, patterns)
- `src/components/LogViewer.tsx` - Virtualized log list
- `src/components/FilterBar.tsx` - Filter input and level toggles
- `src/components/FindBar.tsx` - Find-in-log search bar (CMD-F)
- `src/components/ContextMenu.tsx` - Right-click context menu for log rows
- `src/components/SettingsDialog.tsx` - Settings dialog (CMD-,)
- `src/components/StatusBar.tsx` - Status bar with log counts and cache usage
- `src/hooks/useFindInLog.ts` - Find-in-log state management hook
- `src/utils/highlightMatches.ts` - Text search and highlight utilities
- `src/stores/LiveTailManager.ts` - Stream/poll transport orchestrator for live tail
- `src/stores/TailPoller.ts` - Polling transport (fallback for live tail)
- `src/stores/TailTransport.ts` - Transport interface
- `src/types/index.ts` - TypeScript type definitions
- `src/components/UpdateDialog.tsx` - Auto-update dialog (shown when update available)
- `src/hooks/useUpdateCheck.ts` - Hook for checking updates (startup + manual via menu)

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
- Run `npm run fmt` before committing

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

- Edit `parseLogLevel()` in `src/stores/logStore.ts`
- Default log levels: `error`, `warn`, `info`, `debug`, `trace`, `system`, `unknown`
- Log levels are configurable in Settings (colors, keywords, default visibility)

### Adding Tauri commands

1. Add command in `src-tauri/src/lib.rs`
2. Register in `tauri::Builder`
3. Call from frontend via `invoke()`

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

## Menu Bar

The Loggy application menu includes:

| Item                 | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| About Loggy          | Show about dialog                                                  |
| Check for Updates... | Manually check for updates (shows result in status bar and dialog) |
| Preferences... (⌘,)  | Open settings                                                      |

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
- Default time range is 15 minutes
- react-window v2 API differs from v1 (use `List`, not `FixedSizeList`)
- Settings persisted to localStorage via zustand/persist middleware
- Last selected log group is remembered and auto-selected on app launch
- Auto-update checks for new GitHub Releases on startup (configurable in Settings)
