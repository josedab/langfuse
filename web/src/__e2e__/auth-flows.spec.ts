import { test, expect } from "@playwright/test";
import {
  login,
  logout,
  randomEmailAddress,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_PROJECT_ID,
} from "./helpers";

test.describe("Authentication Flows", () => {
  test.describe("Sign In", () => {
    test("should login with valid email/password", async ({ page }) => {
      await page.goto("/auth/sign-in");

      await page.fill('input[name="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click(
        'button[data-testid="submit-email-password-sign-in-form"]',
      );

      await page.waitForTimeout(2000);
      await expect(page).toHaveURL("/");
      await expect(
        page.getByRole("button", { name: /Demo User/ }),
      ).toBeVisible();
    });

    test("should handle invalid credentials", async ({ page }) => {
      await page.goto("/auth/sign-in");

      await page.fill('input[name="email"]', "invalid@example.com");
      await page.fill('input[type="password"]', "wrongpassword");
      await page.click(
        'button[data-testid="submit-email-password-sign-in-form"]',
      );

      await page.waitForTimeout(2000);
      // Should remain on sign-in page
      await expect(page).toHaveURL(/\/auth\/sign-in/);
      // Should show error message
      await expect(
        page.locator("text=Invalid email or password"),
      ).toBeVisible();
    });

    test("should validate email format", async ({ page }) => {
      await page.goto("/auth/sign-in");

      await page.fill('input[name="email"]', "not-an-email");
      await page.fill('input[type="password"]', "password123");
      await page.click(
        'button[data-testid="submit-email-password-sign-in-form"]',
      );

      await page.waitForTimeout(1000);
      // Should show validation error
      await expect(page.getByText("Invalid email")).toBeVisible();
    });

    test("should redirect unauthenticated users to sign-in", async ({
      page,
    }) => {
      await page.goto(`/project/${TEST_PROJECT_ID}/traces`);
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/\/auth\/sign-in/);
    });

    test("should preserve target URL after login", async ({ page }) => {
      const targetUrl = `/project/${TEST_PROJECT_ID}/traces`;
      await page.goto(targetUrl);
      await page.waitForTimeout(2000);

      // Should be redirected to sign-in with targetPath
      await expect(page).toHaveURL(/\/auth\/sign-in\?targetPath=/);

      // Login
      await page.fill('input[name="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click(
        'button[data-testid="submit-email-password-sign-in-form"]',
      );

      await page.waitForTimeout(2000);
      // Should redirect to original target URL
      await expect(page).toHaveURL(targetUrl);
    });

    test("should not redirect to external URLs after login", async ({
      page,
    }) => {
      const externalUrl = "https://example.com";
      await page.goto(
        `/auth/sign-in?targetPath=${encodeURIComponent(externalUrl)}`,
      );

      await page.fill('input[name="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click(
        'button[data-testid="submit-email-password-sign-in-form"]',
      );

      await page.waitForTimeout(2000);
      // Should redirect to home, not external URL
      await expect(page).toHaveURL("/");
    });
  });

  test.describe("Sign Up", () => {
    test("should create a new account successfully", async ({ page }) => {
      const email = randomEmailAddress();

      await page.goto("/auth/sign-up");
      await page.fill('input[name="name"]', "Test User");
      await page.fill('input[name="email"]', email);
      await page.fill('input[type="password"]', "Password123!");
      await page.click(
        'button[data-testid="submit-email-password-sign-up-form"]',
      );

      await page.waitForTimeout(2000);
      await expect(page).toHaveURL("/");
    });

    test("should validate password requirements", async ({ page }) => {
      await page.goto("/auth/sign-up");
      await page.fill('input[name="name"]', "Test User");
      await page.fill('input[name="email"]', randomEmailAddress());
      await page.fill('input[type="password"]', "short");
      await page.click(
        'button[data-testid="submit-email-password-sign-up-form"]',
      );

      await page.waitForTimeout(2000);
      await expect(
        page.getByText("Password must be at least 8 characters long"),
      ).toBeVisible();
    });

    test("should validate email format on sign up", async ({ page }) => {
      await page.goto("/auth/sign-up");
      await page.fill('input[name="name"]', "Test User");
      await page.fill('input[name="email"]', "invalid-email");
      await page.fill('input[type="password"]', "Password123!");
      await page.click(
        'button[data-testid="submit-email-password-sign-up-form"]',
      );

      await page.waitForTimeout(2000);
      await expect(page.getByText("Invalid email")).toBeVisible();
    });

    test("should handle uppercase email addresses", async ({ page }) => {
      const email = "A" + randomEmailAddress();

      await page.goto("/auth/sign-up");
      await page.fill('input[name="name"]', "Test User");
      await page.fill('input[name="email"]', email);
      await page.fill('input[type="password"]', "Password123!");
      await page.click(
        'button[data-testid="submit-email-password-sign-up-form"]',
      );

      await page.waitForTimeout(2000);
      await expect(page).toHaveURL("/");
    });

    test("should show link to sign in page", async ({ page }) => {
      await page.goto("/auth/sign-up");

      const signInLink = page.getByRole("link", { name: /Sign in/i });
      await expect(signInLink).toBeVisible();
      await signInLink.click();

      await expect(page).toHaveURL(/\/auth\/sign-in/);
    });
  });

  test.describe("Sign Out", () => {
    test("should sign out successfully", async ({ page }) => {
      await login(page);

      await logout(page);

      await expect(page).toHaveURL("/auth/sign-in");
    });

    test("should require re-authentication after sign out", async ({
      page,
    }) => {
      await login(page);
      await logout(page);

      // Try to access protected route
      await page.goto(`/project/${TEST_PROJECT_ID}/traces`);
      await page.waitForTimeout(2000);

      // Should be redirected to sign-in
      await expect(page).toHaveURL(/\/auth\/sign-in/);
    });
  });

  test.describe("Session Management", () => {
    test("should maintain session across page refreshes", async ({ page }) => {
      await login(page);

      // Refresh the page
      await page.reload();
      await page.waitForTimeout(2000);

      // Should still be logged in
      await expect(
        page.getByRole("button", { name: /Demo User/ }),
      ).toBeVisible();
    });

    test("should maintain session when navigating to different pages", async ({
      page,
    }) => {
      await login(page);

      // Navigate to different pages
      await page.goto(`/project/${TEST_PROJECT_ID}/traces`);
      await page.waitForTimeout(1000);
      await expect(
        page.getByRole("button", { name: /Demo User/ }),
      ).toBeVisible();

      await page.goto(`/project/${TEST_PROJECT_ID}/sessions`);
      await page.waitForTimeout(1000);
      await expect(
        page.getByRole("button", { name: /Demo User/ }),
      ).toBeVisible();
    });
  });

  test.describe("Password Reset Flow", () => {
    test("should navigate to password reset page", async ({ page }) => {
      await page.goto("/auth/sign-in");

      const forgotPasswordLink = page.getByRole("link", {
        name: /forgot password/i,
      });
      await expect(forgotPasswordLink).toBeVisible();
      await forgotPasswordLink.click();

      await expect(page).toHaveURL(/\/auth\/reset-password/);
    });
  });
});
