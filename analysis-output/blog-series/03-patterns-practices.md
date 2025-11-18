# Patterns and Practices in Langfuse

**Part 3 of 5 in the Langfuse Technical Deep Dive Series**

*Analysis based on commit `03edd7d9019186493b7008db9f465bf8023cf6d1`*

---

## What You'll Learn

- How tRPC enables type-safe end-to-end development
- Feature-based code organization patterns
- Service layer design and dependency management
- Error handling and observability integration
- Testing strategies across the monorepo

---

## Introduction

A codebase with 2,900+ dependencies and multiple databases needs strong organizational patterns to remain maintainable. Langfuse achieves this through consistent conventions, type safety, and clear separation of concerns. Let's explore the patterns that make this possible.

---

## Type-Safe End-to-End Development

### The tRPC Advantage

tRPC provides automatic TypeScript types from server to client:

```typescript
// Server: web/src/features/datasets/server/datasetRouter.ts
export const datasetRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(z.object({
      projectId: z.string(),
      datasetId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
      });
      return dataset;
    }),
});

// Client: Automatic type inference
const { data } = api.datasets.byId.useQuery({
  projectId: "project-123",
  datasetId: "dataset-456",
});
// data is typed as Dataset | null automatically
```

**Benefits**:
- Refactoring updates both server and client
- Invalid inputs caught at compile time
- IDE autocomplete for API calls

### Zod Schema Validation

Every input gets runtime validation:

```typescript
// From: web/src/features/public-api/types/datasets.ts
export const CreateDatasetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.string()).optional(),
});

// Usage in procedure
.input(CreateDatasetSchema)
.mutation(async ({ input }) => {
  // input is validated and typed
});
```

**Custom Validators**:

```typescript
// Prevent HTML injection
export const StringNoHTML = z.string().refine(
  (val) => !/<[^>]*>/g.test(val),
  { message: "HTML tags not allowed" }
);

// Email validation
export const EmailSchema = z.string().email();

// URL validation
export const UrlSchema = z.string().url();
```

### Prisma Type Safety

Database types flow through the entire stack:

```typescript
// Generated from schema.prisma
import type { Dataset } from "@prisma/client";

// Service function with full type information
async function createDataset(
  data: Prisma.DatasetCreateInput
): Promise<Dataset> {
  return prisma.dataset.create({ data });
}
```

---

## Feature-Based Organization

### Directory Structure

Each feature is self-contained:

```
web/src/features/datasets/
├── server/
│   ├── datasetRouter.ts      # tRPC router
│   └── service.ts            # Business logic
├── components/
│   ├── DatasetTable.tsx      # Feature-specific components
│   ├── DatasetForm.tsx
│   └── DatasetDetails.tsx
├── hooks/
│   └── useDatasets.ts        # Custom React hooks
├── types/
│   └── index.ts              # Feature types
└── README.md                 # Feature documentation
```

### Benefits

1. **Discoverability**: Everything for a feature in one place
2. **Encapsulation**: Clear boundaries between features
3. **Ownership**: Easy to assign feature ownership
4. **Testing**: Tests live next to implementation

### Router Aggregation

Features export routers that aggregate in root:

```typescript
// From: web/src/server/api/root.ts
export const appRouter = createTRPCRouter({
  // Feature routers
  datasets: datasetRouter,
  prompts: promptRouter,
  traces: traceRouter,
  scores: scoreRouter,
  evals: evalRouter,

  // 35+ more routers...

  // Organization routers
  organizations: organizationRouter,
  projects: projectRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
```

---

## Service Layer Patterns

### Procedure → Service Pattern

Procedures delegate to services:

```typescript
// ❌ Anti-pattern: Logic in procedure
export const datasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateDatasetSchema)
    .mutation(async ({ input, ctx }) => {
      // 100+ lines of business logic here
      const exists = await ctx.prisma.dataset.findFirst({...});
      if (exists) throw new Error("...");
      // More logic...
    }),
});

// ✅ Pattern: Delegate to service
export const datasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateDatasetSchema)
    .mutation(async ({ input, ctx }) => {
      return createDataset({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
      });
    }),
});

// Service handles business logic
async function createDataset(params: CreateDatasetParams) {
  // Validation
  const exists = await checkDatasetExists(params.projectId, params.name);
  if (exists) {
    throw new ConflictError(`Dataset "${params.name}" already exists`);
  }

  // Creation
  const dataset = await prisma.dataset.create({
    data: {
      projectId: params.projectId,
      name: params.name,
      description: params.description,
    },
  });

  // Side effects
  await invalidateCache(params.projectId);

  return dataset;
}
```

### Repository Pattern

Complex queries use repositories:

```typescript
// From: packages/shared/src/server/repositories/traces.ts

export async function getTracesTable(params: {
  projectId: string;
  filter: FilterList;
  orderBy: OrderBy;
  limit: number;
  offset: number;
}): Promise<TracesTableResult> {
  const { projectId, filter, orderBy, limit, offset } = params;

  const query = `
    SELECT
      t.id,
      t.timestamp,
      t.name,
      t.user_id,
      count(o.id) as observation_count,
      sum(o.cost_details['total']) as total_cost
    FROM traces t
    LEFT JOIN observations o ON t.id = o.trace_id
    WHERE t.project_id = {projectId: String}
      ${filter.toClickhouseCondition()}
    GROUP BY t.id, t.timestamp, t.name, t.user_id
    ORDER BY ${orderBy.toClickhouse()}
    LIMIT {limit: Int32}
    OFFSET {offset: Int32}
    FINAL
  `;

  return queryClickhouse({
    query,
    params: { projectId, limit, offset },
  });
}
```

### Singleton Services

Services with state use singleton pattern:

```typescript
// From: packages/shared/src/server/services/PromptService/index.ts

export class PromptService {
  private static instance: PromptService | null = null;
  private cache: Map<string, CachedPrompt> = new Map();

  private constructor() {}

  public static getInstance(): PromptService {
    if (!PromptService.instance) {
      PromptService.instance = new PromptService();
    }
    return PromptService.instance;
  }

  async getPrompt(params: GetPromptParams): Promise<Prompt> {
    const cacheKey = this.getCacheKey(params);

    // Check in-memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.prompt;
    }

    // Check Redis cache
    const redisResult = await this.getFromRedis(cacheKey);
    if (redisResult) {
      this.cache.set(cacheKey, redisResult);
      return redisResult.prompt;
    }

    // Fetch from database
    const prompt = await this.fetchFromDatabase(params);
    await this.cachePrompt(cacheKey, prompt);

    return prompt;
  }
}
```

---

## Error Handling

### Custom Error Hierarchy

```typescript
// From: packages/shared/src/errors/index.ts

export class BaseError extends Error {
  public readonly httpCode: number;
  public readonly isRetryable: boolean;

  constructor(message: string, httpCode: number, isRetryable = false) {
    super(message);
    this.httpCode = httpCode;
    this.isRetryable = isRetryable;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends BaseError {
  constructor(message = "Resource not found") {
    super(message, 404, false);
  }
}

export class ConflictError extends BaseError {
  constructor(message = "Resource already exists") {
    super(message, 409, false);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = "Authentication required") {
    super(message, 401, false);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = "Access denied") {
    super(message, 403, false);
  }
}

export class RateLimitError extends BaseError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, true);
  }
}
```

### Error Mapping in tRPC

```typescript
// From: web/src/server/api/trpc.ts

const errorHandlingMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Map custom errors to tRPC errors
    if (error instanceof BaseError) {
      throw new TRPCError({
        code: mapHttpCodeToTRPC(error.httpCode),
        message: error.message,
        cause: error,
      });
    }

    // Log unexpected errors
    traceException(error);

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
  }
});

function mapHttpCodeToTRPC(httpCode: number): TRPCErrorCode {
  switch (httpCode) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 429: return "TOO_MANY_REQUESTS";
    default: return "INTERNAL_SERVER_ERROR";
  }
}
```

### Error Handling in Queues

```typescript
// From: worker/src/queues/evalQueue.ts

const processor = async (job: Job<EvalJobData>) => {
  try {
    await executeEvaluation(job.data);
  } catch (error) {
    // Determine if retryable
    if (error instanceof RateLimitError) {
      // Retry with backoff
      throw error;
    }

    if (error instanceof NotFoundError) {
      // Don't retry - resource doesn't exist
      logger.warn("Evaluation target not found", {
        jobId: job.id,
        error: error.message,
      });
      return; // Complete without error
    }

    // Log and retry for unexpected errors
    traceException(error);
    throw error;
  }
};
```

---

## Observability Integration

### Structured Logging

```typescript
// From: packages/shared/src/server/logger.ts

// Logger automatically injects trace context
logger.info("Processing dataset", {
  datasetId,
  projectId,
  itemCount: items.length,
  // Automatically includes:
  // - trace_id (OpenTelemetry)
  // - span_id (OpenTelemetry)
  // - dd.trace_id (Datadog)
  // - dd.span_id (Datadog)
});
```

### Span Instrumentation

```typescript
// Wrap operations in spans for tracing
const result = await instrumentAsync(
  { name: "dataset.create" },
  async (span) => {
    // Set attributes for debugging
    span.setAttributes({
      "dataset.project_id": projectId,
      "dataset.name": name,
    });

    const dataset = await createDatasetInDB(params);

    // Record metrics
    recordIncrement("langfuse.dataset.created", 1, {
      projectId,
    });

    return dataset;
  }
);
```

### Exception Recording

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Record to current span (sent to Datadog)
  traceException(error);

  // Re-throw to propagate error
  throw error;
}
```

---

## Testing Strategies

### Test Organization

```
web/src/__tests__/
├── async/                    # Async server tests (with DB)
│   ├── datasets-api.servertest.ts
│   ├── traces-api.servertest.ts
│   └── ...
├── api-auth.servertest.ts    # Sync server tests
├── queryBuilder.servertest.ts
└── test-utils.ts             # Shared utilities

worker/src/__tests__/
├── evalService.test.ts       # Vitest tests
├── batchExport.test.ts
└── ...
```

### Integration Test Pattern

```typescript
// From: web/src/__tests__/async/datasets-api.servertest.ts

describe("Datasets API", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    // Create isolated test project
    const setup = await createOrgProjectAndApiKey();
    auth = setup.auth;
    projectId = setup.projectId;
  });

  it("should create a dataset", async () => {
    const response = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: `test-dataset-${randomUUID()}`,
        description: "Test description",
      },
      auth
    );

    expect(response.status).toBe(200);
    expect(response.body.name).toContain("test-dataset");
    expect(response.body.projectId).toBe(projectId);
  });

  it("should return 409 for duplicate names", async () => {
    const name = `duplicate-${randomUUID()}`;

    // Create first
    await makeAPICall("POST", "/api/public/datasets", { name }, auth);

    // Try duplicate
    const response = await makeAPICall(
      "POST",
      "/api/public/datasets",
      { name },
      auth
    );

    expect(response.status).toBe(409);
  });
});
```

### tRPC Test Pattern

```typescript
// From: web/src/__tests__/async/evaluations.servertest.ts

describe("Evaluations tRPC", () => {
  it("should create evaluation config", async () => {
    // Setup: Create context with auth
    const { projectId } = await createOrgProjectAndApiKey();
    const ctx = await createInnerTRPCContext({
      session: await createTestSession(projectId),
    });
    const caller = appRouter.createCaller(ctx);

    // Execute procedure
    const result = await caller.evals.createConfig({
      projectId,
      name: "test-eval",
      evaluator: "gpt-4",
      template: "Is this response helpful? {{response}}",
    });

    // Assert
    expect(result.id).toBeDefined();
    expect(result.name).toBe("test-eval");
  });
});
```

### Test Utilities

```typescript
// From: web/src/__tests__/test-utils.ts

// Create isolated test environment
export async function createOrgProjectAndApiKey() {
  const org = await prisma.organization.create({
    data: { name: `test-org-${randomUUID()}` },
  });

  const project = await prisma.project.create({
    data: {
      name: `test-project-${randomUUID()}`,
      organizationId: org.id,
    },
  });

  const apiKey = await createAPIKey(project.id);

  return {
    orgId: org.id,
    projectId: project.id,
    auth: `Basic ${Buffer.from(`${apiKey.publicKey}:${apiKey.secretKey}`).toString("base64")}`,
  };
}

// Zod-validated API call
export async function makeZodVerifiedAPICall<T extends z.ZodType>(
  schema: T,
  method: string,
  url: string,
  body?: unknown,
  auth?: string
): Promise<{ status: number; body: z.infer<T> }> {
  const response = await makeAPICall(method, url, body, auth);

  // Validate response matches schema
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    throw new Error(`Response validation failed: ${parsed.error.message}`);
  }

  return { status: response.status, body: parsed.data };
}
```

### Worker Test Pattern (Vitest)

```typescript
// From: worker/src/__tests__/evalService.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("EvalService", () => {
  let mockLLM: MockedFunction<typeof callLLM>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = vi.fn();
  });

  it("should execute evaluation", async () => {
    // Setup mock
    mockLLM.mockResolvedValue({
      content: "Score: 8/10",
      usage: { totalTokens: 100 },
    });

    // Execute
    const result = await executeEvaluation({
      templateId: "template-1",
      traceId: "trace-1",
      variables: { response: "Hello world" },
    });

    // Assert
    expect(result.score).toBe(8);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Hello world"),
      })
    );
  });
});
```

### Test Independence

```typescript
// ❌ Anti-pattern: Tests depend on each other
let sharedDatasetId: string;

it("should create dataset", async () => {
  const result = await createDataset();
  sharedDatasetId = result.id; // Other tests use this
});

it("should add items to dataset", async () => {
  await addItems(sharedDatasetId); // Depends on previous test
});

// ✅ Pattern: Each test is independent
it("should create dataset", async () => {
  const { projectId, auth } = await createOrgProjectAndApiKey();
  const result = await createDataset({ projectId, auth });
  expect(result.id).toBeDefined();
});

it("should add items to dataset", async () => {
  const { projectId, auth } = await createOrgProjectAndApiKey();
  const dataset = await createDataset({ projectId, auth });
  const result = await addItems(dataset.id, { auth });
  expect(result.itemCount).toBe(1);
});
```

---

## Code Quality Patterns

### Consistent Imports

```typescript
// Type-only imports
import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";

// Organized imports (enforced by ESLint)
// 1. External packages
import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";

// 2. Internal packages
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

// 3. Local imports
import { createTRPCRouter } from "@/src/server/api/trpc";
```

### Unused Parameter Convention

```typescript
// Prefix unused parameters with underscore
async function handler(
  _req: NextApiRequest,  // Unused but required for signature
  res: NextApiResponse
) {
  return res.status(200).json({ ok: true });
}
```

### Environment Configuration

```typescript
// Always use env.mjs, never process.env
// From: web/src/env.mjs
import { env } from "@/src/env.mjs";

const dbUrl = env.DATABASE_URL;  // ✅ Type-safe, validated
const dbUrl = process.env.DATABASE_URL;  // ❌ Unvalidated string | undefined
```

---

## Key Takeaways

1. **Type safety is non-negotiable**: tRPC + Zod + Prisma catch errors at compile time

2. **Feature-based organization** keeps code discoverable and maintainable

3. **Procedures delegate to services** for testable business logic

4. **Custom error hierarchy** provides consistent HTTP codes and retryability

5. **Every operation is instrumented** for observability

6. **Tests are independent** and use unique identifiers

---

## Next Steps

In **Part 4**, we'll explore how to extend and integrate with Langfuse—public API design, SDK patterns, webhooks, and evaluation extensibility.

---

*This post is part of a technical series on Langfuse architecture. Find the complete series at [analysis-output/blog-series/00-series-outline.md](./00-series-outline.md).*
