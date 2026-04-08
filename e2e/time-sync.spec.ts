import { test, expect, selectLogGroup, splitPane } from "./fixtures/demo";

test.describe("Time Sync", () => {
  test("time sync button toggles state", async ({ page }) => {
    await selectLogGroup(page);

    const syncButton = page.getByTitle(
      "Time sync disabled — each panel has independent time ranges",
    );
    await expect(syncButton).toBeVisible();

    await syncButton.click();

    // After click, the button title changes to "enabled"
    await expect(page.getByTitle(/Time sync enabled/)).toBeVisible();
  });

  test("title reflects enabled state", async ({ page }) => {
    await selectLogGroup(page);

    const syncButton = page.getByTitle(/[Tt]ime sync disabled/);
    await syncButton.click();

    // After toggling on, the title should indicate enabled
    await expect(page.getByTitle(/[Tt]ime sync enabled/)).toBeVisible();
  });

  test("toggling off restores independent mode", async ({ page }) => {
    await selectLogGroup(page);

    // Toggle on
    const syncButton = page.getByTitle(/[Tt]ime sync disabled/);
    await syncButton.click();
    await expect(page.getByTitle(/[Tt]ime sync enabled/)).toBeVisible();

    // Toggle off
    const enabledButton = page.getByTitle(/[Tt]ime sync enabled/);
    await enabledButton.click();

    // Should show disabled title and lose active styling
    const disabledButton = page.getByTitle(/[Tt]ime sync disabled/);
    await expect(disabledButton).toBeVisible();
    await expect(disabledButton).not.toHaveClass(/bg-blue-600/);
  });

  test("multi-panel time sync propagation", async ({ page }) => {
    await selectLogGroup(page);
    await splitPane(page, "right");

    // Select a different log group in the second panel
    const comboboxes = page.locator('[role="combobox"]');
    const secondCombobox = comboboxes.nth(1);
    await secondCombobox.click();
    await secondCombobox.fill("auth-handler");
    const option = page.getByRole("option", { name: /auth-handler/ });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // Wait for logs in second panel
    await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
      timeout: 10_000,
    });

    // Enable time sync
    const syncButton = page.getByTitle(/[Tt]ime sync disabled/);
    await syncButton.click();
    await expect(page.getByTitle(/[Tt]ime sync enabled/)).toBeVisible();

    // Click "1h" preset in the first panel
    const buttons1h = page.getByRole("button", { name: "1h" });
    await buttons1h.first().click();

    // Both panels should have 1h active (bg-blue-600)
    await expect(buttons1h.first()).toHaveClass(/bg-blue-600/);
    await expect(buttons1h.nth(1)).toHaveClass(/bg-blue-600/, {
      timeout: 5_000,
    });
  });

  test("time sync with empty second panel", async ({ page }) => {
    await selectLogGroup(page);
    await splitPane(page, "right");

    // Enable time sync (second panel has no log group selected)
    const syncButton = page.getByTitle(/[Tt]ime sync disabled/);
    await syncButton.click();

    // Click "1h" in first panel
    const buttons1h = page.getByRole("button", { name: "1h" });
    await buttons1h.first().click();

    // Page should still be responsive — first panel shows 1h active
    await expect(buttons1h.first()).toHaveClass(/bg-blue-600/);
    await expect(page.getByText(/\d+ logs/).first()).toBeVisible();
  });
});
