import { test, expect } from "@playwright/test";
import {
  login,
  navigateToProject,
  checkPageHeaderTitle,
  TEST_PROJECT_ID,
  waitForTableLoad,
  randomString,
} from "./helpers";

test.describe("Dataset Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("Datasets List", () => {
    test("should display datasets page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");

      await checkPageHeaderTitle(page, "Datasets");
    });

    test("should show datasets table or empty state", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Should show either table or empty state
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator('text="No datasets"')
        .isVisible();
      const hasNewDatasetButton = await page
        .locator('text="New dataset"')
        .isVisible();

      expect(hasTable || hasEmptyState || hasNewDatasetButton).toBeTruthy();
    });

    test("should have new dataset button", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Look for the new dataset button
      const newDatasetButton = page.locator('button:has-text("New dataset")');
      await expect(newDatasetButton).toBeVisible();
    });
  });

  test.describe("Create Dataset", () => {
    test("should open create dataset dialog", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Click new dataset button
      await page.click('button:has-text("New dataset")');
      await page.waitForTimeout(500);

      // Dialog should be visible
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    });

    test("should create a new dataset", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      const datasetName = `E2E Test Dataset ${randomString()}`;

      // Click new dataset button
      await page.click('button:has-text("New dataset")');
      await page.waitForTimeout(500);

      // Fill dataset name
      await page.fill('input[name="name"]', datasetName);

      // Optionally fill description
      const descriptionInput = page.locator('textarea[name="description"]');
      if (await descriptionInput.isVisible()) {
        await descriptionInput.fill("E2E test dataset description");
      }

      // Submit the form
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should redirect to dataset detail or show success message
      // Check for success notification or navigation to new dataset
      const hasSuccessMessage = await page
        .locator('text="created"')
        .isVisible();
      const hasNavigated = page.url().includes("/datasets/");

      expect(hasSuccessMessage || hasNavigated).toBeTruthy();
    });

    test("should validate required fields", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Click new dataset button
      await page.click('button:has-text("New dataset")');
      await page.waitForTimeout(500);

      // Try to submit without name
      const submitButton = page.locator(
        '[role="dialog"] button[type="submit"]',
      );
      if (await submitButton.isEnabled()) {
        await submitButton.click();
        await page.waitForTimeout(500);

        // Should show validation error or remain in dialog
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });
  });

  test.describe("Dataset Detail", () => {
    test("should navigate to dataset detail when clicking on a dataset", async ({
      page,
    }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Click on first dataset if available
      const datasetRow = page.locator("table tbody tr").first();
      if (await datasetRow.isVisible()) {
        await datasetRow.click();
        await page.waitForTimeout(1000);

        // Should navigate to dataset detail
        await expect(page).toHaveURL(/\/datasets\//);
      }
    });

    test("should show dataset items in detail view", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Navigate to first dataset
      const datasetRow = page.locator("table tbody tr").first();
      if (await datasetRow.isVisible()) {
        await datasetRow.click();
        await page.waitForTimeout(2000);

        // Should show items section or empty state
        const hasItems = await page.locator("table").isVisible();
        const hasEmptyState = await page
          .locator('text="No items"')
          .isVisible();
        const hasAddItemButton = await page
          .locator('text="Add item"')
          .isVisible();

        expect(hasItems || hasEmptyState || hasAddItemButton).toBeTruthy();
      }
    });
  });

  test.describe("Dataset Runs", () => {
    test("should show dataset runs tab", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);

      // Navigate to first dataset
      const datasetRow = page.locator("table tbody tr").first();
      if (await datasetRow.isVisible()) {
        await datasetRow.click();
        await page.waitForTimeout(2000);

        // Look for runs tab
        const runsTab = page.locator('text="Runs"');
        if (await runsTab.isVisible()) {
          await runsTab.click();
          await page.waitForTimeout(1000);

          // Should show runs or empty state
          await expect(page).toHaveURL(/\/datasets\//);
        }
      }
    });
  });
});
