# Langfuse Repository Structure

**Commit SHA:** `03edd7d9019186493b7008db9f465bf8023cf6d1`

---

## High-Level Overview

```
langfuse/
├── web/                     # Next.js 14 frontend/backend application
├── worker/                  # Express.js background job processor
├── packages/
│   ├── shared/             # Shared types, schemas, and utilities
│   ├── config-eslint/      # Shared ESLint configuration
│   └── config-typescript/  # Shared TypeScript configuration
├── ee/                     # Enterprise Edition features
├── fern/                   # API documentation and OpenAPI specs
├── generated/              # Auto-generated client code
├── scripts/                # Development and deployment scripts
├── .github/                # GitHub Actions workflows
└── .claude/                # Claude Code configuration
```

---

## Detailed Structure

### `/web/` - Next.js Application (Primary)

The main application serving both UI and API endpoints.

```
web/
├── src/
│   ├── pages/                    # Next.js Pages Router
│   │   ├── api/
│   │   │   ├── public/          # Public REST API (SDKs)
│   │   │   │   ├── ingestion.ts # Main data ingestion endpoint
│   │   │   │   ├── health.ts    # Health check endpoint
│   │   │   │   ├── traces/      # Trace CRUD operations
│   │   │   │   ├── scores/      # Score operations
│   │   │   │   ├── prompts.ts   # Prompt management
│   │   │   │   └── ...
│   │   │   ├── trpc/            # tRPC endpoint handler
│   │   │   ├── auth/            # NextAuth.js routes
│   │   │   └── billing/         # Stripe webhooks
│   │   ├── project/             # Project pages
│   │   ├── organization/        # Organization pages
│   │   └── auth/                # Auth pages
│   │
│   ├── server/                  # Server-side code
│   │   ├── api/
│   │   │   ├── root.ts         # tRPC router aggregation (40+ routers)
│   │   │   ├── trpc.ts         # tRPC middleware & procedures
│   │   │   └── routers/        # Individual tRPC routers
│   │   ├── auth.ts             # NextAuth.js configuration (929 lines)
│   │   └── db.ts               # Database client
│   │
│   ├── features/               # Feature-organized modules
│   │   ├── datasets/           # Dataset management
│   │   │   ├── server/         # Backend logic
│   │   │   │   ├── datasetRouter.ts
│   │   │   │   └── service.ts
│   │   │   ├── components/     # React components
│   │   │   └── hooks/          # Custom hooks
│   │   ├── evals/              # Evaluation system
│   │   ├── prompts/            # Prompt versioning
│   │   ├── public-api/         # API middleware & types
│   │   │   ├── server/
│   │   │   │   ├── apiAuth.ts  # API key verification
│   │   │   │   ├── withMiddlewares.ts
│   │   │   │   └── RateLimitService.ts
│   │   │   └── types/          # Zod schemas for API
│   │   ├── rbac/               # Role-based access control
│   │   │   ├── constants/      # Permission definitions
│   │   │   └── utils/          # Access check utilities
│   │   ├── entitlements/       # Plan-based feature access
│   │   ├── auth-credentials/   # Email/password auth
│   │   ├── batch-exports/      # Data export feature
│   │   ├── annotations/        # Human annotation queues
│   │   ├── automations/        # Trigger-based automations
│   │   └── ...
│   │
│   ├── components/             # Shared React components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── table/              # Data table components
│   │   └── layouts/            # Page layouts
│   │
│   ├── utils/                  # Utility functions
│   ├── hooks/                  # Shared React hooks
│   ├── styles/                 # Global styles
│   │
│   ├── __tests__/              # Jest test files
│   │   ├── async/              # Async server tests
│   │   └── *.servertest.ts     # Sync server tests
│   │
│   ├── env.mjs                 # Environment config (Zod validation)
│   ├── observability.config.ts # OpenTelemetry setup
│   └── initialize.ts           # Startup initialization
│
├── public/                     # Static assets
├── Dockerfile                  # Production container
├── entrypoint.sh              # Container startup script
├── jest.config.mjs            # Test configuration
└── next.config.mjs            # Next.js configuration
```

### `/worker/` - Background Job Processor

Express.js application that processes BullMQ jobs.

```
worker/
├── src/
│   ├── queues/                 # BullMQ queue processors
│   │   ├── workerManager.ts    # Worker lifecycle management
│   │   ├── ingestionQueue.ts   # Main data ingestion processor
│   │   ├── evalQueue.ts        # Evaluation execution
│   │   ├── batchExportQueue.ts # Data export jobs
│   │   ├── traceDeleteQueue.ts # Cascade deletion
│   │   └── ...
│   │
│   ├── services/               # Business logic
│   │   ├── IngestionService/   # Event merging & writing
│   │   │   ├── index.ts
│   │   │   └── tests/
│   │   ├── ClickhouseWriter/   # Batch ClickHouse writes
│   │   └── ...
│   │
│   ├── features/               # Worker-specific features
│   │   ├── health/             # Health check endpoints
│   │   └── ...
│   │
│   ├── __tests__/              # Vitest test files
│   │
│   ├── app.ts                  # Express app setup
│   ├── index.ts                # Entry point
│   ├── env.ts                  # Environment config
│   └── instrumentation.ts      # OpenTelemetry setup
│
├── Dockerfile                  # Production container
├── entrypoint.sh              # Container startup script
└── vitest.config.ts           # Test configuration
```

### `/packages/shared/` - Shared Code

Code shared between web and worker packages.

```
packages/shared/
├── src/
│   ├── server/                 # Server-side utilities
│   │   ├── auth/               # API key management
│   │   │   └── apiKeys.ts      # Key generation & hashing
│   │   ├── clickhouse/         # ClickHouse client
│   │   ├── redis/              # Redis & queue management
│   │   │   ├── redis.ts        # Redis client setup
│   │   │   ├── getQueue.ts     # Queue registry (23 queues)
│   │   │   ├── ingestionQueue.ts # Sharded ingestion queue
│   │   │   └── ...
│   │   ├── repositories/       # Data access layer
│   │   │   ├── traces.ts       # Trace queries
│   │   │   ├── observations.ts # Observation queries
│   │   │   ├── scores.ts       # Score queries
│   │   │   ├── clickhouse.ts   # Low-level ClickHouse
│   │   │   └── README.md       # Repository patterns
│   │   ├── services/           # Shared services
│   │   │   └── PromptService/  # Prompt caching & resolution
│   │   ├── ingestion/          # Event processing logic
│   │   │   └── processEventBatch.ts
│   │   ├── instrumentation/    # OpenTelemetry helpers
│   │   │   └── index.ts        # instrumentAsync, traceException
│   │   ├── queries/            # Query builders
│   │   │   └── clickhouse-sql/ # ClickHouse SQL generation
│   │   ├── utils/              # Server utilities
│   │   └── logger.ts           # Winston logger
│   │
│   ├── encryption/             # Encryption utilities
│   │   ├── encryption.ts       # AES-256-GCM
│   │   └── signature.ts        # HMAC signatures
│   │
│   ├── features/               # Shared feature code
│   ├── tableDefinitions/       # Table schemas
│   ├── utils/                  # Shared utilities
│   ├── errors/                 # Custom error classes
│   ├── constants.ts            # Shared constants
│   ├── db.ts                   # Prisma client export
│   ├── env.ts                  # Shared env config
│   └── index.ts                # Main exports
│
├── prisma/
│   ├── schema.prisma           # Database schema (1,520 lines)
│   ├── migrations/             # PostgreSQL migrations
│   └── seed.ts                 # Database seeding
│
├── clickhouse/
│   ├── migrations/             # ClickHouse migrations
│   │   └── unclustered/
│   │       ├── 0001_traces.up.sql
│   │       ├── 0002_observations.up.sql
│   │       └── 0003_scores.up.sql
│   └── scripts/                # Migration scripts
│
└── package.json               # Package config with exports
```

### `/ee/` - Enterprise Edition

Premium features with separate licensing.

```
ee/
└── src/
    ├── features/
    │   ├── billing/            # Stripe integration
    │   ├── multi-tenant-sso/   # Custom SSO per domain
    │   └── ...
    └── index.ts
```

### `/fern/` - API Documentation

Fern-based API documentation and SDK generation.

```
fern/
├── definition/                 # API definitions
│   ├── traces.yml
│   ├── scores.yml
│   └── ...
├── fern.config.json           # Fern configuration
└── generators.yml             # SDK generation config
```

### `/.github/` - CI/CD Configuration

```
.github/
└── workflows/
    ├── pipeline.yml           # Main CI pipeline
    ├── deploy.yml             # Deployment workflow
    ├── _deploy_ecs_service.yml # ECS deployment
    └── ...
```

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `turbo.json` | Turbo monorepo task configuration |
| `pnpm-workspace.yaml` | pnpm workspace configuration |
| `.nvmrc` | Node.js version (24) |
| `docker-compose.yml` | Production stack definition |
| `docker-compose.dev.yml` | Development environment |

---

## Import Path Conventions

### From `@langfuse/shared`

```typescript
// General types and utilities
import { CloudConfigSchema, Role } from "@langfuse/shared";

// Database client
import { prisma } from "@langfuse/shared/src/db";

// Server utilities (logging, queues, etc.)
import { logger, redis } from "@langfuse/shared/src/server";

// Encryption
import { encrypt, decrypt } from "@langfuse/shared/encryption";
```

### Path Aliases in Web

```typescript
// Components
import { Button } from "@/src/components/ui/button";

// Features
import { datasetRouter } from "@/src/features/datasets/server/datasetRouter";

// Server
import { protectedProjectProcedure } from "@/src/server/api/trpc";
```

---

## File Naming Conventions

| Pattern | Description | Example |
|---------|-------------|---------|
| `*Router.ts` | tRPC router files | `datasetRouter.ts` |
| `*Queue.ts` | Queue processor files | `evalQueue.ts` |
| `*.servertest.ts` | Server-side tests | `api-auth.servertest.ts` |
| `*.clienttest.ts` | Client-side tests | `utils.clienttest.ts` |
| `kebab-case.ts` | Public API routes | `dataset-items.ts` |
