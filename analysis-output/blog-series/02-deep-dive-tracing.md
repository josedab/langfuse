# Deep Dive: Langfuse's Tracing System

**Part 2 of 5 in the Langfuse Technical Deep Dive Series**

*Analysis based on commit `03edd7d9019186493b7008db9f465bf8023cf6d1`*

---

## What You'll Learn

- The trace, observation, and score data model in detail
- How the ingestion pipeline processes events at scale
- Event merging and deduplication strategies
- Query patterns and performance optimizations
- Real code examples from the codebase

---

## Introduction

Tracing is Langfuse's core capability—capturing the complete execution flow of LLM applications. In this post, we'll follow an event from SDK submission through storage in ClickHouse, examining each transformation along the way.

---

## The Data Model

### Traces

A trace represents a single execution flow:

```typescript
// ClickHouse schema from: packages/shared/clickhouse/migrations/unclustered/0001_traces.up.sql
{
  id: String,                    // Unique identifier
  timestamp: DateTime64(3),      // When trace started
  name: String,                  // Operation name
  user_id: Nullable(String),     // End user identifier
  session_id: Nullable(String),  // Session grouping
  metadata: Map(String, String), // Custom key-value pairs
  tags: Array(String),           // Categorization labels
  input: Nullable(String),       // Request payload (ZSTD compressed)
  output: Nullable(String),      // Response payload (ZSTD compressed)
  release: Nullable(String),     // Application version
  version: Nullable(String),     // Trace schema version
  project_id: String,            // Tenant isolation
  public: Bool,                  // Shareable via link
  bookmarked: Bool,              // User favorite
  event_ts: DateTime64(3),       // Version timestamp
  is_deleted: UInt8,             // Soft delete flag
}
```

**Storage Optimizations**:
- `CODEC(ZSTD(3))` on input/output for compression
- Bloom filters on id, metadata keys/values
- Monthly partitioning by timestamp
- Primary key on `(project_id, toDate(timestamp))`

### Observations

Observations are operations within a trace:

```typescript
// From: packages/shared/clickhouse/migrations/unclustered/0002_observations.up.sql
{
  id: String,
  trace_id: String,              // Parent trace
  parent_observation_id: Nullable(String), // Nested hierarchy
  project_id: String,
  type: LowCardinality(String),  // SPAN, GENERATION, EVENT
  name: String,
  start_time: DateTime64(3),
  end_time: Nullable(DateTime64(3)),
  level: LowCardinality(String), // DEBUG, DEFAULT, WARNING, ERROR

  // Model information (for GENERATION type)
  provided_model_name: Nullable(String),
  internal_model_id: Nullable(String),
  model_parameters: Nullable(String),

  // Cost tracking with high precision
  provided_usage_details: Map(String, UInt64),
  usage_details: Map(String, UInt64),
  provided_cost_details: Map(String, Decimal64(12)),
  cost_details: Map(String, Decimal64(12)),

  input: Nullable(String),
  output: Nullable(String),
  metadata: Map(String, String),

  event_ts: DateTime64(3),
  is_deleted: UInt8,
}
```

**Type Semantics**:
- `SPAN`: Timed operation (retrieval, processing)
- `GENERATION`: LLM call with token usage and cost
- `EVENT`: Point-in-time occurrence

### Scores

Evaluation metrics attached to traces or observations:

```typescript
// From: packages/shared/clickhouse/migrations/unclustered/0003_scores.up.sql
{
  id: String,
  timestamp: DateTime64(3),
  project_id: String,
  trace_id: String,
  observation_id: Nullable(String),  // Optional attachment point
  name: String,                       // Metric name
  value: Float64,                     // Numeric value
  string_value: Nullable(String),     // Categorical value
  data_type: String,                  // NUMERIC, CATEGORICAL, BOOLEAN
  source: String,                     // API, ANNOTATION, EVAL
  comment: Nullable(String),
  author_user_id: Nullable(String),   // For ANNOTATION source
  config_id: Nullable(String),        // Score configuration reference
  queue_id: Nullable(String),         // Annotation queue reference
  event_ts: DateTime64(3),
  is_deleted: UInt8,
}
```

---

## The Ingestion Pipeline

### Stage 1: API Entry

SDKs submit batches to `/api/public/ingestion`:

```typescript
// From: web/src/pages/api/public/ingestion.ts
export default withMiddlewares({
  POST: createAuthedProjectAPIRoute(
    async (req: NextApiRequest, auth: AuthedProjectRequestContext) => {
      const { batch, metadata } = req.body;

      const result = await instrumentAsync(
        { name: "ingestion" },
        async () => {
          return processEventBatch({
            projectId: auth.scope.projectId,
            batch,
            authCheck: auth,
          });
        }
      );

      return result;
    },
    {
      bodySchema: eventBatchSchema,
      responseSchema: ingestionResponseSchema,
    }
  ),
});
```

**Response Format**: HTTP 207 Multi-Status

```typescript
{
  successes: [
    { id: "event-1", status: 201 },
    { id: "event-2", status: 201 },
  ],
  errors: [
    { id: "event-3", status: 400, message: "Invalid timestamp" },
  ],
}
```

### Stage 2: Validation & Grouping

```typescript
// From: packages/shared/src/server/ingestion/processEventBatch.ts

export async function processEventBatch(params: {
  projectId: string;
  batch: unknown[];
  authCheck: AuthedContext;
}): Promise<IngestionResult> {
  const { projectId, batch, authCheck } = params;

  // 1. Validate each event
  const validationResults = batch.map((event) => {
    const parsed = createIngestionEventSchema().safeParse(event);
    return parsed.success
      ? { success: true, event: parsed.data }
      : { success: false, error: parsed.error };
  });

  // 2. Check authorization per event
  const authorizedEvents = validationResults
    .filter((r) => r.success)
    .filter((r) => isAuthorized(r.event, authCheck));

  // 3. Sort: creation events first, updates last (by timestamp)
  const sortedEvents = sortEventsByTimestamp(authorizedEvents);

  // 4. Group by eventBodyId for batching
  const eventsByEntityId = groupEventsByEntityId(sortedEvents);

  // ...
}
```

**Why sort events?** When multiple updates arrive for the same entity, processing them in timestamp order ensures the final state is correct.

### Stage 3: S3 Upload

Events persist to S3 before queuing:

```typescript
// From: packages/shared/src/server/ingestion/processEventBatch.ts

const s3Uploads = eventsByEntityId.map(async ([entityId, events]) => {
  const bucketPath = `${S3_PREFIX}${projectId}/${entityType}/${entityId}/${generateKey()}.json`;

  try {
    await getS3StorageServiceClient(bucket).uploadJson(bucketPath, events);
    return { success: true, entityId, path: bucketPath };
  } catch (error) {
    // Non-blocking: log error but don't fail the batch
    logger.error("S3 upload failed", { error, entityId });
    return { success: false, entityId };
  }
});

// Upload concurrently
const uploadResults = await Promise.allSettled(s3Uploads);
```

**Why S3 first?**
1. **Durability**: Events survive worker failures
2. **Replay**: Failed jobs can re-download events
3. **Audit**: Complete event history preserved

### Stage 4: Queue Dispatch

```typescript
// From: packages/shared/src/server/redis/ingestionQueue.ts

export class IngestionQueue {
  private static instances: Map<number, Queue> = new Map();

  public static getInstance(params: {
    shardingKey?: string;
  }): Queue | null {
    // Calculate shard from consistent hash
    const shardIndex = shardingKey
      ? getShardIndex(shardingKey, SHARD_COUNT)
      : 0;

    if (!this.instances.has(shardIndex)) {
      const queue = new Queue(`ingestion-${shardIndex}`, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 100_000,
          attempts: 6,
          backoff: {
            type: "exponential",
            delay: 5000,  // 5s, 10s, 20s, 40s, 80s, 160s
          },
        },
      });
      this.instances.set(shardIndex, queue);
    }

    return this.instances.get(shardIndex);
  }
}

// Usage
const queue = IngestionQueue.getInstance({
  shardingKey: `${projectId}-${eventBodyId}`,
});

await queue.add("process", {
  projectId,
  entityId,
  entityType,
  s3Path,
});
```

**Sharding Strategy**:
- Hash: SHA-256 of `${projectId}-${eventBodyId}`
- Distribution: Modulo shard count
- Benefit: Events for same entity go to same worker

### Stage 5: Worker Processing

```typescript
// From: worker/src/queues/ingestionQueue.ts

const processor = async (job: Job<IngestionJobData>) => {
  const { projectId, entityId, entityType, s3Path } = job.data;

  // 1. Check deduplication cache
  const cacheKey = `recently-processed:${projectId}:${entityType}:${entityId}`;
  if (await redis.exists(cacheKey)) {
    return; // Already processed recently
  }

  // 2. Download events from S3
  const files = await s3Client.listFiles(s3Path);
  const events = await Promise.all(
    files.map((file) => s3Client.downloadJson(file))
  );

  // 3. Merge and write
  await ingestionService.mergeAndWrite(
    entityType,
    projectId,
    entityId,
    events.flat()
  );

  // 4. Update deduplication cache
  await redis.setex(cacheKey, 300, "1"); // 5-minute TTL
};
```

### Stage 6: Event Merging

```typescript
// From: worker/src/services/IngestionService/index.ts

async mergeAndWrite(
  entityType: EntityType,
  projectId: string,
  entityId: string,
  events: IngestionEvent[]
): Promise<void> {
  switch (entityType) {
    case "trace":
      return this.processTraceEventList({
        projectId,
        entityId,
        traceEventList: events,
      });
    case "observation":
      return this.processObservationEventList({
        projectId,
        entityId,
        observationEventList: events,
      });
    case "score":
      return this.processScoreEventList({
        projectId,
        entityId,
        scoreEventList: events,
      });
  }
}

private async processTraceEventList(params: TraceParams): Promise<void> {
  const { projectId, entityId, traceEventList } = params;

  // Merge events: later events override earlier
  const mergedTrace = traceEventList.reduce((acc, event) => {
    return {
      ...acc,
      ...event.body,
      // Preserve immutable fields
      id: acc.id || event.body.id,
      timestamp: acc.timestamp || event.body.timestamp,
    };
  }, {} as TraceRecord);

  // Check for existing trace in ClickHouse
  const existingTrace = await getTraceById(projectId, entityId);

  if (existingTrace) {
    // Merge with existing
    mergedTrace.input = mergedTrace.input ?? existingTrace.input;
    mergedTrace.output = mergedTrace.output ?? existingTrace.output;
    // ... other fields
  }

  // Write to ClickHouse
  await upsertClickhouse({
    table: "traces",
    records: [mergedTrace],
    eventBodyMapper: traceToClickhouse,
  });
}
```

**Merge Semantics**:
- Later timestamp wins (for mutable fields)
- Immutable fields (id, timestamp) cannot change
- Null values don't override existing values

### Stage 7: ClickHouse Write

```typescript
// From: packages/shared/src/server/repositories/clickhouse.ts

export async function upsertClickhouse<T>(opts: {
  table: ClickhouseTable;
  records: T[];
  eventBodyMapper: (body: T) => Record<string, unknown>;
}): Promise<void> {
  const { table, records, eventBodyMapper } = opts;

  const rows = records.map((record) => ({
    ...eventBodyMapper(record),
    event_ts: convertDateToClickhouseDateTime(new Date()),
  }));

  await clickhouseClient().insert({
    table,
    values: rows,
    format: "JSONEachRow",
  });
}
```

**ReplacingMergeTree** handles updates:
- Each write adds a new row with current `event_ts`
- Query with `FINAL` to get latest version
- Background merges deduplicate periodically

---

## Query Patterns

### Basic Trace Lookup

```typescript
// From: packages/shared/src/server/repositories/traces.ts

export async function getTraceById(
  projectId: string,
  traceId: string,
  timestamp?: Date
): Promise<TraceRecord | null> {
  const query = `
    SELECT *
    FROM traces
    WHERE project_id = {projectId: String}
      AND id = {traceId: String}
      ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)} - INTERVAL 2 DAY` : ""}
    ORDER BY event_ts DESC
    LIMIT 1 BY id, project_id
    FINAL
  `;

  const result = await queryClickhouse({
    query,
    params: { projectId, traceId, timestamp },
  });

  return result.length > 0 ? result[0] : null;
}
```

**Key Patterns**:
- `FINAL`: Force merge to get latest version
- `LIMIT 1 BY`: Deduplicate in result set
- Lookback window: Optimize partition scanning

### Lookback Windows

Different relationships have different time windows:

```typescript
// From: packages/shared/src/server/repositories/README.md

// Trace to Observation: +1 hour
// Observations happen after traces start
const TRACE_TO_OBS_INTERVAL = "1 HOUR";

// Observation to Trace: -2 days
// Traces may be created before observations (async update)
const OBS_TO_TRACE_INTERVAL = "2 DAY";

// Score to Entity: ±1 hour
// Scores arrive shortly after execution
const SCORE_TO_ENTITY_INTERVAL = "1 HOUR";
```

**Why?** ClickHouse partitions by month. Without lookback windows, queries would scan all partitions.

### Complex Filtering

```typescript
// From: packages/shared/src/server/queries/clickhouse-sql/clickhouse-filter.ts

export function buildFilterCondition(
  filter: FilterDefinition
): { query: string; params: Record<string, unknown> } {
  switch (filter.type) {
    case "string":
      return buildStringFilter(filter);
    case "number":
      return buildNumberFilter(filter);
    case "datetime":
      return buildDateTimeFilter(filter);
    case "arrayContains":
      return buildArrayFilter(filter);
  }
}

// Example: String filter with operator
function buildStringFilter(filter: StringFilter): FilterResult {
  const { column, operator, value, paramName } = filter;

  switch (operator) {
    case "=":
      return {
        query: `${column} = {${paramName}: String}`,
        params: { [paramName]: value },
      };
    case "contains":
      return {
        query: `${column} ILIKE {${paramName}: String}`,
        params: { [paramName]: `%${value}%` },
      };
    case "startsWith":
      return {
        query: `${column} ILIKE {${paramName}: String}`,
        params: { [paramName]: `${value}%` },
      };
  }
}
```

### Aggregation Queries

```typescript
// From: packages/shared/src/server/repositories/traces.ts

export async function getTracesTableMetrics(
  projectId: string,
  filter: FilterList,
  timeRange: TimeRange
): Promise<TraceMetrics> {
  const query = `
    SELECT
      count(DISTINCT t.id) as trace_count,
      count(DISTINCT t.user_id) as user_count,
      avg(
        date_diff('millisecond', t.timestamp,
          (SELECT max(end_time) FROM observations WHERE trace_id = t.id))
      ) as avg_latency_ms,
      sum(o.cost_details['total']) as total_cost
    FROM traces t
    LEFT JOIN observations o ON t.id = o.trace_id AND t.project_id = o.project_id
    WHERE t.project_id = {projectId: String}
      AND t.timestamp >= {startTime: DateTime64(3)}
      AND t.timestamp <= {endTime: DateTime64(3)}
      ${filter.toClickhouseCondition()}
    FINAL
  `;

  return queryClickhouse({ query, params: { projectId, ...timeRange } });
}
```

---

## Performance Optimizations

### 1. Bloom Filters

```sql
-- Fast existence checks on high-cardinality columns
INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1
INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1
```

### 2. LowCardinality

```sql
-- Enum-like columns with limited values
type LowCardinality(String)  -- SPAN, GENERATION, EVENT
level LowCardinality(String) -- DEBUG, DEFAULT, WARNING, ERROR
```

### 3. Compression

```sql
-- ZSTD for large text fields
input Nullable(String) CODEC(ZSTD(3))
output Nullable(String) CODEC(ZSTD(3))
comment Nullable(String) CODEC(ZSTD(1))
```

### 4. Batch Writing

```typescript
// From: worker/src/services/ClickhouseWriter/index.ts

export class ClickhouseWriter {
  private queues: Map<TableName, QueuedRecord[]> = new Map();

  async enqueue(table: TableName, record: Record): void {
    const queue = this.queues.get(table) || [];
    queue.push(record);
    this.queues.set(table, queue);

    if (queue.length >= BATCH_SIZE) {
      await this.flush(table);
    }
  }

  async flush(table: TableName): Promise<void> {
    const records = this.queues.get(table) || [];
    if (records.length === 0) return;

    await upsertClickhouse({
      table,
      records,
      eventBodyMapper: getMapper(table),
    });

    this.queues.set(table, []);
  }

  // Periodic flush every N ms
  startPeriodicFlush(intervalMs: number): void {
    setInterval(() => {
      for (const table of this.queues.keys()) {
        this.flush(table);
      }
    }, intervalMs);
  }
}
```

### 5. Deduplication Cache

```typescript
// Prevent reprocessing identical events
const cacheKey = `langfuse:ingestion:recently-processed:${projectId}:${entityType}:${entityId}`;

// Check before processing
if (await redis.exists(cacheKey)) {
  recordIncrement("langfuse.ingestion.cache_hit");
  return;
}

// Set after successful processing
await redis.setex(cacheKey, 300, "1"); // 5-minute TTL
```

---

## Handling Edge Cases

### Out-of-Order Events

Events may arrive out of timestamp order due to network delays:

```typescript
// Sort by timestamp before merging
const sortedEvents = events.sort((a, b) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

// Process in order
const merged = sortedEvents.reduce((acc, event) => ({
  ...acc,
  ...event.body,
}), {});
```

### Immutable Field Conflicts

```typescript
// Reject attempts to change immutable fields
if (existingTrace && event.body.id !== existingTrace.id) {
  throw new Error("Cannot change trace ID");
}

if (existingTrace && event.body.timestamp !== existingTrace.timestamp) {
  logger.warn("Timestamp mismatch", {
    existing: existingTrace.timestamp,
    received: event.body.timestamp,
  });
  // Use existing timestamp
  event.body.timestamp = existingTrace.timestamp;
}
```

### Large Payloads

```typescript
// Truncate oversized payloads to prevent ClickHouse errors
const MAX_PAYLOAD_SIZE = 1_000_000; // 1MB

function truncatePayload(payload: string): string {
  if (payload.length <= MAX_PAYLOAD_SIZE) return payload;

  const truncated = payload.substring(0, MAX_PAYLOAD_SIZE);
  logger.warn("Truncated large payload", {
    original: payload.length,
    truncated: truncated.length,
  });

  return truncated + "... [truncated]";
}
```

---

## Monitoring & Observability

### Metrics Collected

```typescript
// Ingestion metrics
recordIncrement("langfuse.ingestion.event", 1, {
  entityType,
  status: "success" | "error",
});

recordHistogram("langfuse.ingestion.latency_ms", processingTime);

recordGauge("langfuse.ingestion.queue_depth", queueDepth, {
  shard: shardIndex,
});

// Cache metrics
recordIncrement("langfuse.ingestion.cache_hit");
recordIncrement("langfuse.ingestion.cache_miss");

// ClickHouse metrics
recordHistogram("langfuse.clickhouse.write_latency_ms", writeTime);
recordIncrement("langfuse.clickhouse.rows_written", rowCount);
```

### Health Checks

```typescript
// From: web/src/pages/api/public/health.ts

export default async function handler(req, res) {
  const { failIfNoRecentEvents } = req.query;

  // Check database connectivity
  await prisma.$queryRaw`SELECT 1`;

  // Optionally check recent data
  if (failIfNoRecentEvents === "true") {
    const recentTraces = await queryClickhouse({
      query: `
        SELECT count() as count
        FROM traces
        WHERE timestamp >= now() - INTERVAL 3 MINUTE
      `,
    });

    if (recentTraces[0].count === 0) {
      return res.status(503).json({
        status: "UNHEALTHY",
        reason: "No recent events",
      });
    }
  }

  return res.status(200).json({ status: "OK" });
}
```

---

## Key Takeaways

1. **Event-driven ingestion** separates fast API responses from slow ClickHouse writes

2. **S3 as event log** enables replay and durability without database load

3. **Event merging** handles out-of-order updates with "last write wins" semantics

4. **Lookback windows** optimize ClickHouse queries by limiting partition scans

5. **ReplacingMergeTree** provides update semantics in an append-only database

6. **Deduplication cache** prevents reprocessing within 5-minute windows

---

## Next Steps

In **Part 3**, we'll explore the design patterns that make Langfuse maintainable—feature-based organization, service layer patterns, and testing strategies.

---

*This post is part of a technical series on Langfuse architecture. Find the complete series at [analysis-output/blog-series/00-series-outline.md](./00-series-outline.md).*
