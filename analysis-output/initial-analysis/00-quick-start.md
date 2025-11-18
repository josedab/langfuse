# Langfuse Codebase Analysis: Quick Start Guide

**Analysis Date:** November 18, 2025
**Commit SHA:** `03edd7d9019186493b7008db9f465bf8023cf6d1`
**Analyst:** Claude Code Analysis

---

## Executive Summary

Langfuse is an **open-source LLM engineering platform** built as a modern TypeScript monorepo. It provides tracing, evaluation, and prompt management capabilities for AI applications.

### Key Numbers at a Glance

| Metric | Value |
|--------|-------|
| **Total Dependencies** | 2,901 packages |
| **Security Vulnerabilities** | 28 (1 critical, 7 high) |
| **Prisma Schema** | 1,520 lines |
| **Test Files** | 111+ (80 web, 31+ worker) |
| **BullMQ Queues** | 23 distinct queues |
| **RBAC Scopes** | 48 project + 8 organization |

---

## Architecture Overview

Langfuse employs a **Hybrid Layered + Event-Driven Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                         │
│  (React UI, SDKs, API Consumers)                       │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Web Application (Next.js 14)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   tRPC API  │  │ Public REST │  │  NextAuth   │     │
│  │  (UI/React) │  │  (SDKs)     │  │  (Auth)     │     │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘     │
│         │                │                              │
│  ┌──────▼────────────────▼──────┐                      │
│  │      Service Layer           │                      │
│  │  (Business Logic)            │                      │
│  └──────────────┬───────────────┘                      │
└─────────────────┼───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              Data & Queue Layer                         │
│  ┌──────────┐  ┌───────────┐  ┌───────┐  ┌──────────┐  │
│  │PostgreSQL│  │ClickHouse │  │ Redis │  │ S3/MinIO │  │
│  │  (OLTP)  │  │  (OLAP)   │  │(Queue)│  │  (Blob)  │  │
│  └──────────┘  └───────────┘  └───┬───┘  └──────────┘  │
└──────────────────────────────────┼──────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────┐
│              Worker Application (Express)               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  BullMQ Processors (23 queues)                  │   │
│  │  - Ingestion, Evaluation, Export, Deletion...   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Top 5 Things to Know

### 1. Dual Database System
- **PostgreSQL**: User data, configuration, metadata (via Prisma ORM)
- **ClickHouse**: High-volume traces, observations, scores (analytics)
- Data flows from API → S3 → Redis Queue → Worker → ClickHouse

### 2. Type-Safe End-to-End
- **tRPC**: Type-safe client-server communication
- **Zod v4**: Runtime validation for all inputs
- **Prisma**: Type-safe database access
- Full TypeScript with strict mode enabled

### 3. Feature-Based Organization
```
web/src/features/[feature-name]/
├── server/           # tRPC routers, services
├── components/       # React components
├── hooks/           # Custom React hooks
└── README.md        # Feature documentation
```

### 4. Async-First Processing
- 23 BullMQ queues handle background work
- Critical path: Ingestion → S3 → Queue → ClickHouse
- Retry with exponential backoff (5s base, 6 attempts)

### 5. Comprehensive Security
- RBAC with 48 project-level scopes
- AES-256-GCM encryption for sensitive data
- API key caching with 5-minute TTL
- Multi-tenant isolation via projectId filtering

---

## Critical Files to Start With

| Purpose | File Path |
|---------|-----------|
| **Entry Point** | `web/src/pages/_app.tsx` |
| **tRPC Root** | `web/src/server/api/root.ts` |
| **Auth Config** | `web/src/server/auth.ts` |
| **Database Schema** | `packages/shared/prisma/schema.prisma` |
| **Queue Registry** | `packages/shared/src/server/redis/getQueue.ts` |
| **Ingestion Pipeline** | `packages/shared/src/server/ingestion/processEventBatch.ts` |
| **Worker Manager** | `worker/src/queues/workerManager.ts` |

---

## Development Quick Start

```bash
# Prerequisites: Node.js 24, pnpm 9.5.0, Docker

# Start infrastructure
pnpm run infra:dev:up

# Install dependencies
pnpm i

# Generate Prisma client
pnpm --filter=@langfuse/shared run db:generate

# Run migrations
pnpm --filter=@langfuse/shared run db:migrate

# Start development servers
pnpm run dev:web    # Web at localhost:3000
pnpm run dev:worker # Worker at localhost:3030

# Login credentials (with seed data)
# Email: demo@langfuse.com
# Password: password
```

---

## Key Trade-offs Made

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| **Dual DB** | Operational complexity | Separates OLTP/OLAP workloads |
| **Event-driven** | Eventual consistency | Enables horizontal scaling |
| **Pages Router** | Missing App Router features | Stability over cutting-edge |
| **BullMQ** | Redis dependency | Proven reliability at scale |
| **Monorepo** | Build complexity | Code sharing, atomic changes |

---

## Security Highlights

- **Authentication**: NextAuth.js with 16+ OAuth providers
- **Authorization**: Role-based with organization + project levels
- **Encryption**: AES-256-GCM for secrets, bcrypt for passwords
- **Rate Limiting**: Plan-based limits (Redis-backed)
- **API Security**: Basic Auth (full access) or Bearer (limited)

---

## Known Issues & Concerns

### Security Vulnerabilities (Immediate Action)
1. **Critical**: glob CVE-2025-64756 - Update to ≥11.1.0
2. **High**: vite vulnerabilities - Update to ≥7.2.2
3. **High**: mermaid vulnerabilities - Update to ≥11.12.1

### Technical Debt
1. Stripe version mismatch (web: 18.5.0, worker: 17.4.0)
2. Beta dependencies (Tremor 4.0.0-beta)
3. Duplicate UI libraries (MUI + Radix + headlessui)

### Performance Bottlenecks
1. S3 LIST operations during event batch processing
2. Sequential cache invalidation in bulk updates
3. ClickHouse write batching under high load

---

## Next Steps for Readers

1. **Understand Data Flow**: Read `02-data-flow.mermaid` diagram
2. **Explore Architecture**: Read Blog 1 for detailed architecture overview
3. **Deep Dive Features**: Read Blog 2 for tracing system internals
4. **Review RFCs**: Check prioritization matrix for improvement opportunities

---

## Document Index

### Initial Analysis
- `00-quick-start.md` - This document
- `repository-structure.md` - Directory tree with descriptions
- `dependency-graph.md` - Visual dependency relationships
- `metrics-summary.md` - Quantitative metrics
- `terminology-glossary.md` - Project-specific terms

### Blog Series
- `01-architecture-overview.md` - Architecture and core concepts
- `02-deep-dive-tracing.md` - Tracing system internals
- `03-patterns-practices.md` - Design patterns used
- `04-extending-integrating.md` - Extension points and APIs
- `05-performance-analysis.md` - Performance characteristics

### RFCs
- `00-prioritization-matrix.md` - Impact vs effort analysis
- `RFC-0001` through `RFC-0008` - Improvement proposals

### Diagrams
- `architecture-overview.mermaid` - System architecture
- `data-flow.mermaid` - Data ingestion flow
- `auth-flow.mermaid` - Authentication sequence
