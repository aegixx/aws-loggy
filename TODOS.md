# TODOs

## CI pipeline for E2E tests

Create a GitHub Actions workflow that runs `npm run test:e2e` on PRs.

- Playwright + Chromium runs headlessly on `ubuntu-latest` with no display needed
- `playwright.config.ts` already handles CI via `reuseExistingServer: !process.env.CI`
- Workflow steps: `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e`
- Consider caching the Playwright browser install (~100MB) for faster runs

**Depends on:** Playwright E2E test suite (this branch)

## Completed

### Expand E2E coverage to remaining features

**Completed:** v3.12.2 (2026-04-08)

All listed features now have E2E coverage: find-in-log, context menu, keyboard shortcuts, group by, settings dialog, plus multi-panel persistence, level toggle styling, and workspace restore tests. Total: 107 Playwright tests.
