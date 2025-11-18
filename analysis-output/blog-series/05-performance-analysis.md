# Performance Analysis and Optimization Opportunities

**Part 5 of 5 in the Langfuse Technical Deep Dive Series**

*Analysis based on commit `03edd7d9019186493b7008db9f465bf8023cf6d1`*

---

## What You'll Learn

- Queue system architecture and sharding strategies
- ClickHouse optimization patterns
- Caching strategies (Redis and in-memory)
- Identified bottlenecks and solutions
- Scaling recommendations for production

---

## Introduction

In this final installment, we examine Langfuse's performance characteristics. Understanding these patterns is essential for operating Langfuse at scale and identifying optimization opportunities.

---

## Queue System Architecture

### The 23 Queues

Langfuse uses BullMQ with Redis for background processing:

| Queue | Purpose | Retry Attempts | Backoff |
|-------|---------|----------------|---------|
| IngestionQueue | Event processing | 6 | Exp(5s) |
| OtelIngestionQueue | OpenTelemetry events | 6 | Exp(5s) |
| TraceUpsert | Trace merging | 5 | Exp(5s) |
| EvalExecutionQueue | Evaluation runs | 10 | Exp(1s) |
| BatchExport | Data exports | 8 | Exp(5s) |
| ProjectDelete | Cascade deletion | 10 | Exp(5s) |
| EntityChangeQueue | Change propagation | 5 | Exp(5s) |
| EventPropagationQueue | Event broadcast | 3 | Exp(5s) |
| ... | 15 more queues | ... | ... |

### Queue Configuration

```typescript
// From: packages/shared/src/server/redis/getQueue.ts

const defaultJobOptions = {
  removeOnComplete: true,      // Clean up completed jobs
  removeOnFail: 100_000,       // Keep failed jobs for debugging
  attempts: 6,                 // Retry up to 6 times
  backoff: {
    type: "exponential",
    delay: 5000,               // 5s, 10s, 20s, 40s, 80s, 160s
  },
};
```

### Sharding Strategy

Ingestion queues use consistent hashing:

```typescript
// From: packages/shared/src/server/redis/sharding.ts

export function getShardIndex(
  key: string,
  shardCount: number
): number {
  // SHA-256 hash of key
  const hash = crypto
    .createHash("sha256")
    .update(key)
    .digest("hex");

  // Convert first 8 hex chars to number
  const num = parseInt(hash.substring(0, 8), 16);

  // Modulo for shard index
  return num % shardCount;
}

// Usage
const shardIndex = getShardIndex(
  `${projectId}-${eventBodyId}`,
  env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT
);

const queue = IngestionQueue.getInstance({
  shardName: `ingestion-${shardIndex}`,
});
```

**Benefits**:
- Events for same entity go to same worker (ordering)
- Load distributed across workers
- No coordination required

### Worker Management

```typescript
// From: worker/src/queues/workerManager.ts

export class WorkerManager {
  private workers: Map<string, Worker> = new Map();

  async start(): Promise<void> {
    // Start workers for each queue
    for (const queueName of QUEUE_NAMES) {
      const worker = new Worker(
        queueName,
        getProcessor(queueName),
        {
          connection: redis,
          concurrency: getConcurrency(queueName),
          limiter: getLimiter(queueName),
        }
      );

      // Error handling
      worker.on("failed", (job, error) => {
        logger.error("Job failed", {
          queue: queueName,
          jobId: job?.id,
          error: error.message,
        });

        recordIncrement(`langfuse.queue.${queueName}.failed`);
      });

      this.workers.set(queueName, worker);
    }
  }

  async shutdown(): Promise<void> {
    // Graceful shutdown
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info("Worker stopped", { queue: name });
    }
  }
}
```

---

## ClickHouse Optimization

### Table Engine Selection

ReplacingMergeTree handles updates efficiently:

```sql
-- From: packages/shared/clickhouse/migrations/unclustered/0001_traces.up.sql

ENGINE = ReplacingMergeTree(event_ts, is_deleted)
```

**How it works**:
1. Each write adds a new row
2. `event_ts` determines version ordering
3. `is_deleted = 1` marks soft deletes
4. Background merges keep latest version

**Query Pattern**:

```sql
SELECT *
FROM traces
WHERE project_id = {projectId}
  AND id = {traceId}
FINAL  -- Force merge to get latest version
```

### Indexing Strategy

```sql
-- Primary key for partition pruning
PRIMARY KEY (project_id, toDate(timestamp))
ORDER BY (project_id, toDate(timestamp), id)

-- Bloom filters for existence checks
INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1
INDEX idx_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
INDEX idx_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
```

### Column Optimizations

```sql
-- LowCardinality for enum-like columns
type LowCardinality(String)      -- SPAN, GENERATION, EVENT
level LowCardinality(String)     -- DEBUG, DEFAULT, WARNING, ERROR

-- Compression for large text
input Nullable(String) CODEC(ZSTD(3))
output Nullable(String) CODEC(ZSTD(3))

-- High precision for costs
cost_details Map(LowCardinality(String), Decimal64(12))
```

### Batch Writing

```typescript
// From: worker/src/services/ClickhouseWriter/index.ts

export class ClickhouseWriter {
  private queues: Map<TableName, QueuedRecord[]> = new Map();
  private flushInterval: number = 5000; // 5 seconds
  private batchSize: number = 1000;

  async enqueue(table: TableName, record: Record): Promise<void> {
    const queue = this.queues.get(table) || [];
    queue.push(record);
    this.queues.set(table, queue);

    // Flush if batch size reached
    if (queue.length >= this.batchSize) {
      await this.flush(table);
    }
  }

  async flushAll(): Promise<void> {
    // Flush all tables in parallel
    await Promise.all(
      Array.from(this.queues.keys()).map((table) => this.flush(table))
    );
  }

  private async flush(table: TableName): Promise<void> {
    const records = this.queues.get(table) || [];
    if (records.length === 0) return;

    const startTime = Date.now();

    try {
      await upsertClickhouse({
        table,
        records,
        eventBodyMapper: getMapper(table),
      });

      recordHistogram(
        "langfuse.clickhouse.write_latency_ms",
        Date.now() - startTime,
        { table }
      );

      recordIncrement(
        "langfuse.clickhouse.rows_written",
        records.length,
        { table }
      );
    } catch (error) {
      // Handle oversized batches
      if (error.message.includes("TOO_LARGE_STRING_SIZE")) {
        // Split batch and retry
        const mid = Math.floor(records.length / 2);
        this.queues.set(table, records.slice(0, mid));
        await this.flush(table);
        this.queues.set(table, records.slice(mid));
        await this.flush(table);
        return;
      }
      throw error;
    }

    this.queues.set(table, []);
  }
}
```

### Query Performance

```typescript
// From: packages/shared/src/server/repositories/traces.ts

// Efficient: Uses primary key
const query = `
  SELECT *
  FROM traces
  WHERE project_id = {projectId: String}
    AND timestamp >= {startTime: DateTime64(3)}
    AND timestamp <= {endTime: DateTime64(3)}
  LIMIT 1000
  FINAL
`;

// Less efficient: Scans all partitions
const query = `
  SELECT *
  FROM traces
  WHERE id = {traceId: String}  -- No project_id filter
  FINAL
`;
```

---

## Caching Strategies

### Redis Caching

#### API Key Cache

```typescript
// From: web/src/features/public-api/server/apiAuth.ts

async function getApiKeyFromCache(
  publicKey: string
): Promise<CachedApiKey | null> {
  const cacheKey = `api-key:${hash(publicKey)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    recordIncrement("langfuse.api_key.cache_hit");
    return JSON.parse(cached);
  }

  recordIncrement("langfuse.api_key.cache_miss");
  return null;
}

async function cacheApiKey(
  publicKey: string,
  apiKey: ApiKey
): Promise<void> {
  const cacheKey = `api-key:${hash(publicKey)}`;
  const ttl = env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS || 300;

  await redis.setex(cacheKey, ttl, JSON.stringify(apiKey));
}
```

#### Prompt Cache

```typescript
// From: packages/shared/src/server/services/PromptService/index.ts

export class PromptService {
  private memoryCache: Map<string, CachedPrompt> = new Map();

  async getPrompt(params: GetPromptParams): Promise<Prompt> {
    const cacheKey = this.getCacheKey(params);

    // 1. Check memory cache
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached && !this.isExpired(memoryCached)) {
      recordIncrement("langfuse.prompt.cache_hit", 1, { level: "memory" });
      return memoryCached.prompt;
    }

    // 2. Check Redis cache
    const redisCached = await this.getFromRedis(cacheKey);
    if (redisCached) {
      this.memoryCache.set(cacheKey, redisCached);
      recordIncrement("langfuse.prompt.cache_hit", 1, { level: "redis" });
      return redisCached.prompt;
    }

    // 3. Fetch from database
    recordIncrement("langfuse.prompt.cache_miss");
    const prompt = await this.fetchFromDatabase(params);
    await this.cachePrompt(cacheKey, prompt);

    return prompt;
  }
}
```

#### Eval Config Negative Cache

```typescript
// From: packages/shared/src/server/evalJobConfigCache.ts

// Cache "no configs" to avoid repeated DB queries
const NO_CONFIG_PREFIX = "langfuse:eval:no-job-configs";

export async function hasNoJobConfigsCache(
  projectId: string
): Promise<boolean> {
  const key = `${NO_CONFIG_PREFIX}:${projectId}`;
  return Boolean(await redis.get(key));
}

export async function setNoJobConfigsCache(
  projectId: string
): Promise<void> {
  const key = `${NO_CONFIG_PREFIX}:${projectId}`;
  await redis.setex(key, 600, "1"); // 10-minute TTL
}

export async function clearNoJobConfigsCache(
  projectId: string
): Promise<void> {
  const key = `${NO_CONFIG_PREFIX}:${projectId}`;
  await redis.del(key);
}
```

### Cache Invalidation

```typescript
// Invalidate on relevant mutations
async function createJobConfiguration(params: CreateJobConfigParams) {
  const config = await prisma.jobConfiguration.create({
    data: params,
  });

  // Clear negative cache
  await clearNoJobConfigsCache(params.projectId);

  return config;
}
```

---

## Identified Bottlenecks

### 1. S3 LIST Operations

**Issue**: Each event batch lists S3 prefix to find all files.

```typescript
// Current: LIST for every batch
const files = await s3Client.listFiles(
  `${prefix}${projectId}/${entityType}/${eventBodyId}/`
);
```

**Impact**: 5,000 events = 5,000 S3 LIST calls

**Mitigation**:
```typescript
// Skip LIST when file key is known
if (params.fileKey) {
  const file = await s3Client.downloadJson(
    `${prefix}${projectId}/${entityType}/${eventBodyId}/${params.fileKey}.json`
  );
  return [file];
}
```

### 2. Sequential Cache Invalidation

**Issue**: Bulk updates invalidate cache sequentially.

```typescript
// Current: Sequential invalidation
for (const org of organizations) {
  await invalidateApiKeysForOrg(org.id);
}
```

**Solution**: Batch Redis operations

```typescript
// Better: Pipeline Redis commands
const pipeline = redis.pipeline();
for (const org of organizations) {
  pipeline.del(`api-key:org:${org.id}:*`);
}
await pipeline.exec();
```

### 3. ClickHouse Write Pressure

**Issue**: Large batches can exceed ClickHouse limits.

**Mitigation**: Adaptive batch splitting

```typescript
catch (error) {
  if (error.message.includes("TOO_LARGE_STRING_SIZE")) {
    // Split and retry
    const mid = Math.floor(records.length / 2);
    await flush(records.slice(0, mid));
    await flush(records.slice(mid));
  }
}
```

### 4. Prompt Dependency Resolution

**Issue**: Nested prompts cause recursive DB queries.

```typescript
// Template: "{{> child-prompt}}"
// Requires resolving child-prompt, which may have its own children
```

**Mitigation**: Depth limit and caching

```typescript
const MAX_NESTING_DEPTH = 5;

async function resolvePrompt(
  name: string,
  depth: number = 0
): Promise<string> {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error("Max prompt nesting depth exceeded");
  }

  const prompt = await getCachedPrompt(name);
  // Resolve dependencies recursively
}
```

### 5. Event Propagation Staging

**Issue**: Low retry attempts (3) for staging writes.

```typescript
// EventPropagationQueue: only 3 attempts
{
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
}
```

**Risk**: Transient failures can drop events.

**Recommendation**: Increase attempts or add dead letter handling.

---

## Performance Metrics

### Key Metrics to Monitor

```typescript
// Ingestion throughput
"langfuse.ingestion.event" // Count by status
"langfuse.ingestion.latency_ms" // Processing time

// Queue health
"langfuse.queue.{name}.depth" // Jobs waiting
"langfuse.queue.{name}.failed" // Failed jobs

// Cache efficiency
"langfuse.api_key.cache_hit"
"langfuse.api_key.cache_miss"
"langfuse.prompt.cache_hit"
"langfuse.prompt.cache_miss"

// Database performance
"langfuse.clickhouse.write_latency_ms"
"langfuse.clickhouse.rows_written"
"langfuse.prisma.query_duration_ms"
```

### Health Check Queries

```typescript
// Check recent data exists
SELECT count() as count
FROM traces
WHERE timestamp >= now() - INTERVAL 3 MINUTE

// Check queue backlog
await queue.getWaitingCount()
await queue.getActiveCount()
```

---

## Scaling Recommendations

### Horizontal Scaling

#### Web Tier

- Stateless: Scale by adding replicas
- Load balance with sticky sessions (for WebSocket)
- Configure: `WEB_REPLICAS=3`

#### Worker Tier

- Scale by queue depth
- Each worker handles all queues
- Configure: `WORKER_REPLICAS=5`

#### Ingestion Sharding

```bash
# More shards = more parallelism
LANGFUSE_INGESTION_QUEUE_SHARD_COUNT=8
```

### Vertical Scaling

#### Redis

- Enable clustering for >16GB
- Use read replicas for cache reads
- Configure: `REDIS_CLUSTER_ENABLED=true`

#### ClickHouse

- Increase `max_memory_usage`
- Add more shards for write throughput
- Consider MergeTree replication

### Configuration Tuning

```bash
# Ingestion
LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE=1000
LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS=5000
LANGFUSE_S3_CONCURRENT_READS=10

# Caching
LANGFUSE_CACHE_API_KEY_TTL_SECONDS=300
LANGFUSE_CACHE_PROMPT_TTL_SECONDS=300

# Redis
REDIS_ENABLE_AUTO_PIPELINING=true

# Queue concurrency
LANGFUSE_INGESTION_WORKER_CONCURRENCY=10
LANGFUSE_EVAL_WORKER_CONCURRENCY=5
```

---

## Performance Best Practices

### 1. Always Filter by projectId

```typescript
// ✅ Efficient: Uses primary key
WHERE project_id = {projectId} AND timestamp >= {startTime}

// ❌ Inefficient: Full table scan
WHERE id = {traceId}
```

### 2. Use Lookback Windows

```typescript
// ✅ Limits partition scanning
WHERE timestamp >= {startTime} - INTERVAL 2 DAY

// ❌ Scans all partitions
WHERE timestamp >= '1970-01-01'
```

### 3. Batch Database Operations

```typescript
// ✅ Single query
await prisma.trace.createMany({ data: traces });

// ❌ N queries
for (const trace of traces) {
  await prisma.trace.create({ data: trace });
}
```

### 4. Cache Expensive Operations

```typescript
// ✅ Cache API key lookups
const cached = await redis.get(`api-key:${hash}`);
if (cached) return JSON.parse(cached);

// ❌ Query database every time
const apiKey = await prisma.apiKey.findUnique({ where: { publicKey } });
```

### 5. Use Appropriate Concurrency

```typescript
// ✅ Controlled parallelism
await Promise.all(
  chunks(items, 10).map((chunk) => processChunk(chunk))
);

// ❌ Unbounded parallelism
await Promise.all(items.map((item) => processItem(item)));
```

---

## Monitoring Setup

### Recommended Dashboards

1. **Ingestion Health**
   - Events/second by project
   - Queue depth over time
   - Processing latency percentiles

2. **Database Performance**
   - ClickHouse query latency
   - PostgreSQL connection pool usage
   - Redis memory and connections

3. **Cache Efficiency**
   - Hit/miss ratios
   - Cache memory usage
   - TTL distribution

4. **Error Rates**
   - Failed jobs by queue
   - HTTP error rates
   - Exception counts

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Queue depth | >1000 | >10000 |
| Processing latency p99 | >5s | >30s |
| Cache miss rate | >20% | >50% |
| Failed job rate | >1% | >5% |

---

## Key Takeaways

1. **Queue sharding** enables horizontal scaling of ingestion

2. **Dual-phase caching** (memory + Redis) optimizes hot paths

3. **Batch writes** to ClickHouse reduce overhead

4. **Lookback windows** prevent full table scans

5. **Monitor cache hit rates** to identify optimization opportunities

---

## Summary

Langfuse's performance architecture balances throughput, consistency, and operability:

- **23 specialized queues** separate concerns and enable targeted scaling
- **Sharded ingestion** distributes load across workers
- **Multi-layer caching** reduces database pressure
- **ClickHouse optimizations** enable fast analytical queries

For production deployments, focus on:
1. Monitoring queue depths and cache hit rates
2. Tuning batch sizes and concurrency
3. Scaling workers based on queue metrics
4. Using appropriate lookback windows in queries

---

*This concludes the Langfuse Technical Deep Dive Series. We hope these insights help you operate, extend, and contribute to Langfuse effectively.*

---

*Find the complete series at [analysis-output/blog-series/00-series-outline.md](./00-series-outline.md).*
