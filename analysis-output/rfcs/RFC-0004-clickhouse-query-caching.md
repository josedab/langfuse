# RFC-0004: ClickHouse Query Result Caching

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P1
**Effort:** 2-4 weeks

---

## Summary

Implement a Redis-based query result cache for frequently-accessed ClickHouse queries to reduce database load and improve response times for dashboard and list views.

---

## Motivation

### Problem Statement

ClickHouse queries are executed on every request without caching:

1. Dashboard aggregations re-compute on each page load
2. Trace lists execute full queries for identical filters
3. `FINAL` queries are expensive (force merge operation)

### Impact

- Dashboard load times: 1-3 seconds for complex aggregations
- Database CPU spikes during concurrent access
- Redundant computation for unchanged data
- Poor user experience during peak usage

### Opportunity

Many queries are:
- **Idempotent**: Same input → same output
- **Time-bounded**: Recent data (last 24h) queried most
- **Repetitive**: Same users view same dashboards

---

## Detailed Design

### Cache Strategy

#### Cache Key Structure

```typescript
// Key format: langfuse:ch:{queryHash}:{projectId}:{paramHash}
// Example: langfuse:ch:abc123:proj-456:def789

function generateCacheKey(
  queryTemplate: string,
  projectId: string,
  params: Record<string, unknown>
): string {
  const queryHash = hash(queryTemplate).substring(0, 8);
  const paramHash = hash(JSON.stringify(sortKeys(params))).substring(0, 8);
  return `langfuse:ch:${queryHash}:${projectId}:${paramHash}`;
}
```

#### TTL Strategy

| Query Type | TTL | Rationale |
|------------|-----|-----------|
| Dashboard aggregations | 60s | Balance freshness vs performance |
| Trace lists | 30s | Moderate update frequency |
| Metrics/analytics | 300s | Historical data rarely changes |
| Single entity lookup | 10s | High update frequency |

### Implementation

#### 1. Create Cache Service

```typescript
// packages/shared/src/server/services/ClickhouseCacheService.ts

import { redis } from "../redis/redis";
import { hash } from "../utils/hash";

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  skipCacheRead?: boolean;  // Force fresh data
  skipCacheWrite?: boolean; // Don't cache result
}

export class ClickhouseCacheService {
  private static instance: ClickhouseCacheService | null = null;

  public static getInstance(): ClickhouseCacheService {
    if (!this.instance) {
      this.instance = new ClickhouseCacheService();
    }
    return this.instance;
  }

  async get<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);

    if (cached) {
      recordIncrement("langfuse.clickhouse.cache_hit");
      return JSON.parse(cached);
    }

    recordIncrement("langfuse.clickhouse.cache_miss");
    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    recordIncrement("langfuse.clickhouse.cache_set");
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      recordIncrement("langfuse.clickhouse.cache_invalidated", keys.length);
    }
  }
}
```

#### 2. Create Cached Query Wrapper

```typescript
// packages/shared/src/server/repositories/cachedClickhouse.ts

import { queryClickhouse } from "./clickhouse";
import { ClickhouseCacheService } from "../services/ClickhouseCacheService";

export async function queryClickhouseCached<T>(params: {
  query: string;
  params: Record<string, unknown>;
  projectId: string;
  cache: CacheConfig;
}): Promise<T[]> {
  const { query, params: queryParams, projectId, cache } = params;

  // Skip cache if disabled
  if (!cache.enabled || !env.LANGFUSE_CLICKHOUSE_CACHE_ENABLED) {
    return queryClickhouse<T>({ query, params: queryParams });
  }

  const cacheService = ClickhouseCacheService.getInstance();
  const cacheKey = generateCacheKey(query, projectId, queryParams);

  // Try cache first
  if (!cache.skipCacheRead) {
    const cached = await cacheService.get<T[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Execute query
  const result = await queryClickhouse<T>({ query, params: queryParams });

  // Cache result
  if (!cache.skipCacheWrite) {
    await cacheService.set(cacheKey, result, cache.ttlSeconds);
  }

  return result;
}
```

#### 3. Update Repository Functions

```typescript
// packages/shared/src/server/repositories/traces.ts

export async function getTracesTableMetrics(
  projectId: string,
  filter: FilterList,
  timeRange: TimeRange
): Promise<TraceMetrics> {
  const query = `
    SELECT
      count(DISTINCT t.id) as trace_count,
      count(DISTINCT t.user_id) as user_count,
      avg(latency_ms) as avg_latency_ms
    FROM traces t
    WHERE project_id = {projectId: String}
      AND timestamp >= {startTime: DateTime64(3)}
      AND timestamp <= {endTime: DateTime64(3)}
      ${filter.toClickhouseCondition()}
    FINAL
  `;

  return queryClickhouseCached<TraceMetrics>({
    query,
    params: { projectId, ...timeRange, ...filter.params },
    projectId,
    cache: {
      enabled: true,
      ttlSeconds: 60, // 1 minute for dashboard metrics
    },
  });
}
```

#### 4. Cache Invalidation

```typescript
// Invalidate on write operations
export async function upsertClickhouse<T>(opts: {
  table: ClickhouseTable;
  records: T[];
  projectId: string;
}): Promise<void> {
  const { table, records, projectId } = opts;

  // Write to ClickHouse
  await clickhouseClient().insert({
    table,
    values: records,
    format: "JSONEachRow",
  });

  // Invalidate related caches
  const cacheService = ClickhouseCacheService.getInstance();
  await cacheService.invalidate(`langfuse:ch:*:${projectId}:*`);
}
```

#### 5. Feature Flag Control

```typescript
// web/src/env.mjs
LANGFUSE_CLICKHOUSE_CACHE_ENABLED: z.boolean().default(false),
LANGFUSE_CLICKHOUSE_CACHE_DEFAULT_TTL: z.number().default(60),
```

### Cache Warming

For critical dashboards, pre-warm cache:

```typescript
// Pre-warm on project access
export async function warmProjectCache(projectId: string): Promise<void> {
  const timeRange = {
    startTime: subDays(new Date(), 7),
    endTime: new Date(),
  };

  // Warm common queries
  await Promise.all([
    getTracesTableMetrics(projectId, new FilterList(), timeRange),
    getObservationMetrics(projectId, new FilterList(), timeRange),
    getScoreAggregations(projectId, new FilterList(), timeRange),
  ]);
}
```

---

## Example Usage

### Before

```typescript
// Every dashboard load executes full query
const metrics = await queryClickhouse({
  query: aggregationQuery,
  params: { projectId, startTime, endTime },
});
// ~500ms per query
```

### After

```typescript
// First load: Execute and cache
const metrics = await queryClickhouseCached({
  query: aggregationQuery,
  params: { projectId, startTime, endTime },
  projectId,
  cache: { enabled: true, ttlSeconds: 60 },
});
// ~500ms (DB query)

// Subsequent loads within TTL
const metrics = await queryClickhouseCached({...});
// ~5ms (Redis cache)
```

---

## Implementation Plan

### Week 1: Core Implementation

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Create ClickhouseCacheService | Backend team |
| 3-4 | Create cached query wrapper | Backend team |
| 5 | Add feature flags and config | Backend team |

### Week 2: Integration

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Update trace repository | Backend team |
| 3-4 | Update observation/score repositories | Backend team |
| 5 | Add cache invalidation | Backend team |

### Week 3: Testing & Optimization

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Integration testing | QA team |
| 3-4 | Performance benchmarking | Backend team |
| 5 | Documentation | Backend team |

### Milestones

- [ ] Week 1: Cache service implemented
- [ ] Week 2: Repositories using cache
- [ ] Week 3: Performance validated

---

## Backwards Compatibility

### Breaking Changes

None. Caching is transparent to API consumers.

### Migration Steps

1. Deploy with cache disabled (feature flag)
2. Enable in staging for testing
3. Enable in production with monitoring
4. Tune TTLs based on metrics

---

## Alternatives Considered

### 1. ClickHouse Materialized Views

Pre-compute aggregations in ClickHouse.

**Rejected:**
- Requires schema changes
- Less flexible for dynamic queries
- Higher ClickHouse resource usage

### 2. Application-Level Memoization

Cache in Node.js process memory.

**Rejected:**
- Not shared across replicas
- Memory limits
- Lost on restart

### 3. Query Result Table

Store results in PostgreSQL.

**Rejected:**
- Adds PostgreSQL load
- Complex invalidation
- Slower than Redis

---

## Open Questions

1. **Q:** How to handle cache stampede (many requests on cold cache)?
   **A:** Implement lock-based cache warming to prevent thundering herd.

2. **Q:** Should we cache pagination?
   **A:** Cache first page only. Deeper pages rarely accessed repeatedly.

3. **Q:** How to handle real-time dashboards?
   **A:** Add `skipCache` option for explicit refresh requests.

---

## Success Criteria

- [ ] 50%+ cache hit rate for dashboard queries
- [ ] p99 dashboard latency <500ms (from 2-3s)
- [ ] 30% reduction in ClickHouse CPU during peak
- [ ] No stale data complaints from users

### Metrics to Track

```typescript
// Cache performance
"langfuse.clickhouse.cache_hit"
"langfuse.clickhouse.cache_miss"
"langfuse.clickhouse.cache_hit_rate" // Derived

// Latency comparison
"langfuse.clickhouse.query_latency_ms" // tag: cached=true|false

// Invalidation
"langfuse.clickhouse.cache_invalidated"
```

---

## Effort Estimation

- **Development:** 8 days
- **Testing:** 3 days
- **Documentation:** 1 day
- **Total:** ~12 dev-days

---

## Rollback Strategy

1. Disable feature flag `LANGFUSE_CLICKHOUSE_CACHE_ENABLED`
2. All queries bypass cache immediately
3. Flush Redis cache if needed: `redis-cli KEYS "langfuse:ch:*" | xargs redis-cli DEL`
