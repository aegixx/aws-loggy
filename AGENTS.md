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
- `src/stores/logStore.ts` - Zustand store with all app state
- `src/components/LogViewer.tsx` - Virtualized log list
- `src/components/FilterBar.tsx` - Filter input and level toggles
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
- Log levels: `error`, `warn`, `info`, `debug`, `unknown`

### Adding Tauri commands

1. Add command in `src-tauri/src/lib.rs`
2. Register in `tauri::Builder`
3. Call from frontend via `invoke()`

## Notes

- AWS credentials use default provider chain (profiles, SSO, env vars)
- Log cache limited to 50,000 entries
- Live tail polls every 2 seconds
- react-window v2 API differs from v1 (use `List`, not `FixedSizeList`)
