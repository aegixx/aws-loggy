import { test, expect } from "./fixtures/demo";

test.describe("Environment / Profile Selection", () => {
  test("shows 'demo' as the only profile option", async ({ page }) => {
    const select = page.locator("select");
    await expect(select).toHaveValue("demo");

    const options = select.locator("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText("demo");
  });

  test("shows green connection indicator", async ({ page }) => {
    // Green dot = connected (bg-green-400 rounded-full, not animating)
    const greenDot = page.locator("span.bg-green-400.rounded-full").first();
    await expect(greenDot).toBeVisible();
  });

  test("displays us-east-1 region", async ({ page }) => {
    await expect(page.getByText("(us-east-1)")).toBeVisible();
  });
});
