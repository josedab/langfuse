import { test, expect } from "@playwright/test";
import { login, navigateToProject, TEST_PROJECT_ID, waitForTableLoad } from "./helpers";

test.describe("Visual Regression Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("Dashboard", () => {
    test("dashboard should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Wait for charts to load
      await page.waitForSelector("h2", { timeout: 10000 });

      await expect(page).toHaveScreenshot("dashboard.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Traces List", () => {
    test("traces list should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/traces");
      await waitForTableLoad(page);
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("traces-list.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Sessions List", () => {
    test("sessions list should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/sessions");
      await waitForTableLoad(page);
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("sessions-list.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Datasets List", () => {
    test("datasets list should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/datasets");
      await waitForTableLoad(page);
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("datasets-list.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Evaluations Page", () => {
    test("evaluations page should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/evals");
      await waitForTableLoad(page);
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("evaluations.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Prompts List", () => {
    test("prompts list should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/prompts");
      await waitForTableLoad(page);
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("prompts-list.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Settings Pages", () => {
    test("project settings should match snapshot", async ({ page }) => {
      await navigateToProject(page, TEST_PROJECT_ID, "/settings");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      await expect(page).toHaveScreenshot("project-settings.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });

  test.describe("Auth Pages", () => {
    test("sign in page should match snapshot", async ({ page }) => {
      // Don't login for this test
      await page.goto("/auth/sign-in");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      await expect(page).toHaveScreenshot("sign-in.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });

    test("sign up page should match snapshot", async ({ page }) => {
      // Don't login for this test
      await page.goto("/auth/sign-up");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      await expect(page).toHaveScreenshot("sign-up.png", {
        maxDiffPixels: 100,
        fullPage: true,
      });
    });
  });
});
