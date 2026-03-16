# TODOs

## CI pipeline for E2E tests

Create a GitHub Actions workflow that runs `npm run test:e2e` on PRs.

- Playwright + Chromium runs headlessly on `ubuntu-latest` with no display needed
- `playwright.config.ts` already handles CI via `reuseExistingServer: !process.env.CI`
- Workflow steps: `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e`
- Consider caching the Playwright browser install (~100MB) for faster runs

**Depends on:** Playwright E2E test suite (this branch)

## Expand E2E coverage to remaining features

Add E2E test specs for features beyond the initial 4 baseline flows:

- Find-in-log (CMD-F): open find bar, search text, navigate matches
- Context menu: right-click actions (copy, filter by selection/requestId/traceId)
- Keyboard shortcuts: CMD-L (focus filter), CMD-K (clear), CMD-R (refresh), arrow nav
- Group by (stream/invocation): group headers, expand/collapse, metadata display
- Settings dialog (CMD-,): log level colors, cache limits, time presets
- About dialog: version display, GitHub link

The `?demo=true` fixture makes adding new specs straightforward — just create a new `.spec.ts` file that imports from `e2e/fixtures/demo.ts`. Each feature can be a separate PR.

**Depends on:** Playwright E2E test suite (this branch)
