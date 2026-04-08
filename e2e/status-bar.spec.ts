import { test, expect, selectLogGroup, startLiveTail } from "./fixtures/demo";

test.describe("Status Bar", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("shows log count", async ({ page }) => {
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });

  test("shows DEMO badge", async ({ page }) => {
    await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  });

  test("shows cache count progress bar", async ({ page }) => {
    await expect(page.getByText("Count")).toBeVisible({ timeout: 5_000 });
  });

  test("shows cache size progress bar", async ({ page }) => {
    await expect(page.getByText("Size")).toBeVisible({ timeout: 5_000 });
  });

  test("shows follow mode indicator during live tail", async ({ page }) => {
    await startLiveTail(page);

    // During live tail, follow mode should be active (filled circle or "Follow" text)
    await expect(page.getByText(/Follow/)).toBeVisible({ timeout: 5_000 });
  });
});
