import { Page, expect } from "@playwright/test";
import { prisma } from "@langfuse/shared/src/db";

// Default test credentials from seed data
export const TEST_USER_EMAIL = "demo@langfuse.com";
export const TEST_USER_PASSWORD = "password";
export const TEST_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

/**
 * Helper to sign in with email/password credentials
 */
export async function login(
  page: Page,
  email: string = TEST_USER_EMAIL,
  password: string = TEST_USER_PASSWORD,
): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/");
}

/**
 * Helper to sign out the current user
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Demo User/ }).click();
  await page.getByRole("menuitem", { name: "Sign Out" }).click();
  await expect(page).toHaveURL("/auth/sign-in");
}

/**
 * Helper to get the project URL for a given email
 */
export async function getProjectUrlForEmail(
  email: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      organizationMemberships: {
        include: {
          organization: {
            include: {
              projects: true,
            },
          },
        },
      },
    },
  });

  if (!user?.organizationMemberships[0]?.organization.projects[0]?.id) {
    return null;
  }

  return `/project/${user.organizationMemberships[0].organization.projects[0].id}`;
}

/**
 * Helper to navigate to a project page
 */
export async function navigateToProject(
  page: Page,
  projectId: string = TEST_PROJECT_ID,
  path: string = "",
): Promise<void> {
  const url = `/project/${projectId}${path}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
}

/**
 * Helper to check the page header title
 */
export async function checkPageHeaderTitle(
  page: Page,
  title: string,
): Promise<void> {
  const pageHeaderTitle = await page
    .locator('[data-testid="page-header-title"]')
    .textContent();
  expect(pageHeaderTitle).toContain(title);
}

/**
 * Helper to wait for network idle
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * Helper to generate a random email address for testing
 */
export function randomEmailAddress(): string {
  return Math.random().toString(36).substring(2, 11) + "@example.com";
}

/**
 * Helper to generate a random string for test data
 */
export function randomString(length: number = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Helper to wait for a specific element to be visible
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 10000,
): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout });
}

/**
 * Helper to wait for async processing to complete
 * Used when waiting for traces or other async operations
 */
export async function waitForProcessing(
  timeoutMs: number = 5000,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

/**
 * Helper to clean up console event listeners
 */
export function cleanUpConsoleEventListeners(page: Page): void {
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
}

/**
 * Helper to create a trace via API for testing
 * Note: This requires a valid API key in the test environment
 */
export async function createTraceViaApi(
  apiKey: string,
  projectId: string,
  data?: {
    name?: string;
    input?: string;
    output?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";

  const response = await fetch(`${baseUrl}/api/public/traces`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: data?.name ?? "E2E Test Trace",
      input: data?.input ?? "Test input",
      output: data?.output ?? "Test output",
      metadata: data?.metadata ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create trace: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper to wait for table data to load
 */
export async function waitForTableLoad(page: Page): Promise<void> {
  // Wait for loading indicators to disappear
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle");
}

/**
 * Helper to click a button by its text content
 */
export async function clickButton(page: Page, text: string): Promise<void> {
  await page.click(`text="${text}"`);
}

/**
 * Helper to fill a form field by label
 */
export async function fillFormField(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label);
  await field.fill(value);
}

/**
 * Helper to select an option from a dropdown by label
 */
export async function selectOption(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.selectOption(selector, value);
}

/**
 * Helper to get all API keys for a project
 */
export async function getApiKeysForProject(
  projectId: string,
): Promise<Array<{ publicKey: string; secretKey: string }>> {
  const apiKeys = await prisma.apiKey.findMany({
    where: { projectId },
    select: {
      publicKey: true,
      hashedSecretKey: true,
    },
  });

  // Note: We can't retrieve the actual secret key as it's hashed
  // This helper returns the public keys only
  return apiKeys.map((key) => ({
    publicKey: key.publicKey,
    secretKey: "", // Secret keys are hashed and cannot be retrieved
  }));
}

/**
 * Helper to check if an element contains specific text
 */
export async function elementContainsText(
  page: Page,
  selector: string,
  text: string,
): Promise<boolean> {
  const element = page.locator(selector);
  const content = await element.textContent();
  return content?.includes(text) ?? false;
}

/**
 * Helper to take a screenshot with a specific name
 */
export async function takeScreenshot(
  page: Page,
  name: string,
): Promise<Buffer> {
  return page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}
