import { test, expect, selectLogGroup } from "./fixtures/demo";

test.describe("Time Filtering + Live Tail", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("default 15m preset is active", async ({ page }) => {
    // The 15m button should have the active blue styling
    const button15m = page.getByRole("button", { name: "15m" });
    await expect(button15m).toBeVisible();
    await expect(button15m).toHaveClass(/bg-blue-600/);
  });

  test("clicking a different preset switches the active state", async ({
    page,
  }) => {
    const button15m = page.getByRole("button", { name: "15m" });
    const button1h = page.getByRole("button", { name: "1h" });

    await button1h.click();

    // 1h should now be active, 15m should not
    await expect(button1h).toHaveClass(/bg-blue-600/);
    await expect(button15m).not.toHaveClass(/bg-blue-600/);

    // Logs should still be loaded
    await expect(page.getByText(/\d+ logs/)).toBeVisible();
  });

  test("clicking Live starts live tail with streaming indicator", async ({
    page,
  }) => {
    const liveButton = page.getByRole("button", { name: "Live" });
    await liveButton.click();

    // Live button should have green active styling
    await expect(liveButton).toHaveClass(/bg-green-600/);

    // Transport indicator should show "Streaming" (demo uses stream transport)
    await expect(page.getByText("Streaming")).toBeVisible();
  });

  test("log count increases during live tail", async ({ page }) => {
    const liveButton = page.getByRole("button", { name: "Live" });
    await liveButton.click();
    await expect(page.getByText("Streaming")).toBeVisible();

    // Wait for at least one batch to arrive, then snapshot the count
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 5_000 });
    const initialText = await page
      .getByText(/\d+ logs/)
      .first()
      .textContent();
    const initialMatch = initialText?.match(/([\d,]+) logs/);
    const initialCount = parseInt(
      (initialMatch?.[1] ?? "0").replace(/,/g, ""),
      10,
    );

    // Wait for the count to increase (DemoTailTransport ticks every 1.5s)
    await expect
      .poll(
        async () => {
          const text = await page
            .getByText(/\d+ logs/)
            .first()
            .textContent();
          const match = text?.match(/([\d,]+) logs/);
          return parseInt((match?.[1] ?? "0").replace(/,/g, ""), 10);
        },
        { timeout: 10_000, intervals: [500] },
      )
      .toBeGreaterThan(initialCount);
  });

  test("clicking a preset during tail stops tailing", async ({ page }) => {
    const liveButton = page.getByRole("button", { name: "Live" });
    await liveButton.click();
    await expect(page.getByText("Streaming")).toBeVisible();

    // Click a preset to stop tailing
    const button1h = page.getByRole("button", { name: "1h" });
    await button1h.click();

    // Should show Static indicator and Live button should not be green
    await expect(page.getByText("Static")).toBeVisible();
    await expect(liveButton).not.toHaveClass(/bg-green-600/);
  });
});
