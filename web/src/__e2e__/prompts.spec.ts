import { test, expect } from "@playwright/test";
import {
  login,
  navigateToProject,
  checkPageHeaderTitle,
  TEST_PROJECT_ID,
  waitForTableLoad,
  randomString,
} from "./helpers";

test.describe("Prompts Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("Prompts List", () => {
    test("should display prompts page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");

      await checkPageHeaderTitle(page, "Prompts");
    });

    test("should show prompts table or empty state", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Should show either table or empty state
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator('text="No prompts"')
        .isVisible();
      const hasNewPromptButton = await page
        .locator('text="New prompt"')
        .isVisible();

      expect(hasTable || hasEmptyState || hasNewPromptButton).toBeTruthy();
    });

    test("should have new prompt button", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Look for the new prompt button
      const newPromptButton = page.locator('button:has-text("New prompt")');
      await expect(newPromptButton).toBeVisible();
    });
  });

  test.describe("Create Prompt", () => {
    test("should open create prompt dialog", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Click new prompt button
      await page.click('button:has-text("New prompt")');
      await page.waitForTimeout(500);

      // Dialog should be visible or navigate to create page
      const hasDialog = await page.locator('[role="dialog"]').isVisible();
      const hasNavigated = page.url().includes("/new");

      expect(hasDialog || hasNavigated).toBeTruthy();
    });

    test("should create a new prompt", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      const promptName = `e2e-test-prompt-${randomString()}`;

      // Click new prompt button
      await page.click('button:has-text("New prompt")');
      await page.waitForTimeout(500);

      // Fill prompt name
      const nameInput = page.locator('input[name="name"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill(promptName);

        // Submit the form
        await page.click('button[type="submit"]');
        await page.waitForTimeout(2000);

        // Should redirect to prompt detail or show success message
        const hasSuccessMessage = await page
          .locator('text="created"')
          .isVisible();
        const hasNavigated = page.url().includes("/prompts/");

        expect(hasSuccessMessage || hasNavigated).toBeTruthy();
      }
    });
  });

  test.describe("Prompt Detail", () => {
    test("should navigate to prompt detail when clicking on a prompt", async ({
      page,
    }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Click on first prompt if available
      const promptRow = page.locator("table tbody tr").first();
      if (await promptRow.isVisible()) {
        await promptRow.click();
        await page.waitForTimeout(1000);

        // Should navigate to prompt detail
        await expect(page).toHaveURL(/\/prompts\//);
      }
    });

    test("should show prompt versions", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Navigate to first prompt
      const promptRow = page.locator("table tbody tr").first();
      if (await promptRow.isVisible()) {
        await promptRow.click();
        await page.waitForTimeout(2000);

        // Should show versions or version selector
        const hasVersions = await page.locator('text="Version"').isVisible();
        const hasVersionSelector = await page
          .locator('[data-testid="version-selector"]')
          .isVisible();

        expect(hasVersions || hasVersionSelector).toBeTruthy();
      }
    });
  });

  test.describe("Prompt Editor", () => {
    test("should show prompt content editor", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);

      // Navigate to first prompt
      const promptRow = page.locator("table tbody tr").first();
      if (await promptRow.isVisible()) {
        await promptRow.click();
        await page.waitForTimeout(2000);

        // Should show editor or prompt content
        const hasEditor = await page.locator("textarea").isVisible();
        const hasCodeEditor = await page.locator(".monaco-editor").isVisible();
        const hasPromptContent = await page
          .locator('[data-testid="prompt-content"]')
          .isVisible();

        expect(hasEditor || hasCodeEditor || hasPromptContent).toBeTruthy();
      }
    });
  });

  test.describe("Navigation", () => {
    test("should access demo prompt from seed data", async ({ page }) => {
      // Navigate directly to a known prompt from seed
      await page.goto(
        `/project/${TEST_PROJECT_ID}/prompts/summary-prompt`,
      );
      await page.waitForTimeout(2000);

      // Should load the prompt page
      await expect(page).toHaveURL(/\/prompts\/summary-prompt/);
    });
  });
});
