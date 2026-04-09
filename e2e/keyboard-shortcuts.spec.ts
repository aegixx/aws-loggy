import {
  test,
  expect,
  selectLogGroup,
  startLiveTail,
  modifier,
} from "./fixtures/demo";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("modifier+L focuses filter input", async ({ page }) => {
    // Click elsewhere first to ensure filter is not already focused
    await page.locator("body").click();

    await page.keyboard.press(`${modifier()}+l`);

    const filterInput = page.getByPlaceholder("Filter logs");
    await expect(filterInput).toBeFocused({ timeout: 3_000 });
  });

  test("modifier+R refreshes logs", async ({ page }) => {
    // Verify logs are visible before refresh
    await expect(page.getByText(/\d+ logs/)).toBeVisible();

    await page.keyboard.press(`${modifier()}+r`);

    // After refresh, logs should still be visible (re-fetched)
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });

  test("modifier+, opens settings", async ({ page }) => {
    await page.keyboard.press(`${modifier()}+,`);

    await expect(page.getByText("Settings").first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("modifier+F opens find bar", async ({ page }) => {
    await page.keyboard.press(`${modifier()}+f`);

    await expect(page.getByPlaceholder("Find")).toBeVisible({ timeout: 3_000 });
  });

  test("modifier+K clears logs during tail", async ({ page }) => {
    await startLiveTail(page);

    // Wait for streaming logs to appear
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });

    // Clear logs via keyboard shortcut
    await page.keyboard.press(`${modifier()}+k`);

    // After clear, logs should re-fetch (page remains responsive with log count)
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });

  test("modifier+A selects all logs", async ({ page }) => {
    // Click into the log viewer area first so it receives keyboard events
    const firstRow = page.locator('[data-testid="log-row"]').first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });
    await firstRow.click();

    await page.keyboard.press(`${modifier()}+a`);

    // Multi-selected rows get border-l-blue-400 class
    const selectedRows = page.locator(
      '[data-testid="log-row"][class*="border-l-blue"]',
    );
    await expect(selectedRows.first()).toBeVisible({ timeout: 3_000 });

    const selectedCount = await selectedRows.count();
    expect(selectedCount).toBeGreaterThan(1);
  });

  test("modifier+C copies without error", async ({ page }) => {
    // Click a log row first to select it
    const firstRow = page.locator('[data-testid="log-row"]').first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });
    await firstRow.click();

    // Press copy shortcut
    await page.keyboard.press(`${modifier()}+c`);

    // Verify page is still responsive (no crash)
    await expect(page.getByText(/\d+ logs/)).toBeVisible();
  });
});
