import { test, expect, selectLogGroup } from "./fixtures/demo";

test.describe("Log Row Interaction", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("clicking a row selects it", async ({ page }) => {
    const row = page.locator('[data-testid="log-row"]').first();
    await row.click();

    // Selected row gets blue background or border-l-blue styling
    await expect(row).toHaveClass(/bg-blue|border-l-blue/);
  });

  test("clicking a row expands detail view", async ({ page }) => {
    const row = page.locator('[data-testid="log-row"]').first();
    await row.click();

    // Expanded detail has increased height (rendered inline by react-window)
    // Look for the JSON/detail content that appears after expansion
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 3_000 });
  });

  test("clicking expanded row collapses it", async ({ page }) => {
    const row = page.locator('[data-testid="log-row"]').first();

    // Expand
    await row.click();
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 3_000 });

    // Collapse by clicking the same row
    await row.click();
    await expect(page.locator("pre")).not.toBeVisible({ timeout: 3_000 });
  });

  test("Space key toggles expansion", async ({ page }) => {
    // Focus the log viewer container (tabIndex=0), then ArrowDown to select a row
    const viewer = page.locator("[tabindex='0']").first();
    await viewer.focus();
    await page.keyboard.press("ArrowDown");

    // Press Space to expand (ArrowDown selects without expanding)
    await page.keyboard.press("Space");
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 3_000 });
  });

  test("Enter key toggles expansion", async ({ page }) => {
    const viewer = page.locator("[tabindex='0']").first();
    await viewer.focus();
    await page.keyboard.press("ArrowDown");

    await page.keyboard.press("Enter");
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 3_000 });
  });

  test("Escape closes expanded detail", async ({ page }) => {
    const row = page.locator('[data-testid="log-row"]').first();

    // Expand
    await row.click();
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 3_000 });

    // Collapse via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("pre")).not.toBeVisible({ timeout: 3_000 });
  });

  test("empty filter state", async ({ page }) => {
    const filterInput = page.getByPlaceholder("Filter logs");
    await filterInput.fill("zzzznonexistent");

    // Wait for debounce to settle
    await page.waitForTimeout(500);

    // Either "Showing 0 of" text appears or no log rows are visible
    const hasZeroShowing = page.getByText(/Showing 0 of/);
    const logRows = page.locator('[data-testid="log-row"]');

    // At least one of these conditions should hold
    const zeroVisible = await hasZeroShowing.isVisible().catch(() => false);
    if (zeroVisible) {
      await expect(hasZeroShowing).toBeVisible();
    } else {
      await expect(logRows).toHaveCount(0);
    }
  });
});
