import {
  test,
  expect,
  selectLogGroup,
  addTab,
  splitPane,
  modifier,
} from "./fixtures/demo";

test.describe("Editor Groups", () => {
  test("initial state shows single tab", async ({ page }) => {
    await selectLogGroup(page);

    // The tab should show the short name from the log group
    await expect(page.getByText("payment-service").first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("add tab button creates new tab", async ({ page }) => {
    await selectLogGroup(page);
    await addTab(page);

    await expect(page.getByText("New Tab")).toBeVisible({ timeout: 3_000 });
  });

  test("clicking a tab switches active panel", async ({ page }) => {
    await selectLogGroup(page);
    await addTab(page);

    // Click the first tab (payment-service) to switch back to it
    const firstTab = page.getByText("payment-service").first();
    await firstTab.click();

    // The first tab should have active styling (blue top border)
    const tabElement = firstTab.locator(
      "xpath=ancestor::div[contains(@class, 'border-t-')]",
    );
    await expect(tabElement).toHaveClass(/border-t-blue/, { timeout: 3_000 });
  });

  test("close tab button removes tab", async ({ page }) => {
    await selectLogGroup(page);
    await addTab(page);

    // Find the close button on the "New Tab" tab
    const newTab = page.getByText("New Tab");
    await expect(newTab).toBeVisible({ timeout: 3_000 });

    // The close button is a sibling within the same tab container
    const closeButton = newTab
      .locator("xpath=ancestor::div[contains(@class, 'border-t-')]")
      .getByTitle("Close tab");
    await closeButton.click();

    // "New Tab" should no longer be visible
    await expect(page.getByText("New Tab")).not.toBeVisible({ timeout: 3_000 });
  });

  test("split right creates two panes", async ({ page }) => {
    await selectLogGroup(page);
    await splitPane(page, "right");

    // Two comboboxes means two editor groups
    await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
      timeout: 3_000,
    });
  });

  test("split down creates vertical split", async ({ page }) => {
    await selectLogGroup(page);
    await splitPane(page, "down");

    // Two comboboxes means two editor groups
    await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
      timeout: 3_000,
    });
  });

  test("closing last tab in split collapses pane", async ({ page }) => {
    await selectLogGroup(page);
    await splitPane(page, "right");

    // There should be two comboboxes now
    await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
      timeout: 3_000,
    });

    // The new pane has a "New Tab" — close it
    const closeButton = page.getByTitle("Close tab").last();
    await closeButton.click();

    // Should collapse back to a single pane
    await expect(page.locator('[role="combobox"]')).toHaveCount(1, {
      timeout: 3_000,
    });
  });

  test("modifier+backslash triggers horizontal split", async ({ page }) => {
    await selectLogGroup(page);

    await page.keyboard.press(`${modifier()}+\\`);

    await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
      timeout: 3_000,
    });
  });

  test("modifier+1 and modifier+2 switch tabs", async ({ page }) => {
    await selectLogGroup(page);
    await addTab(page);

    // Switch to first tab via modifier+1
    await page.keyboard.press(`${modifier()}+1`);

    // The first tab (payment-service) should be active
    const firstTab = page.getByText("payment-service").first();
    const firstTabContainer = firstTab.locator(
      "xpath=ancestor::div[contains(@class, 'border-t-')]",
    );
    await expect(firstTabContainer).toHaveClass(/border-t-blue/, {
      timeout: 3_000,
    });

    // Switch to second tab via modifier+2
    await page.keyboard.press(`${modifier()}+2`);

    // The second tab (New Tab) should be active
    const secondTab = page.getByText("New Tab").first();
    const secondTabContainer = secondTab.locator(
      "xpath=ancestor::div[contains(@class, 'border-t-')]",
    );
    await expect(secondTabContainer).toHaveClass(/border-t-blue/, {
      timeout: 3_000,
    });
  });
});
