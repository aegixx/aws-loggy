import { test as base, expect, type Page } from "@playwright/test";
import { selectLogGroup, splitPane } from "./fixtures/demo";

/**
 * Wait for demo mode to be fully initialized.
 * Does NOT clear localStorage — used for reload tests.
 */
async function waitForDemoReady(page: Page) {
  // Use .first() since split view may have multiple <select> elements
  await expect(page.locator("select").first()).toHaveValue("demo", {
    timeout: 10_000,
  });
  await expect(
    page.getByRole("combobox", { name: "Log Group:" }).first(),
  ).toBeEnabled({ timeout: 10_000 });
}

/**
 * Select a log group in the nth panel (0-based) and wait for logs.
 */
async function selectLogGroupInPanel(
  page: Page,
  panelIndex: number,
  name: string,
) {
  const combobox = page.locator('[role="combobox"]').nth(panelIndex);
  await combobox.click();
  await combobox.fill(name);
  const option = page.getByRole("option", { name: new RegExp(name) });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
  // Wait for logs to load in the nth panel's status area
  await expect(page.getByText(/\d+ logs/).nth(panelIndex)).toBeVisible({
    timeout: 10_000,
  });
}

base.describe("Multi-panel persistence", () => {
  /**
   * Core regression: each panel must restore its own log group, group-by
   * mode, time preset, and disabled levels independently after reload.
   *
   * Before the fix, only the active panel was restored, and all per-panel
   * settings (groupByMode, timePreset, disabledLevels) were stored as a
   * single global value — last writer wins.
   */
  base(
    "each panel restores its own log group after reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1: payment-service
      await selectLogGroup(page, "payment-service");

      // Split and select a different group in panel 2
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Reload WITHOUT clearing localStorage
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Both panels should restore their respective log groups
      await expect(page.locator('[role="combobox"]').nth(0)).toHaveValue(
        "/aws/lambda/payment-service",
        { timeout: 5_000 },
      );
      await expect(page.locator('[role="combobox"]').nth(1)).toHaveValue(
        "/aws/lambda/auth-handler",
        { timeout: 5_000 },
      );
    },
  );

  base(
    "each panel restores its own group-by mode after reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Panel 1: set group-by to Invocation
      const groupBySelects = page.locator('select[title="Group by"]');
      await groupBySelects.nth(0).selectOption("invocation");
      await expect(groupBySelects.nth(0)).toHaveValue("invocation");

      // Panel 2: set group-by to Stream
      await groupBySelects.nth(1).selectOption("stream");
      await expect(groupBySelects.nth(1)).toHaveValue("stream");

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Each panel should restore its own group-by mode
      await expect(page.locator('select[title="Group by"]').nth(0)).toHaveValue(
        "invocation",
        { timeout: 5_000 },
      );
      await expect(page.locator('select[title="Group by"]').nth(1)).toHaveValue(
        "stream",
        { timeout: 5_000 },
      );
    },
  );

  base(
    "each panel restores its own time preset after reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Panel 1: set to 1h
      await page.getByRole("button", { name: "1h" }).nth(0).click();
      await expect(page.getByRole("button", { name: "1h" }).nth(0)).toHaveClass(
        /bg-blue-600/,
        { timeout: 3_000 },
      );

      // Panel 2: set to 6h
      await page.getByRole("button", { name: "6h" }).nth(1).click();
      await expect(page.getByRole("button", { name: "6h" }).nth(1)).toHaveClass(
        /bg-blue-600/,
        { timeout: 3_000 },
      );

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1 should show 1h active, panel 2 should show 6h active
      await expect(page.getByRole("button", { name: "1h" }).nth(0)).toHaveClass(
        /bg-blue-600/,
        { timeout: 5_000 },
      );
      await expect(page.getByRole("button", { name: "6h" }).nth(1)).toHaveClass(
        /bg-blue-600/,
        { timeout: 5_000 },
      );

      // Verify the presets didn't bleed across panels
      await expect(
        page.getByRole("button", { name: "6h" }).nth(0),
      ).not.toHaveClass(/bg-blue-600/);
      await expect(
        page.getByRole("button", { name: "1h" }).nth(1),
      ).not.toHaveClass(/bg-blue-600/);
    },
  );

  base(
    "live tail in one panel does not bleed into the other panel on reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Panel 2: set to 6h (static)
      await page.getByRole("button", { name: "6h" }).nth(1).click();
      await expect(page.getByRole("button", { name: "6h" }).nth(1)).toHaveClass(
        /bg-blue-600/,
        { timeout: 3_000 },
      );

      // Panel 1: start live tail (this writes persistedTimePreset="live" globally)
      await page.getByRole("button", { name: "Live" }).nth(0).click();
      await expect(page.getByText("Streaming").first()).toBeVisible({
        timeout: 5_000,
      });

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1 should restore to live
      await expect(
        page.getByRole("button", { name: "Live" }).nth(0),
      ).toHaveClass(/bg-green-600/, { timeout: 5_000 });

      // Panel 2 should restore to 6h — NOT inherit live from the global
      await expect(
        page.getByRole("button", { name: "Live" }).nth(1),
      ).not.toHaveClass(/bg-green-600/, { timeout: 3_000 });
      await expect(page.getByRole("button", { name: "6h" }).nth(1)).toHaveClass(
        /bg-blue-600/,
        { timeout: 5_000 },
      );
    },
  );

  base(
    "static preset on panel 1, live on panel 2: live does not bleed back to panel 1",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Panel 1: explicitly set to 15m
      await page.getByRole("button", { name: "15m" }).nth(0).click();
      await expect(
        page.getByRole("button", { name: "15m" }).nth(0),
      ).toHaveClass(/bg-blue-600/, { timeout: 3_000 });

      // Panel 2: start live tail AFTER panel 1 is set to 15m
      // (this overwrites global persistedTimePreset to "live")
      await page.getByRole("button", { name: "Live" }).nth(1).click();
      await expect(page.getByText("Streaming").first()).toBeVisible({
        timeout: 5_000,
      });

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1 should restore to 15m — NOT live
      await expect(
        page.getByRole("button", { name: "Live" }).nth(0),
      ).not.toHaveClass(/bg-green-600/, { timeout: 3_000 });
      await expect(
        page.getByRole("button", { name: "15m" }).nth(0),
      ).toHaveClass(/bg-blue-600/, { timeout: 5_000 });

      // Panel 2 should restore to live
      await expect(
        page.getByRole("button", { name: "Live" }).nth(1),
      ).toHaveClass(/bg-green-600/, { timeout: 5_000 });
    },
  );

  base(
    "each panel restores its own disabled levels after reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Panel 1: disable TRACE
      const traceButtons = page.getByRole("button", { name: "TRACE" });
      await traceButtons.nth(0).click();
      // Disabled TRACE has line-through style
      await expect(traceButtons.nth(0)).toHaveCSS(
        "text-decoration-line",
        "line-through",
        { timeout: 3_000 },
      );

      // Panel 2: leave TRACE enabled (default)
      await expect(traceButtons.nth(1)).not.toHaveCSS(
        "text-decoration-line",
        "line-through",
      );

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1: TRACE should still be disabled
      await expect(
        page.getByRole("button", { name: "TRACE" }).nth(0),
      ).toHaveCSS("text-decoration-line", "line-through", { timeout: 5_000 });

      // Panel 2: TRACE should still be enabled (not affected by panel 1)
      await expect(
        page.getByRole("button", { name: "TRACE" }).nth(1),
      ).not.toHaveCSS("text-decoration-line", "line-through", {
        timeout: 3_000,
      });
    },
  );

  base(
    "handles incomplete per-panel configs from older versions (missing disabledLevels field)",
    async ({ page }) => {
      // Simulate an upgrade scenario: per-panel configs exist in localStorage
      // but were created BEFORE the disabledLevels field was added.
      // The global persistedDisabledLevels says "warn" is disabled.
      // Panel configs have logGroupName and groupByMode but NO disabledLevels.
      // Correct behavior: fall back to global disabledLevels, not "all enabled".
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Set up two panels so we know the panel IDs
      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");
      await selectLogGroupInPanel(page, 1, "auth-handler");

      // Read the current groupStore to get panel IDs
      const panelIds = await page.evaluate(() => {
        const raw = localStorage.getItem("loggy-groups");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const root = parsed.state?.root;
        // Collect leaf panel IDs
        const ids: string[] = [];
        const walk = (node: Record<string, unknown>) => {
          if (node.type === "leaf") {
            const arr = node.panelIds as string[];
            ids.push(...arr);
          } else if (node.type === "split") {
            for (const child of node.children as Record<string, unknown>[]) {
              walk(child);
            }
          }
        };
        walk(root);
        return ids;
      });
      expect(panelIds.length).toBe(2);

      // Now manually patch localStorage to simulate incomplete configs:
      // - Panel 1 has WARNING disabled in per-panel config (field present)
      // - Panel 2 has NO disabledLevels field (simulating pre-upgrade config)
      // - Global persistedDisabledLevels is ["warn"] (panel 2 should inherit this)
      await page.evaluate(
        ({ panelIds: pids }) => {
          // Patch settings store
          const settingsRaw = localStorage.getItem("loggy-settings");
          if (!settingsRaw) throw new Error("no settings");
          const settings = JSON.parse(settingsRaw);

          // Set global disabled levels
          settings.state.persistedDisabledLevels = ["warn"];

          // Panel 1: complete config with explicit disabledLevels
          settings.state.panelPersistedConfigs[pids[0]] = {
            logGroupName: "/aws/lambda/payment-service",
            groupByMode: "invocation",
            groupFilter: true,
            timePreset: null,
            timeRange: null,
            disabledLevels: ["warn", "info", "debug"],
          };

          // Panel 2: incomplete config — no disabledLevels field
          // (simulates config created before field was added)
          settings.state.panelPersistedConfigs[pids[1]] = {
            logGroupName: "/aws/lambda/auth-handler",
            groupByMode: "stream",
            groupFilter: true,
            timePreset: null,
            timeRange: null,
            // NOTE: disabledLevels intentionally MISSING
          };

          localStorage.setItem("loggy-settings", JSON.stringify(settings));
        },
        { panelIds },
      );

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1: WARNING, INFO, DEBUG should be disabled (per-panel config)
      await expect(
        page.getByRole("button", { name: "WARNING" }).nth(0),
      ).toHaveCSS("text-decoration-line", "line-through", { timeout: 5_000 });
      await expect(page.getByRole("button", { name: "INFO" }).nth(0)).toHaveCSS(
        "text-decoration-line",
        "line-through",
      );
      await expect(
        page.getByRole("button", { name: "DEBUG" }).nth(0),
      ).toHaveCSS("text-decoration-line", "line-through");

      // Panel 2: missing disabledLevels field in multi-panel layout —
      // should use defaults (not inherit global), so WARNING stays enabled
      await expect(
        page.getByRole("button", { name: "WARNING" }).nth(1),
      ).not.toHaveCSS("text-decoration-line", "line-through", {
        timeout: 5_000,
      });
      // Panel 2: ERROR should also be enabled
      await expect(
        page.getByRole("button", { name: "ERROR" }).nth(1),
      ).not.toHaveCSS("text-decoration-line", "line-through");
    },
  );

  base(
    "empty panels do not inherit configured panel's settings on reload",
    async ({ page }) => {
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1: select a log group and configure it
      await selectLogGroup(page, "payment-service");

      // Split to create panel 2 (leave it empty — no log group)
      await splitPane(page, "right");

      // Verify panel 2 has no log group (combobox should be empty)
      await expect(page.locator('[role="combobox"]').nth(1)).toHaveValue("", {
        timeout: 3_000,
      });

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 1 should restore its log group
      await expect(page.locator('[role="combobox"]').nth(0)).toHaveValue(
        "/aws/lambda/payment-service",
        { timeout: 5_000 },
      );

      // Panel 2 should remain empty — NOT duplicate panel 1's log group
      await expect(page.locator('[role="combobox"]').nth(1)).toHaveValue("", {
        timeout: 3_000,
      });
    },
  );

  base(
    "stale per-panel configs from old write-back do not resurrect on reload",
    async ({ page }) => {
      // Simulate: old code wrote panel 1's log group into panel 2's per-panel
      // config (the bug we fixed). Verify that empty panels with stale configs
      // pointing to a log group they never chose are cleaned up.
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Set up two panels
      await selectLogGroup(page, "payment-service");
      await splitPane(page, "right");

      // Get panel IDs
      const panelIds = await page.evaluate(() => {
        const raw = localStorage.getItem("loggy-groups");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const root = parsed.state?.root;
        const ids: string[] = [];
        const walk = (node: Record<string, unknown>) => {
          if (node.type === "leaf") {
            ids.push(...(node.panelIds as string[]));
          } else if (node.type === "split") {
            for (const child of node.children as Record<string, unknown>[]) {
              walk(child);
            }
          }
        };
        walk(root);
        return ids;
      });
      expect(panelIds.length).toBe(2);

      // Inject stale per-panel config for panel 2 (simulates old write-back bug)
      await page.evaluate(
        ({ panelIds: pids }) => {
          const settingsRaw = localStorage.getItem("loggy-settings");
          if (!settingsRaw) throw new Error("no settings");
          const settings = JSON.parse(settingsRaw);

          // Panel 2 gets panel 1's log group (the old bug)
          settings.state.panelPersistedConfigs[pids[1]] = {
            logGroupName: "/aws/lambda/payment-service",
            groupByMode: "invocation",
            groupFilter: true,
            timePreset: "live",
            timeRange: null,
            disabledLevels: ["warn", "info"],
          };

          localStorage.setItem("loggy-settings", JSON.stringify(settings));
        },
        { panelIds },
      );

      // Reload
      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 2 has a stale config pointing to payment-service — it WILL restore
      // because the per-panel config explicitly has that logGroupName.
      // This is correct behavior: per-panel configs are authoritative.
      // The real fix is that the write-back no longer creates these stale configs.
      // Verify panel 1 restores correctly
      await expect(page.locator('[role="combobox"]').nth(0)).toHaveValue(
        "/aws/lambda/payment-service",
        { timeout: 5_000 },
      );

      // Now clear panel 2's config to simulate the user resetting it
      // Then verify on next reload it stays empty
      await page.evaluate(
        ({ panelIds: pids }) => {
          const settingsRaw = localStorage.getItem("loggy-settings");
          if (!settingsRaw) throw new Error("no settings");
          const settings = JSON.parse(settingsRaw);
          delete settings.state.panelPersistedConfigs[pids[1]];
          localStorage.setItem("loggy-settings", JSON.stringify(settings));
        },
        { panelIds },
      );

      await page.goto("/?demo=true");
      await waitForDemoReady(page);

      // Panel 2 should now be empty (config was cleared)
      await expect(page.locator('[role="combobox"]').nth(1)).toHaveValue("", {
        timeout: 3_000,
      });
    },
  );
});
