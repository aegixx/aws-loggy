import { test, expect, selectLogGroup } from "./fixtures/demo";

test.describe("Workspace Menu", () => {
  test("workspace button opens menu", async ({ page }) => {
    await selectLogGroup(page);

    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();

    await expect(page.getByText("Save current workspace")).toBeVisible({
      timeout: 3_000,
    });
  });

  test("empty state shows no saved workspaces", async ({ page }) => {
    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();

    await expect(page.getByText("No saved workspaces")).toBeVisible();
  });

  test("save workspace flow", async ({ page }) => {
    await selectLogGroup(page);

    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();

    await page.getByText("Save current workspace").click();

    const nameInput = page.getByPlaceholder("Workspace name...");
    await expect(nameInput).toBeVisible({ timeout: 3_000 });
    await nameInput.fill("My Workspace");
    await nameInput.press("Enter");

    await expect(page.getByText("My Workspace")).toBeVisible();
  });

  test("load saved workspace", async ({ page }) => {
    await selectLogGroup(page);

    // Save a workspace first
    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();
    await page.getByText("Save current workspace").click();
    const nameInput = page.getByPlaceholder("Workspace name...");
    await nameInput.fill("My Workspace");
    await nameInput.press("Enter");
    await expect(page.getByText("My Workspace")).toBeVisible();

    // Close menu by pressing Escape
    await page.keyboard.press("Escape");
    await expect(page.getByText("No saved workspaces")).not.toBeVisible();

    // Reopen menu and click the saved workspace to load it
    await wsButton.click();
    await expect(page.getByText("My Workspace")).toBeVisible();
    await page.getByText("My Workspace").click();

    // Menu should close after loading
    await expect(page.getByText("Save current workspace")).not.toBeVisible();
  });

  test("rename saved workspace", async ({ page }) => {
    await selectLogGroup(page);

    // Save a workspace
    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();
    await page.getByText("Save current workspace").click();
    const nameInput = page.getByPlaceholder("Workspace name...");
    await nameInput.fill("My Workspace");
    await nameInput.press("Enter");
    await expect(page.getByText("My Workspace")).toBeVisible();

    // Click rename button
    const renameButton = page.getByTitle("Rename", { exact: true });
    await renameButton.click();

    // The rename input replaces the name text, auto-focused by ref
    // It's a controlled input inside the workspace menu with the current name
    const renameInput = page.locator('input.flex-1[type="text"]');
    await expect(renameInput).toBeVisible({ timeout: 2_000 });
    await renameInput.fill("Renamed WS");
    await renameInput.press("Enter");

    await expect(page.getByText("Renamed WS")).toBeVisible({ timeout: 3_000 });
  });

  test("delete saved workspace", async ({ page }) => {
    await selectLogGroup(page);

    // Save a workspace
    const wsButton = page.getByTitle(
      "Workspace menu — save, load, or delete workspace configurations",
    );
    await wsButton.click();
    await page.getByText("Save current workspace").click();
    const nameInput = page.getByPlaceholder("Workspace name...");
    await nameInput.fill("My Workspace");
    await nameInput.press("Enter");
    await expect(page.getByText("My Workspace")).toBeVisible();

    // Click delete button (use exact title to avoid matching workspace menu button)
    const deleteButton = page.getByTitle("Delete", { exact: true });
    await deleteButton.click();

    // Workspace should be gone, empty state returns
    await expect(page.getByText("My Workspace")).not.toBeVisible();
    await expect(page.getByText("No saved workspaces")).toBeVisible();
  });
});
