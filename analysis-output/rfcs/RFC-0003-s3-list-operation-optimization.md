# RFC-0003: S3 LIST Operation Optimization

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P0
**Effort:** 2-4 weeks

---

## Summary

Eliminate unnecessary S3 LIST operations during event ingestion by passing file keys directly through the queue and implementing direct file access patterns.

---

## Motivation

### Problem Statement

Current ingestion flow lists S3 prefixes for every event batch:

```typescript
// From: worker/src/queues/ingestionQueue.ts
const files = await s3Client.listFiles(
  `${prefix}${projectId}/${entityType}/${eventBodyId}/`
);
```

**Issues:**
1. Each LIST operation costs ~$0.005 per 1,000 requests
2. LIST is slower than GET (must enumerate directory)
3. Scales O(n) with event volume
4. Creates S3 API rate limiting risk

### Impact

At 100,000 events/day:
- 100,000 LIST operations
- ~$0.50/day = $15/month
- Latency: ~50-100ms per LIST
- Total: 1.4-2.8 hours of cumulative latency

At 1M events/day:
- $150/month in LIST costs
- 14-28 hours of cumulative latency

### Current Flow

```
API → S3 Upload → Queue Job → Worker
                              ↓
                         LIST S3 prefix
                              ↓
                         Download files
                              ↓
                         Process events
```

---

## Detailed Design

### Proposed Flow

```
API → S3 Upload → Queue Job (with file key) → Worker
                                               ↓
                                          Direct GET
                                               ↓
                                          Process events
```

### Implementation

#### 1. Update Job Data Structure

```typescript
// packages/shared/src/server/queues.ts

export type IngestionJobData = {
  projectId: string;
  entityId: string;
  entityType: EntityType;
  // New fields
  s3FileKey: string;      // Direct file key
  s3Bucket: string;       // Bucket name
  // Legacy support
  s3Prefix?: string;      // Deprecated, for migration
};
```

#### 2. Update Event Processing

```typescript
// packages/shared/src/server/ingestion/processEventBatch.ts

async function uploadAndQueueEvents(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  events: Event[]
): Promise<void> {
  // Generate unique file key
  const fileKey = `${projectId}/${entityType}/${entityId}/${nanoid()}.json`;
  const bucket = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET;

  // Upload events
  await s3Client.uploadJson(
    `s3://${bucket}/${fileKey}`,
    events
  );

  // Queue with file key
  await IngestionQueue.getInstance({
    shardingKey: `${projectId}-${entityId}`,
  }).add("process", {
    projectId,
    entityId,
    entityType,
    s3FileKey: fileKey,
    s3Bucket: bucket,
  });
}
```

#### 3. Update Worker Processing

```typescript
// worker/src/queues/ingestionQueue.ts

const processor = async (job: Job<IngestionJobData>) => {
  const { projectId, entityId, entityType, s3FileKey, s3Bucket, s3Prefix } = job.data;

  let events: Event[];

  if (s3FileKey) {
    // New path: Direct file access
    events = await s3Client.downloadJson(
      `s3://${s3Bucket}/${s3FileKey}`
    );

    recordIncrement("langfuse.ingestion.s3_access", 1, {
      method: "direct",
    });
  } else if (s3Prefix) {
    // Legacy path: LIST + download (for migration)
    const files = await s3Client.listFiles(s3Prefix);
    events = await Promise.all(
      files.map((file) => s3Client.downloadJson(file))
    ).then((results) => results.flat());

    recordIncrement("langfuse.ingestion.s3_access", 1, {
      method: "list",
    });
  } else {
    throw new Error("No S3 location provided");
  }

  // Process events
  await ingestionService.mergeAndWrite(
    entityType,
    projectId,
    entityId,
    events
  );

  // Optionally delete processed file
  if (s3FileKey && env.LANGFUSE_S3_DELETE_AFTER_PROCESSING) {
    await s3Client.deleteFile(`s3://${s3Bucket}/${s3FileKey}`);
  }
};
```

#### 4. Handle Multiple Updates

For cases where multiple updates arrive before processing:

```typescript
// Option A: Consolidate on ingestion side
async function uploadAndQueueEvents(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  events: Event[]
): Promise<void> {
  // Add delay to batch rapid updates
  const delay = calculateDelay(entityType);

  // Each batch gets unique file
  const fileKey = `${projectId}/${entityType}/${entityId}/${Date.now()}-${nanoid()}.json`;

  // ... upload and queue
}

// Option B: Worker merges multiple files
const processor = async (job: Job<IngestionJobData>) => {
  if (job.data.s3FileKeys) {
    // Multiple files to merge
    const events = await Promise.all(
      job.data.s3FileKeys.map((key) => s3Client.downloadJson(key))
    ).then((results) => results.flat());
  }
};
```

### S3 Path Structure

```
langfuse-events/
├── {projectId}/
│   ├── trace/
│   │   └── {entityId}/
│   │       ├── 1700000000000-abc123.json
│   │       └── 1700000001000-def456.json
│   ├── observation/
│   │   └── {entityId}/
│   │       └── 1700000000000-ghi789.json
│   └── score/
│       └── {entityId}/
│           └── 1700000000000-jkl012.json
```

---

## Example Usage

### Before

```typescript
// Worker receives job
{
  projectId: "proj-123",
  entityId: "trace-456",
  entityType: "trace",
  // Must LIST to find files
}

// Worker lists directory
const files = await s3.listFiles("proj-123/trace/trace-456/");
// Returns: ["proj-123/trace/trace-456/file1.json", "proj-123/trace/trace-456/file2.json"]
```

### After

```typescript
// Worker receives job with direct key
{
  projectId: "proj-123",
  entityId: "trace-456",
  entityType: "trace",
  s3FileKey: "proj-123/trace/trace-456/1700000000000-abc123.json",
  s3Bucket: "langfuse-events",
}

// Worker directly downloads
const events = await s3.downloadJson("s3://langfuse-events/proj-123/trace/trace-456/1700000000000-abc123.json");
```

---

## Implementation Plan

### Week 1: Foundation

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Update job data structure | Backend team |
| 3-4 | Update event processing | Backend team |
| 5 | Update worker with dual-path support | Backend team |

### Week 2: Migration & Testing

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Deploy to staging with feature flag | DevOps |
| 3-4 | Performance testing | QA team |
| 5 | Production canary deployment | DevOps |

### Week 3: Rollout & Cleanup

| Day | Task | Owner |
|-----|------|-------|
| 1-2 | Full production rollout | DevOps |
| 3-4 | Monitor metrics, address issues | Backend team |
| 5 | Remove legacy LIST path | Backend team |

### Milestones

- [ ] Week 1: Dual-path implementation complete
- [ ] Week 2: Staging validation
- [ ] Week 3: Production rollout
- [ ] Week 4: Legacy path removed

---

## Backwards Compatibility

### Breaking Changes

None for external APIs. Internal job structure changes.

### Migration Steps

1. Deploy with dual-path support (reads both formats)
2. Monitor `langfuse.ingestion.s3_access` metric
3. Once all old jobs processed, remove legacy path

### Queue Draining

Existing jobs in queue use old format. Worker supports both:

```typescript
if (job.data.s3FileKey) {
  // New format
} else if (job.data.s3Prefix) {
  // Old format
}
```

---

## Alternatives Considered

### 1. Redis Event Storage

Store events in Redis instead of S3.

**Rejected:**
- Redis memory limits
- Less durable than S3
- More expensive at scale

### 2. Event Consolidation on Ingestion

Merge events before S3 upload.

**Rejected:**
- Increases API latency
- Loses event replay capability
- Complicates error handling

### 3. DynamoDB for Event Index

Store file locations in DynamoDB.

**Rejected:**
- Adds another database
- Overkill for the problem
- Increases complexity

---

## Open Questions

1. **Q:** Should we delete S3 files after processing?
   **A:** Make configurable. Default: retain for 7 days for replay capability.

2. **Q:** How to handle concurrent updates to same entity?
   **A:** Each gets unique file key. Worker merges in timestamp order.

3. **Q:** What about OTel ingestion path?
   **A:** Same optimization applies. Update OtelIngestionQueue similarly.

---

## Success Criteria

- [ ] 80%+ reduction in S3 LIST calls
- [ ] No increase in ingestion latency
- [ ] S3 costs reduced proportionally
- [ ] All existing functionality preserved

### Metrics to Track

```typescript
// S3 access method distribution
"langfuse.ingestion.s3_access" // tag: method=direct|list

// Latency comparison
"langfuse.ingestion.s3_latency_ms" // tag: method=direct|list

// Cost tracking
"langfuse.s3.list_operations" // Should decrease
"langfuse.s3.get_operations"  // Should increase slightly
```

---

## Effort Estimation

- **Development:** 5 days
- **Testing:** 3 days
- **Staging validation:** 2 days
- **Production rollout:** 2 days
- **Monitoring:** 2 days
- **Total:** ~14 dev-days

---

## Rollback Strategy

1. Disable feature flag to stop new direct-path jobs
2. Workers continue supporting both formats
3. Re-enable old LIST path as default
4. No data loss—S3 files unchanged
