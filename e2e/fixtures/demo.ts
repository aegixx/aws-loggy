import { test as base, expect, type Page } from "@playwright/test";

/**
 * Custom Playwright fixture that navigates to demo mode and waits for the app to be ready.
 * Demo mode activates via ?demo=true query param, which sets isDemoMode=true in the Zustand
 * store before any invoke() calls execute — intercepting all Tauri IPC with mock data.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto("/?demo=true");

    // Wait for three signals that prove demo mode is fully initialized:
    // 1. DEMO badge in status bar (proves demo store is active)
    //    — StatusBar only renders when selectedLogGroup is set, but DEMO badge
    //      may not be visible until a log group is selected. Instead, check that
    //      the profile dropdown has "demo" value.
    // 2. Profile dropdown shows "demo" (proves invoke interception works)
    // 3. Combobox is enabled with correct placeholder (proves connection succeeded)
    await expect(page.locator("select")).toHaveValue("demo", {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("combobox", { name: "Log Group:" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("combobox", { name: "Log Group:" }),
    ).toHaveAttribute("placeholder", "Search log groups...");

    await use(page);
  },
});

export { expect };

/**
 * Helper to select a log group by name and wait for logs to load.
 * Uses fuzzy search to find the group, then clicks it and waits for
 * the status bar to show a log count.
 */
export async function selectLogGroup(
  page: Page,
  name = "payment-service",
): Promise<void> {
  const combobox = page.getByRole("combobox", { name: "Log Group:" });
  await combobox.click();
  await combobox.fill(name);

  // Wait for the dropdown option to appear and click it
  const option = page.getByRole("option", { name: new RegExp(name) });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();

  // Wait for logs to load — status bar shows "N logs" when done
  await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
}
