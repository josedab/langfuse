# Langfuse Codebase Metrics Summary

**Commit SHA:** `03edd7d9019186493b7008db9f465bf8023cf6d1`
**Analysis Date:** November 18, 2025

---

## Package Statistics

| Package | Dependencies | Dev Dependencies | Total |
|---------|--------------|------------------|-------|
| Root | 0 | 12 | 12 |
| Web | 184 | 66 | 250 |
| Worker | 47 | 26 | 73 |
| Shared | 66 | 23 | 89 |

**Total Unique Dependencies:** ~2,901 packages (including transitive)

---

## Security Vulnerabilities

| Severity | Count | Examples |
|----------|-------|----------|
| **Critical** | 1 | glob (CVE-2025-64756) |
| **High** | 7 | vite, mermaid, ws |
| **Moderate** | 11 | @babel/runtime, form-data |
| **Low** | 9 | Various transitive deps |
| **Total** | **28** | |

### Critical Issues Requiring Immediate Action

1. **glob (CVE-2025-64756)** - Command injection via `-c/--cmd` option
   - Update to ≥11.1.0
2. **vite** (3 vulnerabilities) - Update to ≥7.2.2
3. **mermaid** (3 vulnerabilities) - Update to ≥11.12.1
4. **ws** - ReDoS vulnerability - Update to ≥8.18.3

---

## Code Quality Metrics

### TypeScript Configuration

| Setting | Web | Worker | Shared |
|---------|-----|--------|--------|
| `strict` | ✅ | ✅ | ✅ |
| `strictNullChecks` | ✅ | ✅ | ✅ |
| `noUnusedLocals` | ❌ (ESLint) | ❌ (ESLint) | ❌ (ESLint) |
| `noUnusedParameters` | ❌ (ESLint) | ❌ (ESLint) | ❌ (ESLint) |
| `isolatedModules` | ✅ | ✅ | ✅ |

### ESLint Rules

- **Extends:** `@typescript-eslint/strict-type-checked`
- **Consistent Imports:** Type imports enforced
- **Icon Restrictions:** Only `lucide-react` allowed (except `react-icons/si`, `react-icons/tb`)
- **React Keys:** Error on duplicates

### Formatting

- **Tool:** Prettier v3.6.2
- **Enforcement:** Pre-commit hooks
- **Tailwind Plugin:** Class sorting enabled

---

## Testing Metrics

### Test File Counts

| Package | Test Files | Framework |
|---------|------------|-----------|
| Web (Async) | 46+ | Jest |
| Web (Sync) | 20+ | Jest |
| Web (Client) | 5+ | Jest |
| Web (E2E) | 10+ | Playwright |
| Worker | 31+ | Vitest |
| **Total** | **111+** | |

### Test Organization

| Project | Pattern | Environment |
|---------|---------|-------------|
| client | `*.clienttest.ts` | jest-environment-jsdom |
| sync-server | `*.servertest.ts` | jest-environment-node |
| async-server | `async/**/*.servertest.ts` | jest-environment-node |
| e2e-server | `__e2e__/**/*` | jest-environment-node |

### Test Coverage Areas

**Well-Covered:**
- API authentication & authorization
- Data processing & ingestion
- Rate limiting
- Query building
- Domain services (evals, webhooks, Slack)

**Needs Improvement:**
- UI component tests
- E2E coverage (Playwright config exists but underutilized)
- Coverage metrics not configured

---

## Database Metrics

### PostgreSQL (Prisma Schema)

| Entity Type | Model Count |
|-------------|-------------|
| Core Entities | 15+ |
| Configuration | 10+ |
| Integrations | 8+ |
| Audit/Logs | 5+ |
| **Total Models** | **40+** |

**Schema Size:** 1,520 lines

### ClickHouse Tables

| Table | Engine | Partitioning |
|-------|--------|--------------|
| traces | ReplacingMergeTree | Monthly (timestamp) |
| observations | ReplacingMergeTree | Monthly (start_time) |
| scores | ReplacingMergeTree | Monthly (timestamp) |

**Index Types Used:**
- Bloom filters (0.001 FP rate)
- LowCardinality optimization
- Composite indexes

---

## Queue System Metrics

### Queue Configuration

| Queue | Attempts | Backoff | removeOnFail |
|-------|----------|---------|--------------|
| IngestionQueue | 6 | Exp(5s) | 100,000 |
| OtelIngestionQueue | 6 | Exp(5s) | 100,000 |
| TraceUpsert | 5 | Exp(5s) | 100,000 |
| EvalExecutionQueue | 10 | Exp(1s) | 10,000 |
| BatchExport | 8 | Exp(5s) | 10,000 |
| ProjectDelete | 10 | Exp(5s) | 100,000 |
| EntityChangeQueue | 5 | Exp(5s) | 100,000 |
| EventPropagationQueue | 3 | Exp(5s) | 100 |

**Total Queues:** 23

### Sharding

- **Ingestion Queue:** Configurable shards via `LANGFUSE_INGESTION_QUEUE_SHARD_COUNT`
- **Hash Function:** SHA-256 based consistent hashing
- **Key Format:** `${projectId}-${eventBodyId}`

---

## Authorization Metrics

### RBAC Scopes

| Level | Scope Count |
|-------|-------------|
| Project | 48 |
| Organization | 8 |
| **Total** | **56** |

### Project Permission Categories

| Category | Count |
|----------|-------|
| Members Management | 2 |
| API Keys | 2 |
| Data Operations | 6 |
| Configuration | 8 |
| Evaluations | 4 |
| Advanced Features | 6 |
| **Total** | **48** |

### Role Hierarchy

| Role | Project Level | Org Level |
|------|---------------|-----------|
| OWNER | 4 | Full + Billing |
| ADMIN | 3 | Management |
| MEMBER | 2 | Read list |
| VIEWER | 1 | None |
| NONE | 0 | None |

---

## Authentication Metrics

### Supported Providers

| Category | Count | Examples |
|----------|-------|----------|
| Standard OAuth | 8 | Google, GitHub, GitLab, Azure AD |
| Enterprise | 8 | Okta, Auth0, Cognito, WorkOS |
| Custom | 1 | OpenID Connect |
| Credentials | 1 | Email/Password |
| **Total** | **18** | |

### Security Measures

| Measure | Configuration |
|---------|---------------|
| Session Max Age | 30 days (configurable) |
| Password Min Length | 8 characters |
| bcrypt Cost Factor | 12 |
| API Key Cache TTL | 300 seconds |
| OTP Expiry | 3 minutes |

---

## Observability Metrics

### OpenTelemetry Instrumentations

| Instrumentation | Package |
|-----------------|---------|
| HTTP | @opentelemetry/instrumentation-http |
| Express | @opentelemetry/instrumentation-express |
| Redis | @opentelemetry/instrumentation-ioredis |
| Prisma | @prisma/instrumentation |
| BullMQ | @appsignal/opentelemetry-instrumentation-bullmq |
| Winston | @opentelemetry/instrumentation-winston |
| AWS SDK | @opentelemetry/instrumentation-aws-sdk |
| **Total** | **7** |

### Logging Configuration

| Setting | Default |
|---------|---------|
| Level | info |
| Format | text |
| Trace Context | Injected (dd.trace_id, span_id) |

---

## Dependency Categories

### By Function

| Category | Package Count |
|----------|---------------|
| Core Frameworks | 6 |
| Database/ORM | 5 |
| Authentication | 3 |
| Queue System | 2 |
| UI Libraries | 15+ |
| Validation | 3 |
| LLM Integration | 10+ |
| Cloud Storage | 6 |
| Observability | 15+ |
| Testing | 8 |
| Build Tools | 10+ |

### Notable Heavy Dependencies

| Package | Concern |
|---------|---------|
| lodash | Could use native JS alternatives |
| @mui/material | Duplicates shadcn/ui |
| LangChain ecosystem | 8+ packages, bundle-heavy |
| OpenTelemetry | 15+ packages |

---

## CI/CD Pipeline Metrics

### GitHub Actions Jobs

| Job Type | Count |
|----------|-------|
| Linting | 2 |
| Testing | 6 |
| Build | 1 |
| Deployment | 3 |
| **Total** | **12** |

### Test Matrix

| Dimension | Values |
|-----------|--------|
| Node Version | 24 |
| PostgreSQL | 12, 15 |
| Deployment Mode | default, Azure, Redis Cluster |

### Deployment Targets

| Environment | Description |
|-------------|-------------|
| staging | Development testing |
| prod-eu | EU production |
| prod-us | US production |
| prod-hipaa | HIPAA-compliant |

---

## Performance Benchmarks (Estimated)

| Operation | Throughput |
|-----------|------------|
| Ingestion (per shard) | 100-500 events/sec |
| ClickHouse writes | Limited by batch size |
| API key validation | ~1ms (cached) |
| TraceUpsert | 1000-5000 merges/sec |

### Caching TTLs

| Cache | TTL |
|-------|-----|
| API Key | 300 seconds |
| Prompt | Configurable (default ~5 min) |
| Eval Config (negative) | 600 seconds |
| Event Dedup | 300 seconds |

---

## Summary Scorecard

| Category | Rating | Notes |
|----------|--------|-------|
| **Type Safety** | ★★★★★ | Full TypeScript with strict mode |
| **Testing** | ★★★★☆ | Good coverage, needs UI/E2E improvement |
| **Security** | ★★★★☆ | Strong foundation, 28 vulnerabilities to address |
| **Documentation** | ★★★★☆ | Feature READMEs, needs API docs |
| **Code Organization** | ★★★★★ | Clear feature-based structure |
| **Performance** | ★★★★☆ | Scalable design, some bottlenecks |
| **Observability** | ★★★★★ | Comprehensive OTEL integration |
| **CI/CD** | ★★★★★ | Multi-environment, thorough testing |
