import {
  test,
  expect,
  selectLogGroup,
  openFindBar,
  modifier,
} from "./fixtures/demo";

/** Locate the find bar match counter (e.g., "1 of 22" or "No results") */
function matchCounter(page: import("@playwright/test").Page) {
  // The counter is the span with min-w-[60px] inside the find bar,
  // distinct from the status bar "Showing X of Y logs" text
  return page.locator("span.min-w-\\[60px\\]");
}

test.describe("Find Bar", () => {
  test.beforeEach(async ({ page }) => {
    await selectLogGroup(page);
    await openFindBar(page);
  });

  test("modifier+F opens find bar", async ({ page }) => {
    await expect(page.getByPlaceholder("Find")).toBeVisible();
  });

  test("Escape closes find bar", async ({ page }) => {
    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder("Find")).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("typing search term shows match count", async ({ page }) => {
    const findInput = page.getByPlaceholder("Find");
    await findInput.fill("payment");

    await expect(matchCounter(page)).toHaveText(/^\d+ of \d+$/, {
      timeout: 5_000,
    });
  });

  test("unmatched term shows No results", async ({ page }) => {
    const findInput = page.getByPlaceholder("Find");
    await findInput.fill("zzzznonexistent");

    await expect(matchCounter(page)).toHaveText("No results", {
      timeout: 5_000,
    });
  });

  test("Enter navigates to next match", async ({ page }) => {
    const findInput = page.getByPlaceholder("Find");
    await findInput.fill("payment");

    const counter = matchCounter(page);
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 5_000 });

    const initialText = await counter.textContent();

    await page.keyboard.press("Enter");

    await expect(counter).not.toHaveText(initialText ?? "", {
      timeout: 3_000,
    });
  });

  test("Shift+Enter navigates to previous match", async ({ page }) => {
    const findInput = page.getByPlaceholder("Find");
    await findInput.fill("payment");

    const counter = matchCounter(page);
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 5_000 });

    // Navigate forward twice
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    const afterForwardText = await counter.textContent();

    // Navigate backward
    await page.keyboard.press("Shift+Enter");

    await expect(counter).not.toHaveText(afterForwardText ?? "", {
      timeout: 3_000,
    });
  });

  test("case sensitive toggle changes results", async ({ page }) => {
    const findInput = page.getByPlaceholder("Find");

    await findInput.fill("Payment");
    const counter = matchCounter(page);
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 5_000 });

    const initialText = await counter.textContent();

    const caseButton = page.getByRole("button", { name: "Match Case" });
    await caseButton.click();

    // Count should change after toggling case sensitivity
    await expect(counter).not.toHaveText(initialText ?? "", {
      timeout: 5_000,
    });
  });

  test("regex toggle enables regex", async ({ page }) => {
    const regexButton = page.getByRole("button", {
      name: "Use Regular Expression",
    });
    await regexButton.click();

    const findInput = page.getByPlaceholder("Find");
    // Use a regex that matches common log content patterns
    await findInput.fill("pay\\w+");

    await expect(matchCounter(page)).toHaveText(/^\d+ of \d+$/, {
      timeout: 5_000,
    });
  });
});
