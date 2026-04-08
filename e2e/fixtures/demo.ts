import { test as base, expect, type Page } from "@playwright/test";

/**
 * Returns the platform-appropriate modifier key.
 * macOS uses Meta (Cmd), Linux/Windows use Control.
 */
export function modifier(): "Meta" | "Control" {
  return process.platform === "darwin" ? "Meta" : "Control";
}

/**
 * Custom Playwright fixture that navigates to demo mode and waits for the app to be ready.
 * Demo mode activates via ?demo=true query param, which sets isDemoMode=true in the Zustand
 * store before any invoke() calls execute — intercepting all Tauri IPC with mock data.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Clear localStorage to prevent zustand/persist state leakage between tests
    await page.addInitScript(() => localStorage.clear());

    await page.goto("/?demo=true");

    // Wait for three signals that prove demo mode is fully initialized:
    // 1. Profile dropdown shows "demo" (proves invoke interception works)
    // 2. Combobox is enabled (proves connection succeeded)
    // 3. Combobox has correct placeholder
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

/** Open the find bar via keyboard shortcut and wait for it to be visible. */
export async function openFindBar(page: Page): Promise<void> {
  await page.keyboard.press(`${modifier()}+f`);
  await expect(page.getByPlaceholder("Find")).toBeVisible({ timeout: 3_000 });
}

/** Add a new tab in the active editor group. */
export async function addTab(page: Page): Promise<void> {
  await page.getByTitle("New tab in this group").click();
  await expect(page.getByText("New Tab")).toBeVisible({ timeout: 3_000 });
}

/** Split the active editor group in the given direction. */
export async function splitPane(
  page: Page,
  direction: "right" | "down",
): Promise<void> {
  const title = direction === "right" ? "Split right" : "Split down";
  await page.getByTitle(title).click();
  // Wait for a second editor group (two combobox inputs means two groups)
  await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
    timeout: 5_000,
  });
}

/** Open the settings dialog via keyboard shortcut. */
export async function openSettings(page: Page): Promise<void> {
  await page.keyboard.press(`${modifier()}+,`);
  await expect(page.getByText("Settings").first()).toBeVisible({
    timeout: 3_000,
  });
}

/** Right-click the first visible log row to open the context menu. */
export async function openContextMenu(page: Page): Promise<void> {
  const row = page.locator('[data-testid="log-row"]').first();
  await row.click({ button: "right" });
  await expect(page.locator('[data-testid="ctx-copy"]')).toBeVisible({
    timeout: 3_000,
  });
}

/** Start live tail and wait for the streaming indicator. */
export async function startLiveTail(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.getByText("Streaming")).toBeVisible({ timeout: 5_000 });
}
