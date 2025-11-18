# Understanding Langfuse: Architecture and Core Concepts

**Part 1 of 5 in the Langfuse Technical Deep Dive Series**

*Analysis based on commit `03edd7d9019186493b7008db9f465bf8023cf6d1`*

---

## What You'll Learn

- Why Langfuse chose a hybrid layered + event-driven architecture
- How the dual database system separates OLTP and OLAP concerns
- The core domain model and entity relationships
- Key trade-offs and their implications
- Where to find critical code paths

---

## Introduction

Building an observability platform for LLM applications presents unique challenges. You need to handle high-volume telemetry data while providing real-time insights, support complex queries across millions of events, and maintain a responsive UI for configuration and analysis.

Langfuse addresses these challenges through thoughtful architectural decisions. Let's explore how.

---

## The Problem Domain

LLM applications generate substantial telemetry:

- **Traces**: Complete request-response cycles
- **Observations**: Individual operations (LLM calls, retrieval, processing)
- **Scores**: Evaluation metrics (latency, quality, cost)

A typical production application might generate thousands of traces per hour, each containing multiple observations with large input/output payloads. The platform must:

1. **Ingest** data at high throughput without blocking SDKs
2. **Store** data efficiently for both real-time and historical queries
3. **Query** across dimensions (time, user, session, metadata)
4. **Evaluate** traces automatically and support human annotation

---

## Architectural Pattern: Hybrid Layered + Event-Driven

Langfuse combines synchronous request handling with asynchronous event processing:

```
┌─────────────────────────────────────────────────┐
│           Synchronous Path (UI/Config)          │
│  Client → tRPC → Service → PostgreSQL           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│          Asynchronous Path (Telemetry)          │
│  SDK → API → S3 → Redis Queue → Worker → CH    │
└─────────────────────────────────────────────────┘
```

### Why This Pattern?

**Separation of Concerns**: Configuration (prompts, datasets, users) requires strong consistency and relationships. Telemetry requires high throughput and analytical queries.

**Independent Scaling**: The web tier handles UI traffic; workers scale independently based on queue depth.

**Resilience**: Failed ingestion jobs retry without affecting user-facing operations.

### Trade-offs

| Aspect | Trade-off |
|--------|-----------|
| **Complexity** | Two processing paths, multiple databases |
| **Consistency** | Eventual consistency for telemetry data |
| **Operations** | More services to monitor and maintain |

The trade-off is worth it: separating read-heavy analytical workloads from write-heavy configuration management prevents contention and enables purpose-built optimizations.

---

## The Dual Database System

### PostgreSQL: The Source of Truth

PostgreSQL (via Prisma ORM) stores:

- **User Management**: Users, sessions, API keys
- **Organization Structure**: Organizations, projects, memberships
- **Configuration**: Prompts, models, evaluation templates
- **Workflow State**: Datasets, annotation queues, jobs

Why PostgreSQL?
- ACID transactions for configuration changes
- Rich relationships between entities
- Mature tooling (Prisma, migrations)

**Schema Location**: [`packages/shared/prisma/schema.prisma`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/packages/shared/prisma/schema.prisma)

### ClickHouse: The Analytics Engine

ClickHouse stores high-volume data:

- **Traces**: Execution flow records
- **Observations**: Individual operations
- **Scores**: Evaluation metrics

Why ClickHouse?
- Column-oriented storage for analytical queries
- Excellent compression for JSON payloads
- Fast aggregations across millions of rows

**Table Engine**: ReplacingMergeTree with versioning

```sql
-- From: packages/shared/clickhouse/migrations/unclustered/0001_traces.up.sql
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, toDate(timestamp))
ORDER BY (project_id, toDate(timestamp), id)
```

This engine handles updates by keeping the row with the highest `event_ts`, enabling the "merge events" pattern used in ingestion.

### Database Selection Criteria

| Operation | Database | Reason |
|-----------|----------|--------|
| Create prompt | PostgreSQL | Needs transactions, relationships |
| Query traces by time | ClickHouse | Analytical aggregation |
| Update user role | PostgreSQL | ACID required |
| Insert trace events | ClickHouse | High throughput, compression |
| List project members | PostgreSQL | Relational query |
| Calculate latency percentiles | ClickHouse | Column-oriented aggregation |

---

## Core Domain Model

### Entity Hierarchy

```
Organization
└── Project
    ├── Traces
    │   ├── Observations
    │   └── Scores
    ├── Prompts
    ├── Datasets
    ├── Evaluations
    └── Annotation Queues
```

### Key Relationships

**Trace → Observations**: One-to-many. A trace contains multiple observations representing the execution tree.

**Observation Types**:
- `SPAN`: Timed operation (e.g., function call)
- `GENERATION`: LLM call with model details
- `EVENT`: Point-in-time occurrence

**Scores**: Can attach to traces or observations. Support numeric, categorical, and boolean values.

### Multi-Tenant Isolation

Every data access includes `projectId` filtering:

```typescript
// From: web/src/features/datasets/server/datasetRouter.ts
const datasets = await ctx.prisma.dataset.findMany({
  where: {
    projectId: input.projectId,  // Required for isolation
  },
});
```

This pattern is enforced throughout the codebase. Missing `projectId` in a query would be a security vulnerability.

---

## Request Flow: tRPC Path

For UI interactions, requests flow through the tRPC middleware stack:

```typescript
// From: web/src/server/api/trpc.ts

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError
          ? error.cause.flatten()
          : null,
      },
    };
  },
});
```

### Middleware Stack

1. **OpenTelemetry**: Traces every request
2. **Error Handling**: Normalizes errors, strips stack traces in production
3. **Authentication**: Validates session JWT
4. **Project Authorization**: Checks membership and permissions

### Procedure Types

```typescript
// Public - no auth required
export const publicProcedure = t.procedure;

// Authenticated - requires session
export const authenticatedProcedure = t.procedure.use(enforceUserIsAuthed);

// Protected Project - requires project membership + scope
export const protectedProjectProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(validateProjectMembership);
```

The type system ensures you can't accidentally skip authorization:

```typescript
// This won't compile - input requires projectId
protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .query(async ({ ctx, input }) => {
    // ctx.session guaranteed to exist
    // Project membership already verified
  });
```

---

## Request Flow: Ingestion Path

SDK events take a different path optimized for throughput:

### 1. API Entry Point

```typescript
// From: web/src/pages/api/public/ingestion.ts
export default withMiddlewares({
  POST: createAuthedProjectAPIRoute(async (req, auth) => {
    const result = await processEventBatch({
      projectId: auth.scope.projectId,
      events: req.body.batch,
    });
    return result;
  }),
});
```

### 2. Validation & Grouping

Events are validated with Zod, grouped by `eventBodyId`:

```typescript
// From: packages/shared/src/server/ingestion/processEventBatch.ts
const eventsByEntityId = groupEventsByEntityId(validatedEvents);
// Events for the same trace/observation merge together
```

### 3. S3 Upload (Non-blocking)

Events persist to S3 before queuing:

```typescript
const bucketPath = `${prefix}${projectId}/${entityType}/${eventBodyId}/${key}.json`;
await s3Client.uploadJson(bucketPath, eventData);
```

This enables replay if the worker fails.

### 4. Queue Dispatch

Jobs go to sharded queues:

```typescript
const shardIndex = getShardIndex(
  `${projectId}-${eventBodyId}`,
  LANGFUSE_INGESTION_QUEUE_SHARD_COUNT
);
await queue.add(jobName, jobData, {
  attempts: 6,
  backoff: { type: 'exponential', delay: 5000 },
});
```

### 5. Worker Processing

The worker downloads from S3, merges events, and writes to ClickHouse:

```typescript
// From: worker/src/services/IngestionService/index.ts
await this.mergeAndWrite(entityType, projectId, eventBodyId, events);
```

**Event merging**: Later events override earlier ones, enabling incremental updates without losing data.

---

## Error Handling Philosophy

Langfuse uses a custom error hierarchy mapped to HTTP status codes:

```typescript
// From: packages/shared/src/errors/index.ts
export class BaseError extends Error {
  public readonly httpCode: number;
  public readonly isRetryable: boolean;
}

export class UnauthorizedError extends BaseError {
  httpCode = 401;
}

export class ForbiddenError extends BaseError {
  httpCode = 403;
}
```

### Global Error Handling

```typescript
// From: web/src/server/api/trpc.ts
const errorHandlingMiddleware = t.middleware(async ({ next }) => {
  const result = await next();

  if (!result.ok) {
    // Log error with trace context
    logger.error("tRPC error", {
      error: result.error,
      traceId: getCurrentSpan()?.spanContext().traceId,
    });

    // Strip stack traces in production for 5xx errors
    if (result.error.code === 'INTERNAL_SERVER_ERROR') {
      result.error.message = "Internal server error";
    }
  }

  return result;
});
```

---

## Cross-Cutting Concerns

### Observability

Every request gets OpenTelemetry instrumentation:

```typescript
// From: packages/shared/src/server/instrumentation/index.ts
export async function instrumentAsync<T>(
  ctx: SpanCtx,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(ctx.name, async (span) => {
    try {
      return await callback(span);
    } catch (error) {
      traceException(error, span);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

Usage throughout the codebase:

```typescript
const result = await instrumentAsync(
  { name: "dataset.create" },
  async (span) => {
    span.setAttributes({ projectId, datasetName });
    return await createDataset(input);
  }
);
```

### Logging

Structured logging with automatic trace context:

```typescript
// From: packages/shared/src/server/logger.ts
logger.info("Processing event batch", {
  projectId,
  eventCount: events.length,
  // Automatically includes: trace_id, span_id, dd.trace_id
});
```

---

## Package Structure

The monorepo separates concerns:

```
packages/
├── shared/           # Types, schemas, utilities, repositories
├── config-eslint/    # Shared linting rules
└── config-typescript/# Shared TS configuration

web/                  # Next.js application (UI + API)
worker/               # Express background processor
ee/                   # Enterprise features
```

### Import Conventions

```typescript
// From any package to shared
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { encrypt } from "@langfuse/shared/encryption";

// Within web package
import { Button } from "@/src/components/ui/button";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
```

---

## Key Files Reference

| Purpose | Location |
|---------|----------|
| tRPC Setup | [`web/src/server/api/trpc.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/web/src/server/api/trpc.ts) |
| Router Aggregation | [`web/src/server/api/root.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/web/src/server/api/root.ts) |
| Ingestion Entry | [`web/src/pages/api/public/ingestion.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/web/src/pages/api/public/ingestion.ts) |
| Event Processing | [`packages/shared/src/server/ingestion/processEventBatch.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/packages/shared/src/server/ingestion/processEventBatch.ts) |
| Worker Manager | [`worker/src/queues/workerManager.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/worker/src/queues/workerManager.ts) |
| Database Schema | [`packages/shared/prisma/schema.prisma`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/packages/shared/prisma/schema.prisma) |

---

## Summary: Why These Choices?

| Decision | Alternative | Why Langfuse Chose This |
|----------|-------------|------------------------|
| Dual databases | Single database | Separate OLTP/OLAP optimizations |
| Event-driven ingestion | Synchronous writes | Throughput, resilience, scaling |
| tRPC | REST/GraphQL | End-to-end type safety |
| BullMQ | SQS/Kafka | Self-hosted friendly, proven |
| Monorepo | Multi-repo | Code sharing, atomic changes |
| Pages Router | App Router | Stability at time of creation |

---

## Key Takeaways

1. **Architecture follows requirements**: High-volume telemetry needs different handling than configuration data.

2. **Dual database system**: PostgreSQL for relationships and transactions; ClickHouse for analytical queries.

3. **Event-driven ingestion**: S3 → Redis → Worker pattern enables throughput, resilience, and independent scaling.

4. **Type safety throughout**: tRPC + Zod + Prisma ensure bugs are caught at compile time.

5. **Multi-tenant by design**: Every query filters by `projectId`; RBAC enforced at middleware level.

---

## Next Steps

In **Part 2**, we'll dive deep into the tracing system—how events flow from SDKs through the ingestion pipeline to ClickHouse, and how queries efficiently retrieve data across millions of traces.

---

*This post is part of a technical series on Langfuse architecture. Find the complete series at [analysis-output/blog-series/00-series-outline.md](./00-series-outline.md).*
