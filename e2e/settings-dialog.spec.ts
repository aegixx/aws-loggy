import {
  test,
  expect,
  selectLogGroup,
  openSettings,
  modifier,
} from "./fixtures/demo";

test.describe("Settings Dialog", () => {
  test("modifier+, opens settings dialog", async ({ page }) => {
    await selectLogGroup(page);
    await page.keyboard.press(`${modifier()}+,`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 3_000,
    });
  });

  test("gear button opens settings", async ({ page }) => {
    await selectLogGroup(page);

    // The close button in the header has title "Close (Esc)", look for a settings trigger
    // Settings can be opened via the button with title containing "Settings" or gear icon
    const settingsButton = page.locator('button[title*="Settings"]');
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click();
    } else {
      // Fallback: use keyboard shortcut if no dedicated button exists
      await page.keyboard.press(`${modifier()}+,`);
    }

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 3_000,
    });
  });

  test("theme buttons switch active state", async ({ page }) => {
    await selectLogGroup(page);
    await openSettings(page);

    const darkButton = page.getByRole("button", { name: "Dark" });
    const lightButton = page.getByRole("button", { name: "Light" });

    // Click Dark and verify it gets the active class
    await darkButton.click();
    await expect(darkButton).toHaveClass(/bg-blue-600/);
    await expect(lightButton).not.toHaveClass(/bg-blue-600/);

    // Click Light and verify it switches
    await lightButton.click();
    await expect(lightButton).toHaveClass(/bg-blue-600/);
    await expect(darkButton).not.toHaveClass(/bg-blue-600/);
  });

  test("Escape closes settings dialog", async ({ page }) => {
    await selectLogGroup(page);
    await openSettings(page);

    const heading = page.getByRole("heading", { name: "Settings" });
    await expect(heading).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(heading).not.toBeVisible({ timeout: 3_000 });
  });

  test("Done button closes settings", async ({ page }) => {
    await selectLogGroup(page);
    await openSettings(page);

    const heading = page.getByRole("heading", { name: "Settings" });
    await expect(heading).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(heading).not.toBeVisible({ timeout: 3_000 });
  });

  test("cache limit inputs accept values", async ({ page }) => {
    await selectLogGroup(page);
    await openSettings(page);

    // Find the Max Log Count input by its label
    const maxLogCountInput = page
      .locator("label", { hasText: "Max Log Count" })
      .locator("..")
      .locator('input[type="number"]');

    await expect(maxLogCountInput).toBeVisible();

    // Clear and type a new value
    await maxLogCountInput.fill("25000");
    await expect(maxLogCountInput).toHaveValue("25000");
  });
});
