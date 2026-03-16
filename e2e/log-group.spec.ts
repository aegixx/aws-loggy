import { test, expect } from "./fixtures/demo";

test.describe("Log Group Selection", () => {
  test("combobox shows search placeholder", async ({ page }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await expect(combobox).toHaveAttribute(
      "placeholder",
      "Search log groups...",
    );
  });

  test("clicking combobox opens dropdown with 4 demo log groups", async ({
    page,
  }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await combobox.click();

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();

    // Scope options to the listbox (not the profile <select>)
    const options = listbox.getByRole("option");
    await expect(options).toHaveCount(4);

    // Verify all 4 mock Lambda groups are present
    await expect(
      page.getByRole("option", { name: /payment-service/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /auth-handler/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /order-processor/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /notification-sender/ }),
    ).toBeVisible();
  });

  test("fuzzy search filters log groups", async ({ page }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await combobox.click();
    await combobox.fill("pay");

    // Only payment-service should be visible
    await expect(
      page.getByRole("option", { name: /payment-service/ }),
    ).toBeVisible();

    // Others should not be visible
    await expect(
      page.getByRole("option", { name: /auth-handler/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("option", { name: /order-processor/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("option", { name: /notification-sender/ }),
    ).not.toBeVisible();
  });

  test("keyboard navigation selects a log group", async ({ page }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await combobox.click();

    // Wait for listbox to be open
    await expect(page.getByRole("listbox")).toBeVisible();

    // Navigate down and press Enter to select
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // After selection, logs should load (proves a group was selected)
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });

  test("Escape closes dropdown without selecting", async ({ page }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await combobox.click();

    await expect(page.getByRole("listbox")).toBeVisible();

    // Press Escape on the combobox input (must be focused)
    await combobox.press("Escape");

    await expect(page.getByRole("listbox")).not.toBeVisible();

    // No log group selected — status bar should not render (no "N logs" text)
    await expect(page.getByText(/\d+ logs/)).not.toBeVisible();
  });

  test("selecting a log group loads logs", async ({ page }) => {
    const combobox = page.getByRole("combobox", { name: "Log Group:" });
    await combobox.click();
    await combobox.fill("payment");

    const option = page.getByRole("option", { name: /payment-service/ });
    await expect(option).toBeVisible();
    await option.click();

    // Wait for logs to load — status bar shows count
    await expect(page.getByText(/\d+ logs/)).toBeVisible({ timeout: 10_000 });
  });
});
