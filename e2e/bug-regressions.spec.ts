import { test as base, expect } from "@playwright/test";
import {
  test,
  selectLogGroup,
  splitPane,
  addTab,
  modifier,
} from "./fixtures/demo";

test.describe("Bug Regressions", () => {
  test.describe("Bug #2: Layout persists across reload", () => {
    // Use the raw base test (no demo fixture) so localStorage isn't cleared on reload
    base("split layout survives page reload", async ({ page }) => {
      // First visit: set up demo mode manually (no addInitScript clear)
      await page.goto("/?demo=true");
      await base.expect(page.locator("select")).toHaveValue("demo", {
        timeout: 10_000,
      });
      await base
        .expect(page.getByRole("combobox", { name: "Log Group:" }))
        .toBeEnabled();

      // Select a log group and split
      await selectLogGroup(page);
      await splitPane(page, "right");
      await base.expect(page.locator('[role="combobox"]')).toHaveCount(2);

      // Reload WITHOUT clearing localStorage
      await page.goto("/?demo=true");
      await base
        .expect(page.locator("select").first())
        .toHaveValue("demo", { timeout: 10_000 });

      // The split layout should survive — 2 comboboxes
      await base
        .expect(page.locator('[role="combobox"]'))
        .toHaveCount(2, { timeout: 5_000 });
    });
  });

  test.describe("Bug #3: Time sync propagates to all panels", () => {
    test("changing preset in one panel updates the other", async ({ page }) => {
      await selectLogGroup(page);
      await splitPane(page, "right");

      // Select log group in second panel
      const secondCombobox = page.locator('[role="combobox"]').nth(1);
      await secondCombobox.click();
      await secondCombobox.fill("auth-handler");
      const option = page.getByRole("option", { name: /auth-handler/ });
      await expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();
      await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
        timeout: 10_000,
      });

      // Enable time sync
      const syncButton = page.getByTitle(/Time sync disabled/);
      await syncButton.click();
      await expect(page.getByTitle(/Time sync enabled/)).toBeVisible();

      // Both panels should start on 15m (default)
      const buttons15m = page.getByRole("button", { name: "15m" });
      await expect(buttons15m.first()).toHaveClass(/bg-blue-600/);

      // Click "1h" in the first panel
      const buttons1h = page.getByRole("button", { name: "1h" });
      await buttons1h.first().click();

      // First panel: 1h should be active
      await expect(buttons1h.first()).toHaveClass(/bg-blue-600/);

      // Second panel: 1h should ALSO be active (this was the bug)
      await expect(buttons1h.nth(1)).toHaveClass(/bg-blue-600/, {
        timeout: 5_000,
      });

      // And 15m should no longer be active in either panel
      await expect(buttons15m.first()).not.toHaveClass(/bg-blue-600/);
      await expect(buttons15m.nth(1)).not.toHaveClass(/bg-blue-600/);
    });
  });

  test.describe("Bug #4: Drag tab to split pane", () => {
    test("dragging a tab to the edge of a pane creates a split", async ({
      page,
    }) => {
      await selectLogGroup(page);
      await addTab(page);

      // Select auth-handler in the new (active) tab
      const combobox = page.locator('[role="combobox"]').last();
      await combobox.click();
      await combobox.fill("auth-handler");
      const option = page.getByRole("option", { name: /auth-handler/ });
      await expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();
      // Wait for logs in the active tab
      await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
        timeout: 10_000,
      });

      // Find the auth-handler tab text to drag
      const authTab = page.getByText("auth-handler").first();
      await expect(authTab).toBeVisible();

      // Get the content area (the log viewer container with tabIndex=0)
      const contentArea = page
        .locator('[data-testid="log-row"]')
        .first()
        .locator("xpath=ancestor::div[@tabindex='0']");
      const box = await contentArea.boundingBox();

      if (box) {
        // Drag the tab to the right edge (outer 10% = well within the 25% threshold)
        await authTab.dragTo(contentArea, {
          targetPosition: {
            x: Math.round(box.width * 0.92),
            y: Math.round(box.height / 2),
          },
        });

        // If drag-to-split worked, we should have 2 editor groups (2 comboboxes)
        await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
          timeout: 3_000,
        });
      }
    });
  });

  test.describe("Bug #5: Dropdown flicker with two empty panels", () => {
    test("selecting a log group in one panel does not affect the other", async ({
      page,
    }) => {
      // Start with one empty panel, then split to get two empty panels
      await splitPane(page, "right");

      // Select a log group in the first panel's dropdown
      const firstCombobox = page.locator('[role="combobox"]').first();
      await firstCombobox.click();
      await firstCombobox.fill("payment");
      const option = page.getByRole("option", { name: /payment-service/ });
      await expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();

      // Dropdown should close after selection
      await expect(page.getByRole("listbox")).not.toBeVisible({
        timeout: 3_000,
      });

      // Logs should load in the first panel
      await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
    });

    test("dropdown stays closed after selection with two panels", async ({
      page,
    }) => {
      await splitPane(page, "right");

      // Select in first panel
      const firstCombobox = page.locator('[role="combobox"]').first();
      await firstCombobox.click();
      await firstCombobox.fill("payment");
      const option = page.getByRole("option", { name: /payment-service/ });
      await expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();

      // Wait a moment for any flicker cycle to start
      await page.waitForTimeout(500);

      // The dropdown should remain closed (no flicker re-opening)
      await expect(page.getByRole("listbox")).not.toBeVisible();

      // The selected value should be stable in the input
      await expect(firstCombobox).toHaveValue(/payment-service/);
    });
  });

  test.describe("Bug #6: Drag to bottom edge for vertical split", () => {
    // NOTE: Playwright's synthetic drag events don't reliably trigger dragover
    // at precise positions, so edge detection (which reads clientX/clientY
    // during dragover) cannot be exercised via automation. This test documents
    // the expected behavior. The fix was verified via manual UI testing.
    // The store-level fix (movePanelToSplitAtTarget) is covered by unit tests.
    test.fixme("dragging a tab to the bottom of another pane creates a vertical split", async ({
      page,
    }) => {
      await selectLogGroup(page);
      await splitPane(page, "right");

      // Select a different log group in the second pane
      const secondCombobox = page.locator('[role="combobox"]').nth(1);
      await secondCombobox.click();
      await secondCombobox.fill("auth-handler");
      const option = page.getByRole("option", { name: /auth-handler/ });
      await expect(option).toBeVisible({ timeout: 5_000 });
      await option.click();
      await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
        timeout: 10_000,
      });

      // Find the auth-handler tab to drag
      const authTab = page.getByText("auth-handler").first();
      await expect(authTab).toBeVisible();
      const tabBox = await authTab.boundingBox();

      // Get the first pane's content area to drop onto its bottom edge
      const contentArea = page
        .locator('[data-testid="log-row"]')
        .first()
        .locator("xpath=ancestor::div[@tabindex='0']");
      const targetBox = await contentArea.boundingBox();

      if (tabBox && targetBox) {
        const srcX = tabBox.x + tabBox.width / 2;
        const srcY = tabBox.y + tabBox.height / 2;
        // Bottom edge target (within outer 25% threshold)
        const dstX = targetBox.x + targetBox.width / 2;
        const dstY = targetBox.y + targetBox.height * 0.92;

        // Use manual drag with steps to generate dragover events at target
        await page.mouse.move(srcX, srcY);
        await page.mouse.down();
        // Move in steps so dragover fires at the destination
        await page.mouse.move(dstX, dstY, { steps: 10 });
        await page.mouse.up();

        // Should now have 3 comboboxes (original 2 panes + 1 new from vertical split)
        await expect(page.locator('[role="combobox"]')).toHaveCount(3, {
          timeout: 3_000,
        });
      }
    });
  });
});
