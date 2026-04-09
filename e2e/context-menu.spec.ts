import {
  test,
  expect,
  selectLogGroup,
  openContextMenu,
  startLiveTail,
} from "./fixtures/demo";

test.describe("Context Menu", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("right-click shows context menu", async ({ page }) => {
    await openContextMenu(page);

    await expect(page.locator('[data-testid="ctx-copy"]')).toBeVisible();
    await expect(page.locator('[data-testid="ctx-filter-by"]')).toBeVisible();
    await expect(page.locator('[data-testid="ctx-refresh"]')).toBeVisible();
    await expect(page.locator('[data-testid="ctx-clear"]')).toBeVisible();
  });

  test("Copy item is present", async ({ page }) => {
    await openContextMenu(page);

    await expect(page.locator('[data-testid="ctx-copy"]')).toContainText(
      "Copy",
    );
  });

  test("Refresh closes menu and reloads", async ({ page }) => {
    await openContextMenu(page);

    await page.locator('[data-testid="ctx-refresh"]').click();

    // Menu should be closed
    await expect(page.locator('[data-testid="ctx-copy"]')).not.toBeVisible();

    // Logs should still be visible after refresh
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });

  test("Clear is disabled when not tailing", async ({ page }) => {
    await openContextMenu(page);

    const clearItem = page.locator('[data-testid="ctx-clear"]');

    // Clear should be visually disabled (cursor-not-allowed or reduced opacity)
    const classes = await clearItem.getAttribute("class");
    const opacity = await clearItem.evaluate(
      (el) => getComputedStyle(el).opacity,
    );

    const isDisabled =
      (classes?.includes("cursor-not-allowed") ?? false) ||
      parseFloat(opacity ?? "1") < 1;
    expect(isDisabled).toBe(true);
  });

  test("Filter by submenu appears on hover", async ({ page }) => {
    await openContextMenu(page);

    const filterByItem = page.locator('[data-testid="ctx-filter-by"]');
    await filterByItem.hover();

    // Submenu is a child div with absolute positioning inside the filter-by item
    // Look for submenu items: Selection, Request ID, etc.
    await expect(page.getByText("Selection")).toBeVisible({ timeout: 2_000 });
  });

  test("Correlate by submenu appears on hover", async ({ page }) => {
    await openContextMenu(page);

    const correlateItem = page.locator('[data-testid="ctx-correlate-by"]');
    await correlateItem.hover();

    // Look for correlate submenu items
    // The correlate submenu has Request ID, Trace ID, Client IP options
    await expect(correlateItem.locator("div >> text=Request ID")).toBeVisible({
      timeout: 2_000,
    });
  });

  test("Escape closes context menu", async ({ page }) => {
    await openContextMenu(page);

    await page.keyboard.press("Escape");

    await expect(page.locator('[data-testid="ctx-copy"]')).not.toBeVisible();
  });
});
