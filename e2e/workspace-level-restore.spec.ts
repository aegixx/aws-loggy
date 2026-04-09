import { test, expect, selectLogGroup, splitPane } from "./fixtures/demo";

test.describe("Workspace level restore", () => {
  test("loading saved workspace restores different disabled levels per panel", async ({
    page,
  }) => {
    // Set up two panels with different disabled levels
    await selectLogGroup(page, "payment-service");
    await splitPane(page, "right");

    const secondCombobox = page.locator('[role="combobox"]').nth(1);
    await secondCombobox.click();
    await secondCombobox.fill("auth-handler");
    const option = page.getByRole("option", { name: /auth-handler/ });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();
    await expect(page.getByText(/\d+ logs/).last()).toBeVisible({
      timeout: 10_000,
    });

    // Panel 1: disable TRACE
    await page.getByRole("button", { name: "TRACE" }).nth(0).click();
    await expect(page.getByRole("button", { name: "TRACE" }).nth(0)).toHaveCSS(
      "text-decoration-line",
      "line-through",
      { timeout: 2_000 },
    );

    // Panel 2: disable WARNING
    await page.getByRole("button", { name: "WARNING" }).nth(1).click();
    await expect(
      page.getByRole("button", { name: "WARNING" }).nth(1),
    ).toHaveCSS("text-decoration-line", "line-through", { timeout: 2_000 });

    // Save workspace
    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();
    await page.getByText("Save current workspace").click();
    const nameInput = page.getByPlaceholder("Workspace name...");
    await expect(nameInput).toBeVisible({ timeout: 3_000 });
    await nameInput.fill("level-test");
    await nameInput.press("Enter");
    await expect(page.getByText("level-test")).toBeVisible();

    // Re-enable the disabled levels to prove the load actually restores them
    await page.getByRole("button", { name: "TRACE" }).nth(0).click();
    await expect(
      page.getByRole("button", { name: "TRACE" }).nth(0),
    ).not.toHaveCSS("text-decoration-line", "line-through", {
      timeout: 2_000,
    });
    await page.getByRole("button", { name: "WARNING" }).nth(1).click();
    await expect(
      page.getByRole("button", { name: "WARNING" }).nth(1),
    ).not.toHaveCSS("text-decoration-line", "line-through", {
      timeout: 2_000,
    });

    // Load the saved workspace
    await wsButton.click();
    await page.getByText("level-test").click();

    // Wait for panels to restore
    await expect(page.locator('[role="combobox"]')).toHaveCount(2, {
      timeout: 5_000,
    });
    await expect(page.getByText(/\d+ logs/).first()).toBeVisible({
      timeout: 10_000,
    });

    // Panel 1: TRACE should be disabled again
    await expect(page.getByRole("button", { name: "TRACE" }).nth(0)).toHaveCSS(
      "text-decoration-line",
      "line-through",
      { timeout: 5_000 },
    );

    // Panel 1: WARNING should be enabled
    await expect(
      page.getByRole("button", { name: "WARNING" }).nth(0),
    ).not.toHaveCSS("text-decoration-line", "line-through");

    // Panel 2: WARNING should be disabled
    await expect(
      page.getByRole("button", { name: "WARNING" }).nth(1),
    ).toHaveCSS("text-decoration-line", "line-through", { timeout: 5_000 });

    // Panel 2: TRACE should be enabled
    await expect(
      page.getByRole("button", { name: "TRACE" }).nth(1),
    ).not.toHaveCSS("text-decoration-line", "line-through");
  });
});
