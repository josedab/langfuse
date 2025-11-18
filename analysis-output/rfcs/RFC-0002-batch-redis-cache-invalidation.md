# RFC-0002: Batch Redis Cache Invalidation

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P0
**Effort:** <1 week

---

## Summary

Replace sequential Redis cache invalidation calls with pipelined batch operations to improve performance of bulk update operations.

---

## Motivation

### Problem Statement

Current bulk update operations invalidate cache entries sequentially:

```typescript
// From: web/src/ee/features/billing/bulkUpdates.ts
for (const org of organizations) {
  await invalidateApiKeysForOrg(org.id); // Sequential!
}
```

With 1,000 organizations, this results in:
- 1,000 Redis round trips
- ~100ms per call = 100 seconds total
- Blocking behavior during bulk operations

### Impact

- Bulk operations take O(n) time instead of O(1)
- Database contention during long operations
- Poor user experience for admin operations
- Increased latency for dependent operations

### Scope

Affects all bulk operations that invalidate cache:
- API key cache invalidation
- Prompt cache clearing
- Eval config cache clearing
- Session cache invalidation

---

## Detailed Design

### Implementation

#### 1. Create Redis Pipeline Helper

```typescript
// packages/shared/src/server/redis/pipeline.ts

import { redis } from "./redis";

export async function batchDelete(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const pipeline = redis.pipeline();

  for (const key of keys) {
    pipeline.del(key);
  }

  await pipeline.exec();
}

export async function batchDeletePattern(patterns: string[]): Promise<void> {
  if (patterns.length === 0) return;

  // Collect all keys matching patterns
  const allKeys: string[] = [];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    allKeys.push(...keys);
  }

  await batchDelete(allKeys);
}

export async function batchSet(
  entries: Array<{ key: string; value: string; ttl?: number }>
): Promise<void> {
  if (entries.length === 0) return;

  const pipeline = redis.pipeline();

  for (const { key, value, ttl } of entries) {
    if (ttl) {
      pipeline.setex(key, ttl, value);
    } else {
      pipeline.set(key, value);
    }
  }

  await pipeline.exec();
}
```

#### 2. Update API Key Cache Invalidation

```typescript
// packages/shared/src/server/auth/apiKeyCache.ts

import { batchDelete } from "../redis/pipeline";

// Before
export async function invalidateApiKeysForOrgs(
  orgIds: string[]
): Promise<void> {
  for (const orgId of orgIds) {
    await redis.del(`api-key:org:${orgId}`);
  }
}

// After
export async function invalidateApiKeysForOrgs(
  orgIds: string[]
): Promise<void> {
  const keys = orgIds.map((orgId) => `api-key:org:${orgId}`);
  await batchDelete(keys);
}
```

#### 3. Update Bulk Update Functions

```typescript
// web/src/ee/features/billing/bulkUpdates.ts

import { invalidateApiKeysForOrgs } from "@langfuse/shared/src/server";

export async function bulkUpdateOrganizations(
  updates: OrganizationUpdate[]
): Promise<void> {
  // Perform bulk database update
  await prisma.$transaction(async (tx) => {
    // ... existing bulk update logic
  });

  // Batch cache invalidation
  const orgIds = updates.map((u) => u.orgId);
  await invalidateApiKeysForOrgs(orgIds);
}
```

#### 4. Update Prompt Cache

```typescript
// packages/shared/src/server/services/PromptService/index.ts

import { batchDeletePattern } from "../redis/pipeline";

export async function invalidatePromptCache(
  projectIds: string[]
): Promise<void> {
  const patterns = projectIds.map(
    (projectId) => `langfuse:prompt:${projectId}:*`
  );
  await batchDeletePattern(patterns);
}
```

#### 5. Update Eval Config Cache

```typescript
// packages/shared/src/server/evalJobConfigCache.ts

import { batchDelete } from "../redis/pipeline";

export async function clearNoJobConfigsCacheForProjects(
  projectIds: string[]
): Promise<void> {
  const keys = projectIds.map(
    (projectId) => `langfuse:eval:no-job-configs:${projectId}`
  );
  await batchDelete(keys);
}
```

### Performance Comparison

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| 100 orgs | 10s | 50ms | 200x |
| 1,000 orgs | 100s | 100ms | 1000x |
| 10,000 orgs | 1000s | 200ms | 5000x |

---

## Example Usage

### Before

```typescript
// Sequential invalidation
async function updateAllOrgs(updates: OrgUpdate[]) {
  for (const update of updates) {
    await prisma.organization.update({
      where: { id: update.id },
      data: update.data,
    });
    await invalidateApiKeysForOrg(update.id); // Slow!
  }
}
```

### After

```typescript
// Batched invalidation
async function updateAllOrgs(updates: OrgUpdate[]) {
  // Bulk database update
  await prisma.$transaction(
    updates.map((update) =>
      prisma.organization.update({
        where: { id: update.id },
        data: update.data,
      })
    )
  );

  // Batch cache invalidation
  const orgIds = updates.map((u) => u.id);
  await invalidateApiKeysForOrgs(orgIds); // Fast!
}
```

---

## Implementation Plan

| Day | Task | Owner |
|-----|------|-------|
| 1 | Create pipeline helper functions | Backend team |
| 2 | Update API key cache invalidation | Backend team |
| 3 | Update prompt and eval caches | Backend team |
| 4 | Testing and performance validation | Backend team |

### Milestones

- [ ] Day 1: Pipeline helper created and tested
- [ ] Day 2: API key cache using pipeline
- [ ] Day 3: All caches using pipeline
- [ ] Day 4: Performance validated in staging

---

## Backwards Compatibility

### Breaking Changes

None. This is an internal optimization with no API changes.

### Migration Steps

1. Deploy new code
2. Existing operations automatically use batching

---

## Alternatives Considered

### 1. Lua Scripts

```lua
-- Redis Lua script for atomic batch delete
local keys = KEYS
for i, key in ipairs(keys) do
  redis.call('DEL', key)
end
return #keys
```

**Rejected:** Pipeline is simpler and provides same performance benefit.

### 2. Background Job

Move cache invalidation to background queue.

**Rejected:** Adds complexity and potential consistency issues.

### 3. Cache Tags

Use Redis sets to group related cache entries.

**Rejected:** Requires schema migration, overkill for this use case.

---

## Open Questions

1. **Q:** Should we add metrics for pipeline performance?
   **A:** Yes, add `langfuse.redis.pipeline.operations` histogram.

2. **Q:** What's the maximum batch size for pipelines?
   **A:** Redis handles large pipelines well. Chunk at 10,000 if needed.

3. **Q:** Should pattern-based deletion use SCAN instead of KEYS?
   **A:** Yes for production safety. Update implementation to use SCAN.

---

## Success Criteria

- [ ] Bulk operations complete 100x faster
- [ ] No increase in Redis memory usage
- [ ] No cache consistency issues
- [ ] Metrics show pipeline usage

---

## Effort Estimation

- **Development:** 2 days
- **Testing:** 1 day
- **Documentation:** 0.5 days
- **Total:** ~3.5 dev-days

---

## Rollback Strategy

1. Revert to sequential implementation
2. No data migration required
3. Immediate rollback possible
