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
- `src/components/SettingsDialog.tsx` - Settings dialog (CMD-,)
- `src/components/StatusBar.tsx` - Status bar with log counts and cache usage
- `src/types/index.ts` - TypeScript type definitions

## Development

```bash
npm start          # Run app in dev mode with hot reload
npm run app:build  # Build production app
npm run fmt        # Format code
npm run lint       # Lint code
```

## Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use Zustand for state management
- Follow existing patterns in codebase
- Run `npm run fmt` before committing

## Testing

No test framework currently configured. Tests welcome as future enhancement.

## Common Tasks

### Adding a new component

1. Create component in `src/components/`
2. Export from component file
3. Import where needed
4. Run `npm run fmt && npm run lint`

### Modifying log parsing

- Edit `parseLogLevel()` in `src/stores/logStore.ts`
- Default log levels: `error`, `warn`, `info`, `debug`, `system`, `unknown`
- Log levels are configurable in Settings (colors, keywords, default visibility)

### Adding Tauri commands

1. Add command in `src-tauri/src/lib.rs`
2. Register in `tauri::Builder`
3. Call from frontend via `invoke()`

## Keyboard Shortcuts

| Shortcut           | Action                                       |
| ------------------ | -------------------------------------------- |
| `⌘L` / `Ctrl+L`    | Focus filter input and select all            |
| `⌘R` / `Ctrl+R`    | Refresh - reconnect to AWS and re-query logs |
| `⌘,` / `Ctrl+,`    | Open Settings                                |
| `Tab`              | Focus log viewer for keyboard navigation     |
| `↑` / `↓`          | Navigate between log rows                    |
| `Page Up` / `Down` | Jump one page at a time                      |
| `Home` / `End`     | Jump to first / last log                     |
| `Space` / `Enter`  | Expand / collapse selected log               |
| `Escape`           | Close dialogs / collapse expanded log        |

## Notes

- AWS credentials use default provider chain (profiles, SSO, env vars)
- SSO credentials auto-refresh within a valid SSO session (no manual intervention needed)
- When SSO session expires, frontend receives `aws-session-expired` event; user must re-auth via `aws sso login`
- `reconnect_aws` Tauri command re-initializes the AWS client after credential refresh
- `refreshConnection` store action calls `reconnect_aws` and re-fetches logs with current filters
- Log cache limits configurable in Settings (default: 50,000 entries OR 100 MB)
- Live tail polls every 2 seconds
- Default time range is 15 minutes
- react-window v2 API differs from v1 (use `List`, not `FixedSizeList`)
- Settings persisted to localStorage via zustand/persist middleware
- Last selected log group is remembered and auto-selected on app launch
