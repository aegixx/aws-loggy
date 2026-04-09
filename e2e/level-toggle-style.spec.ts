import { test as base, expect } from "@playwright/test";
import { test, selectLogGroup, splitPane } from "./fixtures/demo";

test.describe("Level toggle styling in new panels", () => {
  test("disabling TRACE in a newly split panel applies line-through immediately", async ({
    page,
  }) => {
    // Select log group in panel 1
    await selectLogGroup(page, "payment-service");

    // Split to create panel 2
    await splitPane(page, "right");

    // Select a log group in panel 2
    const secondCombobox = page.locator('[role="combobox"]').nth(1);
    await secondCombobox.click();
    await secondCombobox.fill("auth-handler");
    const option = page.getByRole("option", { name: /auth-handler/ });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();
    await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
      timeout: 10_000,
    });

    // Panel 2: TRACE should be enabled (no line-through)
    const traceButton = page.getByRole("button", { name: "TRACE" }).nth(1);
    await expect(traceButton).not.toHaveCSS(
      "text-decoration-line",
      "line-through",
    );

    // Click TRACE in panel 2 to disable it
    await traceButton.click();

    // TRACE should IMMEDIATELY show line-through and reduced opacity
    await expect(traceButton).toHaveCSS(
      "text-decoration-line",
      "line-through",
      { timeout: 2_000 },
    );
    await expect(traceButton).toHaveCSS("opacity", "0.5");
  });

  test("disabling a level in panel 2 does not affect panel 1 styling", async ({
    page,
  }) => {
    await selectLogGroup(page, "payment-service");
    await splitPane(page, "right");

    const secondCombobox = page.locator('[role="combobox"]').nth(1);
    await secondCombobox.click();
    await secondCombobox.fill("auth-handler");
    const option = page.getByRole("option", { name: /auth-handler/ });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();
    await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
      timeout: 10_000,
    });

    // Disable TRACE in panel 2
    await page.getByRole("button", { name: "TRACE" }).nth(1).click();

    // Panel 2: TRACE should be disabled
    await expect(page.getByRole("button", { name: "TRACE" }).nth(1)).toHaveCSS(
      "text-decoration-line",
      "line-through",
      { timeout: 2_000 },
    );

    // Panel 1: TRACE should still be enabled
    await expect(
      page.getByRole("button", { name: "TRACE" }).nth(0),
    ).not.toHaveCSS("text-decoration-line", "line-through");
  });

  // Reproduce the real scenario: panel 1 already configured and persisted,
  // then split to add a new panel — toggle level in the new panel.
  base(
    "level toggle works in panel added after reload of existing single-panel layout",
    async ({ page }) => {
      // First session: set up panel 1 with persisted state
      await page.goto("/?demo=true");
      await base.expect(page.locator("select")).toHaveValue("demo", {
        timeout: 10_000,
      });
      await base
        .expect(page.getByRole("combobox", { name: "Log Group:" }))
        .toBeEnabled();
      await selectLogGroup(page, "payment-service");

      // Reload to persist — simulates the user's normal flow
      await page.goto("/?demo=true");
      await base.expect(page.locator("select").first()).toHaveValue("demo", {
        timeout: 10_000,
      });
      await base
        .expect(page.getByRole("combobox", { name: "Log Group:" }).first())
        .toBeEnabled();

      // Wait for panel 1 to restore
      await base
        .expect(page.getByText(/\d+ logs/).first())
        .toBeVisible({ timeout: 10_000 });

      // Now split to create a NEW panel 2
      await splitPane(page, "right");

      // Select log group in panel 2
      const secondCombobox = page.locator('[role="combobox"]').nth(1);
      await secondCombobox.click();
      await secondCombobox.fill("auth-handler");
      const option = page.getByRole("option", { name: /auth-handler/ });
      await base.expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();
      await base
        .expect(page.getByText(/\d+ logs/).last())
        .toBeVisible({ timeout: 10_000 });

      // Toggle TRACE in panel 2 — this is the bug scenario
      const traceButton = page.getByRole("button", { name: "TRACE" }).nth(1);
      await base
        .expect(traceButton)
        .not.toHaveCSS("text-decoration-line", "line-through");

      await traceButton.click();

      // Must IMMEDIATELY show line-through — no window resize needed
      await base
        .expect(traceButton)
        .toHaveCSS("text-decoration-line", "line-through", { timeout: 2_000 });
      await base.expect(traceButton).toHaveCSS("opacity", "0.5");

      // Panel 1 TRACE should be unaffected
      await base
        .expect(page.getByRole("button", { name: "TRACE" }).nth(0))
        .not.toHaveCSS("text-decoration-line", "line-through");
    },
  );
});
