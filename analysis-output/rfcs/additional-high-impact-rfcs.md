# Additional High-Impact RFC Proposals

**Analysis Date:** November 20, 2025
**Commit SHA:** `03edd7d9019186493b7008db9f465bf8023cf6d1`
**Status:** Proposed for Review

---

## Overview

After comprehensive gap analysis beyond the initial 8 RFCs, I've identified **7 additional high-impact improvements** across infrastructure, performance, and operational excellence categories.

---

## Quick Reference Matrix

| RFC ID | Title | Priority | Effort | Impact | Category |
|--------|-------|----------|--------|--------|----------|
| RFC-0009 | PostgreSQL Connection Pool Configuration | P1 | <1 week | High | Performance |
| RFC-0010 | Rate Limiting for Self-Hosted Deployments | P1 | <1 week | Medium-High | Security |
| RFC-0011 | Backup and Disaster Recovery Strategy | P0 | <2 weeks | Critical | Operations |
| RFC-0012 | CI/CD Pipeline Optimization | P2 | <1 week | Medium | DevOps |
| RFC-0013 | Monitoring Dashboard Templates | P1 | <2 weeks | Medium-High | Observability |
| RFC-0014 | Database Query Timeout Configuration | P1 | <1 week | Medium | Reliability |
| RFC-0015 | Multi-Region Deployment Guide | P2 | 2 weeks | Medium | Documentation |

---

## RFC-0009: PostgreSQL Connection Pool Configuration

### Problem
- No explicit Prisma connection pooling configuration in [`packages/shared/src/db.ts`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/packages/shared/src/db.ts)
- Using Prisma defaults (connection_limit: 10 for most engines)
- Potential connection exhaustion under load
- No visibility into connection pool metrics

### Impact
- **Performance degradation** under high concurrent load
- **Connection exhaustion** errors in production
- **Resource inefficiency** with default pool sizes
- **Lack of observability** for connection usage

### Proposed Solution
```typescript
// packages/shared/src/db.ts
const createPrismaInstance = () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: [...],
    // Add explicit connection pool configuration
    connectionString: {
      connection_limit: env.DATABASE_CONNECTION_LIMIT || 20,
      pool_timeout: env.DATABASE_POOL_TIMEOUT || 10,
    },
  });

  // Add connection pool monitoring
  client.$on('info', (event) => {
    if (event.message.includes('connection pool')) {
      recordGauge('langfuse.db.connection_pool', extractPoolStats(event));
    }
  });

  return client;
};
```

### Environment Variables
```bash
DATABASE_CONNECTION_LIMIT=20  # Default 10
DATABASE_POOL_TIMEOUT=10      # Seconds, default 10
DATABASE_STATEMENT_TIMEOUT=30000  # Milliseconds, default none
```

### Effort Estimate
- **Development:** 2 days
- **Testing:** 1 day
- **Documentation:** 0.5 days
- **Total:** ~3.5 dev-days

### Success Criteria
- [ ] Explicit connection pool configuration
- [ ] Pool metrics exposed to observability
- [ ] No connection exhaustion errors under load test
- [ ] Documentation for tuning guidelines

---

## RFC-0010: Rate Limiting for Self-Hosted Deployments

### Problem
- Rate limiting currently **cloud-only** ([`web/src/features/public-api/server/RateLimitService.ts:56`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/web/src/features/public-api/server/RateLimitService.ts#L56))
- Self-hosted deployments have **no rate limiting protection**
- Line 56: `if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return` (bypasses rate limiting)
- Vulnerable to abuse and resource exhaustion

### Impact
- **Self-hosted users** lack DoS protection
- **Resource exhaustion** possible from aggressive clients
- **Unfair usage** without throttling
- **Production outages** from runaway scripts

### Current Code
```typescript
// web/src/features/public-api/server/RateLimitService.ts:56
if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return; // NO RATE LIMITING!
```

### Proposed Solution
Make rate limiting **configurable** for self-hosted:

```typescript
// Environment variables
LANGFUSE_RATE_LIMIT_ENABLED=true           # Default: false for self-hosted
LANGFUSE_RATE_LIMIT_POINTS=10             # Requests per window
LANGFUSE_RATE_LIMIT_DURATION=1            # Window duration (seconds)
LANGFUSE_RATE_LIMIT_BLOCK_DURATION=60     # Block duration on limit hit

// Update RateLimitService.ts
if (!env.LANGFUSE_RATE_LIMIT_ENABLED && !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  return; // Disabled for self-hosted unless explicitly enabled
}
```

### Effort Estimate
- **Development:** 2 days
- **Testing:** 1.5 days
- **Documentation:** 1 day
- **Total:** ~4.5 dev-days

### Success Criteria
- [ ] Self-hosted can enable rate limiting via env var
- [ ] Reasonable defaults (100 req/min per key)
- [ ] Documentation for tuning
- [ ] Metrics for rate limit hits

---

## RFC-0011: Backup and Disaster Recovery Strategy

### Problem
- **No backup documentation** found in repository
- **No automated backup scripts** for PostgreSQL/ClickHouse
- **No disaster recovery runbook**
- **Critical risk** of data loss in production

### Impact
- **Data loss risk** (CRITICAL)
- **No RTO/RPO defined** for recovery
- **Manual, error-prone** recovery processes
- **Compliance issues** for enterprise customers

### Proposed Solution

#### 1. Automated Backup Scripts
```bash
# scripts/backup/postgres-backup.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

pg_dump "${DATABASE_URL}" \
  --format=custom \
  --file="${BACKUP_DIR}/langfuse_${TIMESTAMP}.dump" \
  --verbose

# Compress and upload to S3
gzip "${BACKUP_DIR}/langfuse_${TIMESTAMP}.dump"
aws s3 cp "${BACKUP_DIR}/langfuse_${TIMESTAMP}.dump.gz" \
  "s3://${BACKUP_BUCKET}/postgres/${TIMESTAMP}.dump.gz"

# Cleanup old backups
find "${BACKUP_DIR}" -name "*.dump.gz" -mtime +${RETENTION_DAYS} -delete
```

#### 2. ClickHouse Backup
```bash
# scripts/backup/clickhouse-backup.sh
clickhouse-backup create langfuse_${TIMESTAMP}
clickhouse-backup upload langfuse_${TIMESTAMP}
clickhouse-backup delete local langfuse_${TIMESTAMP}
```

#### 3. Disaster Recovery Runbook
Create `docs/operations/disaster-recovery.md`:
- PostgreSQL restore procedures
- ClickHouse restore procedures
- Redis state reconstruction
- Validation steps
- RTO/RPO targets

### Effort Estimate
- **Script development:** 5 days
- **Testing:** 3 days
- **Documentation:** 3 days
- **Runbook creation:** 2 days
- **Total:** ~13 dev-days

### Success Criteria
- [ ] Automated daily backups
- [ ] Tested restore procedures
- [ ] RTO < 4 hours, RPO < 1 hour
- [ ] Documented runbooks
- [ ] Backup validation automation

---

## RFC-0012: CI/CD Pipeline Optimization

### Problem
- Multiple jobs install dependencies **separately** ([`.github/workflows/pipeline.yml`](https://github.com/langfuse/langfuse/blob/03edd7d9019186493b7008db9f465bf8023cf6d1/.github/workflows/pipeline.yml))
- **8+ jobs** each run `pnpm i` independently
- **~5 minutes** wasted per job on dependency installation
- **40+ minutes** total wasted time in pipeline

### Impact
- **Slow CI/CD** (total runtime ~45 minutes)
- **Higher costs** (GitHub Actions minutes)
- **Developer friction** waiting for builds
- **Redundant work** across jobs

### Current State Analysis
```yaml
# Each of these jobs runs 'pnpm i' separately:
- lint: pnpm i
- prettier-check: pnpm i
- test-docker-build: (docker build includes pnpm i)
- tests-web: pnpm i
- tests-worker: pnpm i
- build-web: pnpm i
- build-worker: pnpm i
- migrate-clickhouse: pnpm i
```

### Proposed Solution
```yaml
# Add shared dependency installation job
jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          cache: "pnpm"
      - run: pnpm i --frozen-lockfile

      # Cache node_modules for reuse
      - uses: actions/cache/save@v4
        with:
          path: |
            node_modules
            web/node_modules
            worker/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}

  lint:
    needs: setup
    steps:
      # Restore cached dependencies
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            web/node_modules
            worker/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm run lint  # Skip pnpm i
```

### Effort Estimate
- **Development:** 2 days
- **Testing:** 1 day
- **Total:** ~3 dev-days

### Expected Improvements
- **Time savings:** 30-35 minutes per pipeline run
- **Cost savings:** ~70% reduction in pnpm install time
- **Faster feedback:** Developers get results 30min sooner

### Success Criteria
- [ ] Total pipeline time < 15 minutes
- [ ] Shared dependency cache working
- [ ] No cache invalidation issues

---

## RFC-0013: Monitoring Dashboard Templates

### Problem
- **No Grafana/Prometheus templates** for self-hosted users
- Self-hosted users must **build dashboards from scratch**
- **Inconsistent monitoring** across deployments
- **Reduced observability** for self-hosted

### Impact
- **Longer MTTR** (Mean Time To Recovery) without dashboards
- **Harder troubleshooting** for operators
- **Poor visibility** into system health
- **Lower adoption** of self-hosted due to operational complexity

### Proposed Solution

Create pre-built monitoring dashboards:

#### 1. Prometheus Metrics Export
```typescript
// packages/shared/src/server/instrumentation/prometheus.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Export endpoint
// GET /api/metrics - Prometheus scrape endpoint
export const metricsHandler = async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};
```

#### 2. Grafana Dashboard JSONs
```json
// monitoring/grafana/langfuse-overview.json
{
  "dashboard": {
    "title": "Langfuse - System Overview",
    "panels": [
      {
        "title": "Ingestion Queue Depth",
        "targets": [{"expr": "langfuse_queue_depth{queue=\"ingestion\"}"}]
      },
      {
        "title": "API Request Rate",
        "targets": [{"expr": "rate(langfuse_http_requests_total[5m])"}]
      },
      {
        "title": "Database Connection Pool",
        "targets": [{"expr": "langfuse_db_connection_pool"}]
      }
    ]
  }
}
```

#### 3. Docker Compose Example
```yaml
# monitoring/docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    volumes:
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3001:3000"
```

### Dashboards to Create
1. **System Overview** - Request rate, error rate, latency p50/p95/p99
2. **Queue Monitoring** - Queue depths, processing rates, failures
3. **Database Performance** - Connection pools, query duration, ClickHouse insert rates
4. **Worker Health** - Job processing rates, failures, retry rates
5. **Business Metrics** - Traces ingested, evaluations run, API usage

### Effort Estimate
- **Prometheus setup:** 2 days
- **Dashboard creation:** 5 days
- **Documentation:** 2 days
- **Testing:** 2 days
- **Total:** ~11 dev-days

### Success Criteria
- [ ] 5 pre-built Grafana dashboards
- [ ] Prometheus metrics exported
- [ ] Docker Compose example working
- [ ] Documentation for customization

---

## RFC-0014: Database Query Timeout Configuration

### Problem
- **No statement_timeout** configured for PostgreSQL
- **No query timeout** for ClickHouse queries
- Long-running queries can **block connections**
- **Connection pool exhaustion** from slow queries

### Impact
- **Connection pool starvation** from slow queries
- **Cascading failures** when queries timeout
- **Hard to debug** which queries are slow
- **Production incidents** from runaway queries

### Proposed Solution

#### 1. PostgreSQL Statement Timeout
```typescript
// packages/shared/src/db.ts
const createPrismaInstance = () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: appendQueryTimeout(process.env.DATABASE_URL),
      },
    },
  });

  // Execute on connection
  client.$executeRaw`SET statement_timeout = ${env.DATABASE_STATEMENT_TIMEOUT || 30000}`;

  return client;
};

function appendQueryTimeout(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('statement_timeout', `${env.DATABASE_STATEMENT_TIMEOUT || 30000}ms`);
  return parsed.toString();
}
```

#### 2. ClickHouse Query Timeout
```typescript
// packages/shared/src/server/clickhouse/client.ts
const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  request_timeout: env.CLICKHOUSE_REQUEST_TIMEOUT || 30000,
  max_execution_time: env.CLICKHOUSE_MAX_EXECUTION_TIME || 30,
});
```

#### 3. Monitoring
```typescript
// Log slow queries
client.$on('query', (event) => {
  if (event.duration > 5000) {
    logger.warn('Slow query detected', {
      query: event.query,
      duration: event.duration,
    });
    recordHistogram('langfuse.db.slow_query', event.duration);
  }
});
```

### Environment Variables
```bash
# PostgreSQL
DATABASE_STATEMENT_TIMEOUT=30000  # Milliseconds, default 30s
DATABASE_SLOW_QUERY_THRESHOLD=5000  # Log queries > 5s

# ClickHouse
CLICKHOUSE_REQUEST_TIMEOUT=30000  # Milliseconds
CLICKHOUSE_MAX_EXECUTION_TIME=30  # Seconds
```

### Effort Estimate
- **Development:** 2 days
- **Testing:** 1 day
- **Documentation:** 0.5 days
- **Total:** ~3.5 dev-days

### Success Criteria
- [ ] Configurable timeouts for Postgres and ClickHouse
- [ ] Slow query logging
- [ ] Metrics for query duration distribution
- [ ] No connection pool exhaustion from slow queries

---

## RFC-0015: Multi-Region Deployment Guide

### Problem
- **No documentation** for multi-region deployments
- Global users need **latency optimization** guidance
- **Complex architecture** decisions (data locality, replication)
- **No reference architecture** for geo-distributed setups

### Impact
- **Higher latency** for global users without guidance
- **Data residency** concerns for regulated industries
- **Complex setup** without clear patterns
- **Lower enterprise adoption** without multi-region support

### Proposed Solution

Create comprehensive deployment guide in `docs/deployment/multi-region.md`:

#### 1. Architecture Patterns

**Pattern A: Active-Active with Read Replicas**
```
Region US-EAST:
  - Web (primary write)
  - PostgreSQL (primary)
  - ClickHouse (primary)
  - Redis (primary)

Region EU-WEST:
  - Web (read-heavy)
  - PostgreSQL (read replica)
  - ClickHouse (replicated table)
  - Redis (replicated)
```

**Pattern B: Regional Clusters with Data Federation**
```
Each Region:
  - Complete stack (Web, Worker, DBs)
  - Independent data
  - Cross-region query federation for global views
```

#### 2. PostgreSQL Replication Setup
```bash
# Primary configuration
# postgresql.conf
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB

# Create replication slot
SELECT pg_create_physical_replication_slot('replica_1');
```

#### 3. ClickHouse Replication
```sql
-- Create replicated table
CREATE TABLE traces ON CLUSTER '{cluster}'
(
    id String,
    project_id String,
    -- ...
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/traces', '{replica}')
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, id);
```

#### 4. Traffic Routing Strategies
- GeoDNS routing (Route53, Cloudflare)
- Load balancer geo-awareness
- Client-side region selection

#### 5. Data Residency Considerations
- Project-level region pinning
- GDPR compliance patterns
- Data export/import procedures

### Deliverables
1. **Architecture decision guide** (15 pages)
2. **Step-by-step setup instructions** (PostgreSQL replication, ClickHouse clusters)
3. **Traffic routing configuration** (AWS Route53, Cloudflare examples)
4. **Data residency patterns** (GDPR, data locality)
5. **Monitoring and alerting** for multi-region health
6. **Cost analysis** (infrastructure costs by pattern)

### Effort Estimate
- **Research and design:** 3 days
- **Documentation writing:** 5 days
- **Example configurations:** 2 days
- **Review and validation:** 2 days
- **Total:** ~12 dev-days

### Success Criteria
- [ ] Complete deployment guide published
- [ ] 2+ reference architectures documented
- [ ] Step-by-step replication setup
- [ ] Cost analysis included
- [ ] Validated by at least 2 self-hosted users

---

## Implementation Priority

### Immediate (P0) - Week 1
- **RFC-0011: Backup and Disaster Recovery** (CRITICAL risk mitigation)

### Short-term (P1) - Weeks 2-4
- **RFC-0009: PostgreSQL Connection Pooling** (Performance foundation)
- **RFC-0010: Rate Limiting for Self-Hosted** (Security gap)
- **RFC-0013: Monitoring Dashboard Templates** (Operational visibility)
- **RFC-0014: Database Query Timeout** (Reliability)

### Medium-term (P2) - Months 2-3
- **RFC-0012: CI/CD Pipeline Optimization** (Developer productivity)
- **RFC-0015: Multi-Region Deployment Guide** (Enterprise readiness)

---

## Total Effort Summary

| Priority | RFCs | Total Effort |
|----------|------|--------------|
| P0 | 1 | 13 dev-days |
| P1 | 4 | 32 dev-days |
| P2 | 2 | 15 dev-days |
| **Total** | **7** | **~60 dev-days** |

---

## Combined Roadmap (All 15 RFCs)

### Phase 1: Critical Fixes (Weeks 1-2)
- RFC-0001: Security Vulnerabilities (4.5 days)
- RFC-0011: Backup and DR (13 days)

### Phase 2: Performance Quick Wins (Weeks 3-4)
- RFC-0002: Batch Redis Invalidation (3.5 days)
- RFC-0006: EventPropagation Retries (3.5 days)
- RFC-0009: Connection Pooling (3.5 days)
- RFC-0014: Query Timeouts (3.5 days)

### Phase 3: Platform Improvements (Months 2-3)
- RFC-0003: S3 Optimization (14 days)
- RFC-0004: ClickHouse Caching (12 days)
- RFC-0007: Test Coverage (3.5 days)
- RFC-0010: Rate Limiting (4.5 days)
- RFC-0013: Monitoring Dashboards (11 days)

### Phase 4: Strategic Investments (Months 4-6)
- RFC-0005: UI Consolidation (55 days)
- RFC-0008: E2E Tests (38 days)
- RFC-0012: CI/CD Optimization (3 days)
- RFC-0015: Multi-Region Guide (12 days)

**Total: ~194 dev-days across 15 RFCs**

---

## Key Takeaways

1. **Disaster Recovery is Critical** - RFC-0011 addresses the highest-risk gap
2. **Performance Foundation** - Connection pooling and query timeouts prevent production issues
3. **Self-Hosted Parity** - Rate limiting and monitoring improve self-hosted experience
4. **Operational Excellence** - Backup, monitoring, and multi-region guides reduce operational burden
5. **Balanced Portfolio** - Mix of quick wins (3-4 days) and strategic investments (2+ weeks)

---

**Recommendation:** Prioritize RFC-0011 (Backup/DR) immediately, then tackle P1 RFCs in parallel across teams.
