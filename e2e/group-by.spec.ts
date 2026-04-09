import { test, expect, selectLogGroup } from "./fixtures/demo";

test.describe("Group By", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("group by defaults to none", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await expect(groupBySelect).toHaveValue("none");
  });

  test("switching to Stream shows group headers", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await groupBySelect.selectOption("stream");

    // Scroll to top to ensure headers are in the viewport
    await page.keyboard.press("Home");

    await expect(
      page.locator('[data-testid="group-header"]').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("switching to Invocation shows invocation headers", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await groupBySelect.selectOption("invocation");

    // Scroll to top to ensure headers are in the viewport
    await page.keyboard.press("Home");

    await expect(
      page.locator('[data-testid="group-header"]').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("collapse all button collapses groups", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await groupBySelect.selectOption("stream");

    // Wait for group headers to appear
    await expect(
      page.locator('[data-testid="group-header"]').first(),
    ).toBeVisible({ timeout: 5_000 });

    // Click collapse all
    await page.getByTitle("Collapse all groups").click();

    // After collapsing, log rows should not be visible (only headers remain)
    await expect(page.locator('[data-testid="log-row"]')).toHaveCount(0, {
      timeout: 3_000,
    });
  });

  test("expand all button expands groups", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await groupBySelect.selectOption("stream");

    // Wait for group headers to appear
    await expect(
      page.locator('[data-testid="group-header"]').first(),
    ).toBeVisible({ timeout: 5_000 });

    // Collapse all first
    await page.getByTitle("Collapse all groups").click();
    await expect(page.locator('[data-testid="log-row"]')).toHaveCount(0, {
      timeout: 3_000,
    });

    // Now expand all
    await page.getByTitle("Expand all groups").click();

    // Log rows should be visible again
    await expect(page.locator('[data-testid="log-row"]').first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("group count shown in status bar", async ({ page }) => {
    const groupBySelect = page.locator('select[title="Group by"]');
    await groupBySelect.selectOption("stream");

    // Status bar should show stream count (e.g., "N streams")
    await expect(page.getByText(/\d+ streams/)).toBeVisible({
      timeout: 5_000,
    });
  });
});
