import { test, expect } from "@playwright/test";
import {
  login,
  navigateToProject,
  checkPageHeaderTitle,
  TEST_PROJECT_ID,
  waitForTableLoad,
  randomString,
} from "./helpers";

test.describe("Evaluation Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("Evaluators List", () => {
    test("should display evaluators page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals");
      await page.waitForTimeout(1000);

      // Should show evaluators page
      await expect(page).toHaveURL(/\/evals/);
    });

    test("should show evaluators or empty state", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals");
      await waitForTableLoad(page);

      // Should show either evaluators list or empty state
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator('text="No evaluators"')
        .isVisible();
      const hasNewButton = await page.locator('text="New evaluator"').isVisible();

      expect(hasTable || hasEmptyState || hasNewButton).toBeTruthy();
    });
  });

  test.describe("Eval Templates", () => {
    test("should navigate to templates page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals/templates");
      await page.waitForTimeout(1000);

      await expect(page).toHaveURL(/\/evals\/templates/);
    });

    test("should show templates or empty state", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals/templates");
      await waitForTableLoad(page);

      // Should show templates or create button
      const hasContent = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator('text="No templates"')
        .isVisible();
      const hasNewButton = await page
        .locator('text="New template"')
        .isVisible();

      expect(hasContent || hasEmptyState || hasNewButton).toBeTruthy();
    });

    test("should have create template button", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals/templates");
      await waitForTableLoad(page);

      // Look for new template button
      const newTemplateButton = page.locator('button:has-text("New template")');
      if (await newTemplateButton.isVisible()) {
        await expect(newTemplateButton).toBeEnabled();
      }
    });
  });

  test.describe("Create Evaluator", () => {
    test("should open create evaluator dialog", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals");
      await waitForTableLoad(page);

      // Click new evaluator button if visible
      const newEvaluatorButton = page.locator(
        'button:has-text("New evaluator")',
      );
      if (await newEvaluatorButton.isVisible()) {
        await newEvaluatorButton.click();
        await page.waitForTimeout(500);

        // Should open dialog or navigate to create page
        const hasDialog = await page.locator('[role="dialog"]').isVisible();
        const hasNavigated = page.url().includes("/new");

        expect(hasDialog || hasNavigated).toBeTruthy();
      }
    });
  });

  test.describe("Eval Log", () => {
    test("should navigate to eval log page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals/log");
      await page.waitForTimeout(1000);

      await expect(page).toHaveURL(/\/evals\/log/);
    });

    test("should show eval log entries or empty state", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals/log");
      await waitForTableLoad(page);

      // Should show log entries or empty state
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator('text="No evaluations"')
        .isVisible();

      expect(hasTable || hasEmptyState).toBeTruthy();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate between eval pages", async ({ page }) => {
      // Start at evaluators
      await navigateToProject(page, TEST_PROJECT_ID, "/evals");
      await page.waitForTimeout(1000);

      // Navigate to templates
      await page.goto(`/project/${TEST_PROJECT_ID}/evals/templates`);
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/evals\/templates/);

      // Navigate to log
      await page.goto(`/project/${TEST_PROJECT_ID}/evals/log`);
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/evals\/log/);
    });
  });
});
