# RFC-0007: Add Test Coverage Metrics

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P1
**Effort:** <1 week

---

## Summary

Add test coverage reporting to the CI pipeline with configurable thresholds to maintain and improve code quality across the Langfuse codebase.

---

## Motivation

### Problem Statement

Currently, the codebase has:
- 111+ test files across web and worker packages
- No coverage metrics configured
- No visibility into coverage trends
- No enforcement of minimum coverage

### Impact

- Unknown coverage blind spots
- No objective quality metric
- Potential regression in test coverage
- Difficulty prioritizing test improvements

### Current State

| Package | Test Files | Coverage | Threshold |
|---------|------------|----------|-----------|
| Web | 80+ | Unknown | None |
| Worker | 31+ | Unknown | None |
| Shared | 0 | Unknown | None |

---

## Detailed Design

### Jest Configuration (Web)

```javascript
// web/jest.config.mjs

export default {
  // ... existing config

  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: [
    "text",
    "lcov",
    "json-summary",
    "html",
  ],

  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.servertest.{ts,tsx}",
    "!src/**/*.clienttest.{ts,tsx}",
    "!src/**/index.ts",  // Re-exports
    "!src/pages/**",      // Next.js pages (test via E2E)
    "!src/env.mjs",       // Environment config
  ],

  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 60,
      statements: 60,
    },
    // Higher thresholds for critical paths
    "./src/features/public-api/": {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80,
    },
    "./src/server/": {
      branches: 60,
      functions: 60,
      lines: 70,
      statements: 70,
    },
  },
};
```

### Vitest Configuration (Worker)

```typescript
// worker/vitest.config.ts

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ... existing config

    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html"],
      reportsDirectory: "./coverage",

      include: [
        "src/**/*.ts",
      ],

      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/index.ts",
        "src/app.ts",  // Entry point
      ],

      thresholds: {
        branches: 50,
        functions: 50,
        lines: 60,
        statements: 60,
      },
    },
  },
});
```

### CI Pipeline Updates

```yaml
# .github/workflows/pipeline.yml

jobs:
  tests-web-coverage:
    name: Web Test Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run tests with coverage
        run: pnpm --filter=web run test --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./web/coverage/lcov.info
          flags: web
          fail_ci_if_error: true

      - name: Coverage summary
        uses: irongut/CodeCoverageSummary@v1.3.0
        with:
          filename: web/coverage/cobertura.xml
          badge: true
          format: markdown
          output: both

      - name: Add coverage PR comment
        uses: marocchino/sticky-pull-request-comment@v2
        if: github.event_name == 'pull_request'
        with:
          recreate: true
          path: code-coverage-results.md

  tests-worker-coverage:
    name: Worker Test Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run tests with coverage
        run: pnpm --filter=worker run test --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./worker/coverage/lcov.info
          flags: worker
          fail_ci_if_error: true
```

### Package.json Scripts

```json
// web/package.json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watch"
  }
}

// worker/package.json
{
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "coverage": "vitest run --coverage"
  }
}
```

### Codecov Configuration

```yaml
# codecov.yml
codecov:
  require_ci_to_pass: true

coverage:
  precision: 2
  round: down
  range: "50...90"

  status:
    project:
      default:
        target: auto
        threshold: 2%  # Allow 2% decrease
        informational: false

    patch:
      default:
        target: 80%  # New code should have 80% coverage
        informational: false

comment:
  layout: "reach,diff,flags,files"
  behavior: default
  require_changes: true

flags:
  web:
    paths:
      - web/src/
    carryforward: true

  worker:
    paths:
      - worker/src/
    carryforward: true
```

---

## Example Usage

### PR Comment Output

```markdown
## Coverage Report

| Flag | Coverage | Change |
|------|----------|--------|
| web | 65.2% | +1.3% |
| worker | 58.7% | -0.5% |

### New Files
- `web/src/features/foo/service.ts` - 85%
- `worker/src/queues/newQueue.ts` - 72%

### Coverage by File (changed)
| File | Coverage | Lines |
|------|----------|-------|
| web/src/features/foo/service.ts | 85% | 42/50 |
| worker/src/queues/newQueue.ts | 72% | 18/25 |
```

### Local Development

```bash
# Generate coverage report
pnpm --filter=web run test:coverage

# View HTML report
open web/coverage/index.html

# Watch mode with coverage
pnpm --filter=web run test:coverage:watch
```

---

## Implementation Plan

| Day | Task | Owner |
|-----|------|-------|
| 1 | Configure Jest coverage (web) | Backend team |
| 2 | Configure Vitest coverage (worker) | Backend team |
| 3 | Update CI pipeline | DevOps |
| 4 | Set up Codecov integration | DevOps |
| 5 | Documentation and review | Team |

### Milestones

- [ ] Day 2: Local coverage working
- [ ] Day 4: CI integration complete
- [ ] Day 5: PR comments working

---

## Backwards Compatibility

### Breaking Changes

None. Coverage is additive to existing tests.

### Migration Steps

1. Add coverage configuration
2. Run coverage to establish baseline
3. Adjust thresholds based on current state
4. Gradually increase thresholds

### Initial Threshold Strategy

Start with thresholds below current coverage, then increase:

1. Week 1: Establish baseline
2. Week 2: Set thresholds 5% below baseline
3. Month 2: Increase to baseline
4. Month 3+: Increase by 5% quarterly

---

## Alternatives Considered

### 1. SonarQube

Full code quality platform.

**Rejected:**
- Overkill for just coverage
- Additional infrastructure
- Higher complexity

### 2. Coveralls

Alternative to Codecov.

**Rejected:**
- Codecov has better PR integration
- More common in OSS projects

### 3. No Thresholds

Report coverage without enforcing.

**Rejected:**
- No accountability
- Coverage tends to decrease without enforcement

---

## Open Questions

1. **Q:** Should coverage be required to merge?
   **A:** Initially informational, then required after baseline established.

2. **Q:** What's the target coverage?
   **A:** 70% global, 80% for critical paths.

3. **Q:** How to handle legacy code with low coverage?
   **A:** Exclude initially, add coverage when modifying.

---

## Success Criteria

- [ ] Coverage reports in every PR
- [ ] Codecov badges in README
- [ ] Thresholds prevent coverage regression
- [ ] Quarterly coverage improvement

### Metrics to Track

- Global coverage percentage
- Coverage by package
- Coverage trend over time
- PR coverage delta

---

## Effort Estimation

- **Configuration:** 2 days
- **CI integration:** 1 day
- **Documentation:** 0.5 days
- **Total:** ~3.5 dev-days

---

## Rollback Strategy

1. Remove coverage configuration from Jest/Vitest
2. Disable Codecov CI step
3. Tests continue to run without coverage
