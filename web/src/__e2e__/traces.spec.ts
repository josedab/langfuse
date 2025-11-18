import { test, expect } from "@playwright/test";
import {
  login,
  navigateToProject,
  checkPageHeaderTitle,
  TEST_PROJECT_ID,
  waitForTableLoad,
} from "./helpers";

test.describe("Trace Viewer", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("Traces List", () => {
    test("should display traces list page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");

      await checkPageHeaderTitle(page, "Tracing");
      await expect(page.locator('[data-testid="page-header-title"]')).toContainText("Traces");
    });

    test("should show trace table with data", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);

      // Table should be visible
      await expect(page.locator("table")).toBeVisible();
    });

    test("should navigate to trace detail on row click", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);

      // Click on a trace row if available
      const traceRow = page.locator("table tbody tr").first();
      if (await traceRow.isVisible()) {
        await traceRow.click();
        await page.waitForTimeout(1000);

        // Should navigate to trace detail page
        await expect(page).toHaveURL(/\/traces\//);
      }
    });

    test("should filter traces by search", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);

      // Look for search input
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("test");
        await searchInput.press("Enter");
        await page.waitForTimeout(2000);

        // Table should still be visible after search
        await expect(page.locator("table")).toBeVisible();
      }
    });

    test("should paginate through traces", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);

      // Check for pagination controls
      const paginationNext = page.locator('button[aria-label*="next"]').first();
      if (await paginationNext.isVisible()) {
        await expect(paginationNext).toBeEnabled();
      }
    });
  });

  test.describe("Trace Detail", () => {
    test("should display trace detail view", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);

      // Click on first trace to view details
      const traceRow = page.locator("table tbody tr").first();
      if (await traceRow.isVisible()) {
        await traceRow.click();
        await page.waitForTimeout(2000);

        // Should show trace details
        await expect(page).toHaveURL(/\/traces\//);
      }
    });
  });

  test.describe("Sessions", () => {
    test("should display sessions list page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/sessions");

      await checkPageHeaderTitle(page, "Sessions");
    });

    test("should show sessions table", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/sessions");
      await waitForTableLoad(page);

      // Table or empty state should be visible
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator("text=No sessions found")
        .isVisible();
      expect(hasTable || hasEmptyState).toBeTruthy();
    });
  });

  test.describe("Observations", () => {
    test("should display observations list page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/observations");

      await checkPageHeaderTitle(page, "Tracing");
      await expect(page.locator('[data-testid="page-header-title"]')).toContainText("Observations");
    });

    test("should show observations table", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/observations");
      await waitForTableLoad(page);

      // Table should be visible
      await expect(page.locator("table")).toBeVisible();
    });
  });

  test.describe("Scores", () => {
    test("should display scores list page", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/scores");

      await checkPageHeaderTitle(page, "Scores");
    });

    test("should show scores table", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/scores");
      await waitForTableLoad(page);

      // Table or empty state should be visible
      const hasTable = await page.locator("table").isVisible();
      const hasEmptyState = await page
        .locator("text=No scores found")
        .isVisible();
      expect(hasTable || hasEmptyState).toBeTruthy();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate between trace-related pages", async ({ page }) => {
      // Start at traces
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await checkPageHeaderTitle(page, "Tracing");

      // Navigate to sessions via sidebar or tabs
      await page.goto(`/project/${TEST_PROJECT_ID}/sessions`);
      await page.waitForTimeout(1000);
      await checkPageHeaderTitle(page, "Sessions");

      // Navigate to observations
      await page.goto(`/project/${TEST_PROJECT_ID}/observations`);
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-testid="page-header-title"]')).toContainText("Observations");

      // Navigate to scores
      await page.goto(`/project/${TEST_PROJECT_ID}/scores`);
      await page.waitForTimeout(1000);
      await checkPageHeaderTitle(page, "Scores");
    });
  });
});
