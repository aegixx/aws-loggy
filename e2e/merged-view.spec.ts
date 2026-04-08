import { test, expect, selectLogGroup, addTab } from "./fixtures/demo";

test.describe("Merged View", () => {
  /**
   * Sets up two tabs with different log groups loaded.
   */
  async function setupTwoTabs(page: import("@playwright/test").Page) {
    await selectLogGroup(page);
    await addTab(page);

    // The new tab is active — select a log group in it directly
    // Can't use selectLogGroup() because getByRole resolves to 2 comboboxes
    const combobox = page.locator('[role="combobox"]').last();
    await combobox.click();
    await combobox.fill("auth-handler");
    const option = page.getByRole("option", { name: /auth-handler/ });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();
    await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
      timeout: 10_000,
    });
  }

  test("merge toggle appears with 2+ tabs", async ({ page }) => {
    await setupTwoTabs(page);

    const mergeButton = page.getByTitle("Merge tabs chronologically");
    await expect(mergeButton).toBeVisible();
  });

  test("clicking merge activates merged mode", async ({ page }) => {
    await setupTwoTabs(page);

    const mergeButton = page.getByTitle("Merge tabs chronologically");
    await mergeButton.click();

    // Button should switch to active styling
    await expect(page.getByTitle("Unmerge tabs")).toBeVisible();
    await expect(page.getByTitle("Unmerge tabs")).toHaveClass(/bg-blue-600/);
  });

  test("merged mode shows merged log group display", async ({ page }) => {
    await setupTwoTabs(page);

    const mergeButton = page.getByTitle("Merge tabs chronologically");
    await mergeButton.click();

    // In merged mode, payment-service should be visible (first tab's group)
    await expect(page.getByText(/payment-service/).first()).toBeVisible({
      timeout: 5_000,
    });
    // Logs should still be loaded
    await expect(page.getByText(/\d+ logs/).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("unmerge returns to normal tab mode", async ({ page }) => {
    await setupTwoTabs(page);

    // Merge
    const mergeButton = page.getByTitle("Merge tabs chronologically");
    await mergeButton.click();
    await expect(page.getByTitle("Unmerge tabs")).toBeVisible();

    // Unmerge
    await page.getByTitle("Unmerge tabs").click();

    // Should return to normal mode with the merge button showing inactive title
    const normalMergeButton = page.getByTitle("Merge tabs chronologically");
    await expect(normalMergeButton).toBeVisible();
    await expect(normalMergeButton).not.toHaveClass(/bg-blue-600/);
  });
});
