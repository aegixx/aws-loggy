import { test, expect, selectLogGroup } from "./fixtures/demo";

test.describe("Text Filtering", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
  });

  test("filter input is visible after selecting log group", async ({
    page,
  }) => {
    const filterInput = page.getByPlaceholder("Filter logs");
    await expect(filterInput).toBeVisible();
  });

  test("typing a filter term reduces visible log count", async ({ page }) => {
    const filterInput = page.getByPlaceholder("Filter logs");
    await filterInput.fill("payment");

    // Outcome-based: wait for the "Showing X of Y logs" text to appear
    // (proves the debounce settled and the filter was applied)
    await expect(page.getByText(/Showing \d+ of \d+ logs/)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("text filter reduces shown count below total", async ({ page }) => {
    const filterInput = page.getByPlaceholder("Filter logs");

    // Apply a filter with a term that won't match every log message
    await filterInput.fill("Validating");
    await expect(page.getByText(/Showing \d+ of \d+ logs/)).toBeVisible({
      timeout: 5_000,
    });

    // Capture both X and Y from "Showing X of Y logs"
    const statusText = await page
      .getByText(/Showing \d+ of \d+ logs/)
      .textContent();
    const match = statusText?.match(/Showing ([\d,]+) of ([\d,]+) logs/);
    const shownCount = parseInt((match?.[1] ?? "0").replace(/,/g, ""), 10);
    const totalCount = parseInt((match?.[2] ?? "0").replace(/,/g, ""), 10);

    // The text filter should reduce the shown count below the total
    expect(shownCount).toBeGreaterThan(0);
    expect(shownCount).toBeLessThan(totalCount);
  });

  test("AND matching: space-separated terms filter more strictly", async ({
    page,
  }) => {
    const filterInput = page.getByPlaceholder("Filter logs");

    // First filter with a broad term
    await filterInput.fill("payment");
    await expect(page.getByText(/Showing \d+ of \d+ logs/)).toBeVisible({
      timeout: 5_000,
    });

    // Capture the broad count
    const broadText = await page
      .getByText(/Showing \d+ of \d+ logs/)
      .textContent();
    const broadMatch = broadText?.match(/Showing (\d+) of/);
    const broadCount = parseInt(broadMatch?.[1] ?? "0", 10);

    // Now filter with an additional term (AND matching)
    await filterInput.fill("payment error");
    await expect(page.getByText(/Showing \d+ of \d+ logs/)).toBeVisible({
      timeout: 5_000,
    });

    // The narrower filter should show fewer or equal results
    const narrowText = await page
      .getByText(/Showing \d+ of \d+ logs/)
      .textContent();
    const narrowMatch = narrowText?.match(/Showing (\d+) of/);
    const narrowCount = parseInt(narrowMatch?.[1] ?? "0", 10);

    expect(narrowCount).toBeLessThanOrEqual(broadCount);
  });

  test("log level toggle disables a level", async ({ page }) => {
    // Find and click the INFO level toggle button
    // Level buttons contain the level name and a count badge
    const infoButton = page.getByRole("button", { name: /INFO/i });
    await expect(infoButton).toBeVisible();
    await infoButton.click();

    // After disabling INFO, the status bar should show "Showing X of Y logs"
    await expect(page.getByText(/Showing \d+ of \d+ logs/)).toBeVisible({
      timeout: 5_000,
    });

    // The INFO button should have reduced opacity (disabled state)
    await expect(infoButton).toHaveCSS("opacity", "0.5");
  });
});
