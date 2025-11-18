# RFC-0008: Comprehensive E2E Test Suite

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P2
**Effort:** >1 month

---

## Summary

Develop a comprehensive end-to-end test suite using Playwright to validate critical user journeys, prevent regressions, and enable confident deployments.

---

## Motivation

### Problem Statement

Current E2E testing is minimal:
- Playwright config exists but underutilized
- Critical user paths untested end-to-end
- Visual regressions possible
- Manual QA required for releases

### Impact

- Regressions reach production
- Slow release cycles (manual testing)
- Low confidence in deployments
- Difficult to refactor UI safely

### Current State

- ~10 E2E test files
- Basic smoke tests only
- No visual regression testing
- No cross-browser testing

---

## Detailed Design

### Test Categories

#### 1. Authentication Flows

```typescript
// e2e/auth/login.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should login with email/password", async ({ page }) => {
    await page.goto("/auth/sign-in");

    await page.fill('[name="email"]', "demo@langfuse.com");
    await page.fill('[name="password"]', "password");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/project\//);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test("should handle invalid credentials", async ({ page }) => {
    await page.goto("/auth/sign-in");

    await page.fill('[name="email"]', "invalid@example.com");
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toContainText("Invalid");
  });

  test("should redirect unauthenticated users", async ({ page }) => {
    await page.goto("/project/123/traces");

    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
```

#### 2. Core Feature Flows

```typescript
// e2e/traces/trace-viewer.spec.ts
import { test, expect } from "@playwright/test";
import { login, createTrace } from "../helpers";

test.describe("Trace Viewer", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should display trace details", async ({ page }) => {
    const trace = await createTrace();

    await page.goto(`/project/${trace.projectId}/traces/${trace.id}`);

    await expect(page.locator('[data-testid="trace-name"]'))
      .toHaveText(trace.name);
    await expect(page.locator('[data-testid="observation-tree"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="trace-input"]'))
      .toContainText(trace.input);
  });

  test("should filter traces by date range", async ({ page }) => {
    await page.goto(`/project/${projectId}/traces`);

    // Select date range
    await page.click('[data-testid="date-range-picker"]');
    await page.click('text="Last 7 days"');

    // Verify filter applied
    await expect(page.locator('[data-testid="trace-list"]'))
      .not.toContainText("Loading");
  });

  test("should search traces by content", async ({ page }) => {
    await page.goto(`/project/${projectId}/traces`);

    await page.fill('[data-testid="search-input"]', "test query");
    await page.press('[data-testid="search-input"]', "Enter");

    await expect(page.locator('[data-testid="trace-list"]'))
      .toBeVisible();
  });
});
```

#### 3. Data Management Flows

```typescript
// e2e/datasets/dataset-management.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Dataset Management", () => {
  test("should create a dataset", async ({ page }) => {
    await page.goto(`/project/${projectId}/datasets`);

    await page.click('text="New Dataset"');
    await page.fill('[name="name"]', "Test Dataset");
    await page.fill('[name="description"]', "E2E test dataset");
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]'))
      .toContainText("created successfully");
  });

  test("should add items to dataset", async ({ page }) => {
    await page.goto(`/project/${projectId}/datasets/${datasetId}`);

    await page.click('text="Add Item"');
    await page.fill('[name="input"]', '{"question": "test"}');
    await page.fill('[name="expectedOutput"]', '{"answer": "test"}');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="dataset-items"]'))
      .toContainText("test");
  });
});
```

#### 4. Evaluation Flows

```typescript
// e2e/evals/evaluation-config.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Evaluation Configuration", () => {
  test("should create evaluation template", async ({ page }) => {
    await page.goto(`/project/${projectId}/evals/templates`);

    await page.click('text="New Template"');
    await page.fill('[name="name"]', "Test Eval");
    await page.fill('[name="prompt"]', "Is this helpful? {{output}}");
    await page.selectOption('[name="model"]', "gpt-4");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/evals\/templates\//);
  });

  test("should run evaluation job", async ({ page }) => {
    await page.goto(`/project/${projectId}/evals/configs/${configId}`);

    await page.click('text="Run Now"');

    await expect(page.locator('[data-testid="job-status"]'))
      .toContainText("Running");
  });
});
```

### Visual Regression Testing

```typescript
// e2e/visual/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual Regression", () => {
  test("dashboard should match snapshot", async ({ page }) => {
    await page.goto(`/project/${projectId}/dashboard`);

    // Wait for charts to load
    await page.waitForSelector('[data-testid="dashboard-loaded"]');

    await expect(page).toHaveScreenshot("dashboard.png", {
      maxDiffPixels: 100,
    });
  });

  test("trace viewer should match snapshot", async ({ page }) => {
    await page.goto(`/project/${projectId}/traces/${traceId}`);

    await page.waitForSelector('[data-testid="trace-loaded"]');

    await expect(page).toHaveScreenshot("trace-viewer.png", {
      maxDiffPixels: 100,
    });
  });
});
```

### Test Helpers

```typescript
// e2e/helpers/index.ts

import { Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.fill('[name="email"]', process.env.E2E_USER_EMAIL!);
  await page.fill('[name="password"]', process.env.E2E_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/project\//);
}

export async function createTrace(data?: Partial<TraceData>): Promise<Trace> {
  const response = await fetch("/api/public/traces", {
    method: "POST",
    headers: {
      Authorization: `Basic ${process.env.E2E_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: data?.name ?? "E2E Test Trace",
      input: data?.input ?? "Test input",
      output: data?.output ?? "Test output",
    }),
  });

  return response.json();
}

export async function waitForTraceProcessing(traceId: string): Promise<void> {
  // Wait for async processing to complete
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html"],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "pnpm run dev:web",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

### CI Integration

```yaml
# .github/workflows/e2e.yml

name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps

      - name: Start services
        run: docker-compose -f docker-compose.e2e.yml up -d

      - name: Wait for services
        run: |
          npx wait-on http://localhost:3000/api/public/health

      - name: Seed database
        run: pnpm --filter=@langfuse/shared run db:seed

      - name: Run E2E tests
        run: pnpm --filter=web run test:e2e

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: web/playwright-report/
          retention-days: 30
```

---

## Implementation Plan

### Month 1: Foundation

| Week | Task | Owner |
|------|------|-------|
| 1 | Set up Playwright infrastructure | QA team |
| 2 | Create test helpers and fixtures | QA team |
| 3-4 | Implement auth flow tests | QA team |

### Month 2: Core Features

| Week | Task | Owner |
|------|------|-------|
| 5-6 | Implement trace viewer tests | QA team |
| 7-8 | Implement dataset/eval tests | QA team |

### Month 3: Polish

| Week | Task | Owner |
|------|------|-------|
| 9-10 | Visual regression tests | QA team |
| 11 | Cross-browser testing | QA team |
| 12 | CI optimization | DevOps |

### Milestones

- [ ] Week 4: Auth flows tested
- [ ] Week 8: Core features tested
- [ ] Week 12: Full suite operational

---

## Test Coverage Goals

### Critical Paths (Must Have)

- [ ] User login/logout
- [ ] Trace list and detail view
- [ ] Dataset creation and management
- [ ] Prompt creation and versioning
- [ ] Score submission

### Important Paths (Should Have)

- [ ] Evaluation configuration
- [ ] Dashboard metrics
- [ ] Export functionality
- [ ] Project settings

### Nice to Have

- [ ] Admin functions
- [ ] Billing flows
- [ ] API key management

---

## Backwards Compatibility

### Breaking Changes

None. Tests are additive.

### Migration Steps

1. Set up test infrastructure
2. Gradually add tests
3. Enable in CI progressively

---

## Alternatives Considered

### 1. Cypress

Popular E2E framework.

**Rejected:**
- Playwright has better multi-browser support
- Better performance
- Microsoft backing

### 2. TestCafe

Alternative E2E tool.

**Rejected:**
- Less community adoption
- Fewer integrations
- Less mature

### 3. Selenium

Traditional E2E framework.

**Rejected:**
- Slower
- More complex setup
- Outdated patterns

---

## Open Questions

1. **Q:** Should E2E tests run on every PR?
   **A:** Run on PR, but allow bypass for docs-only changes.

2. **Q:** How to handle test data?
   **A:** Seed database before each test run, clean up after.

3. **Q:** Should we test email flows?
   **A:** Use Mailhog for local email testing.

---

## Success Criteria

- [ ] 20+ critical path tests
- [ ] <5 minute test execution
- [ ] Zero flaky tests
- [ ] Visual regression baselines
- [ ] Cross-browser coverage

### Metrics to Track

- Test count by category
- Test execution time
- Flakiness rate
- Coverage of critical paths

---

## Effort Estimation

- **Infrastructure:** 5 days
- **Auth tests:** 3 days
- **Feature tests:** 20 days
- **Visual tests:** 5 days
- **CI integration:** 3 days
- **Documentation:** 2 days
- **Total:** ~38 dev-days

---

## Rollback Strategy

1. Tests are independent of production code
2. Can disable in CI if blocking
3. Individual tests can be skipped
