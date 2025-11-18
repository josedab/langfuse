# RFC-0006: Increase EventPropagation Queue Retry Attempts

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P1
**Effort:** <1 week

---

## Summary

Increase the retry attempts for the EventPropagationQueue from 3 to 6 and add dead letter queue (DLQ) handling to prevent event loss during transient failures.

---

## Motivation

### Problem Statement

EventPropagationQueue has the lowest retry configuration of all queues:

```typescript
// Current configuration
{
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
}
// Total retry window: 5s + 10s + 20s = 35 seconds
```

Compare to other queues:
- IngestionQueue: 6 attempts (~5 minutes)
- EvalExecutionQueue: 10 attempts
- BatchExport: 8 attempts

### Impact

- Events lost after only 35 seconds of failures
- Database maintenance windows exceed retry window
- Network blips can cause permanent data loss
- No recovery mechanism for failed events

### Event Types Affected

- Trace creation/update events
- Observation creation/update events
- Score creation/update events
- Dataset run item events

---

## Detailed Design

### Configuration Changes

```typescript
// packages/shared/src/server/redis/getQueue.ts

const eventPropagationConfig = {
  attempts: 6,  // Increased from 3
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: true,
  removeOnFail: 10000,  // Increased from 100
};

// New total retry window: 5s + 10s + 20s + 40s + 80s + 160s = 315 seconds (~5 minutes)
```

### Add Dead Letter Queue Handling

```typescript
// worker/src/queues/eventPropagationQueue.ts

import { Queue, Worker } from "bullmq";

// Main queue
const eventPropagationQueue = new Queue("event-propagation", {
  connection: redis,
  defaultJobOptions: eventPropagationConfig,
});

// Dead letter queue for failed jobs
const eventPropagationDLQ = new Queue("event-propagation-dlq", {
  connection: redis,
});

// Worker with DLQ forwarding
const worker = new Worker(
  "event-propagation",
  processor,
  {
    connection: redis,
  }
);

worker.on("failed", async (job, error) => {
  if (job && job.attemptsMade >= eventPropagationConfig.attempts) {
    // Move to DLQ for investigation
    await eventPropagationDLQ.add("failed", {
      originalJob: job.data,
      error: {
        message: error.message,
        stack: error.stack,
      },
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });

    recordIncrement("langfuse.event_propagation.dlq_added");

    logger.error("Event propagation job moved to DLQ", {
      jobId: job.id,
      attempts: job.attemptsMade,
      error: error.message,
    });
  }
});
```

### DLQ Monitoring and Retry

```typescript
// Admin endpoint for DLQ management
// web/src/pages/api/admin/dlq/event-propagation.ts

export default withMiddlewares({
  GET: adminRoute(async (req, res) => {
    // List DLQ jobs
    const jobs = await eventPropagationDLQ.getJobs(["waiting", "failed"]);
    return res.json({
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        data: job.data,
        failedAt: job.data.failedAt,
      })),
    });
  }),

  POST: adminRoute(async (req, res) => {
    // Retry jobs from DLQ
    const { jobIds } = req.body;

    for (const jobId of jobIds) {
      const job = await eventPropagationDLQ.getJob(jobId);
      if (job) {
        // Re-queue to main queue
        await eventPropagationQueue.add("retry", job.data.originalJob);
        await job.remove();
      }
    }

    return res.json({ retriedCount: jobIds.length });
  }),
});
```

### Alerting

```typescript
// Add alert for DLQ growth
// This would integrate with monitoring system

async function checkDLQHealth(): Promise<void> {
  const dlqCount = await eventPropagationDLQ.getWaitingCount();

  recordGauge("langfuse.event_propagation.dlq_depth", dlqCount);

  if (dlqCount > 100) {
    logger.warn("Event propagation DLQ has >100 jobs", {
      count: dlqCount,
    });
    // Trigger alert
  }
}
```

---

## Example Usage

### Before

```typescript
// Job fails after 3 attempts (35 seconds)
// Event is lost

Job attempt 1: Failed (network error)
Job attempt 2: Failed (5s later)
Job attempt 3: Failed (10s later)
// Job discarded, event lost
```

### After

```typescript
// Job has 6 attempts over 5 minutes
// If still failing, moves to DLQ

Job attempt 1: Failed (network error)
Job attempt 2: Failed (5s later)
Job attempt 3: Failed (10s later)
Job attempt 4: Failed (20s later)
Job attempt 5: Failed (40s later)
Job attempt 6: Failed (80s later)
// Job moved to DLQ for investigation
// Admin can retry from DLQ when issue resolved
```

---

## Implementation Plan

| Day | Task | Owner |
|-----|------|-------|
| 1 | Update retry configuration | Backend team |
| 2 | Implement DLQ handling | Backend team |
| 3 | Add admin endpoints | Backend team |
| 4 | Testing and monitoring | QA team |

### Milestones

- [ ] Day 1: Configuration updated
- [ ] Day 2: DLQ implemented
- [ ] Day 4: Deployed to production

---

## Backwards Compatibility

### Breaking Changes

None. Configuration change only.

### Migration Steps

1. Deploy updated configuration
2. Existing jobs automatically get new retry behavior
3. DLQ empty initially, fills only on failures

---

## Alternatives Considered

### 1. No DLQ, Just More Retries

Increase to 10 attempts without DLQ.

**Rejected:**
- Still loses events eventually
- No way to investigate failures
- No manual recovery

### 2. Infinite Retries

Keep retrying forever.

**Rejected:**
- Clogs queue on permanent failures
- No visibility into issues
- Resource waste

### 3. Alert Only

Keep 3 retries, add alerting.

**Rejected:**
- Still loses events
- Alert fatigue without recovery option

---

## Open Questions

1. **Q:** Should DLQ be auto-drained after recovery?
   **A:** Manual review preferred for visibility into failure patterns.

2. **Q:** How long to keep jobs in DLQ?
   **A:** 7 days default, configurable.

3. **Q:** Should we add UI for DLQ management?
   **A:** Start with admin API, add UI based on usage.

---

## Success Criteria

- [ ] Retry window extended to 5 minutes
- [ ] DLQ captures all exhausted jobs
- [ ] Admin can view and retry DLQ jobs
- [ ] Alerting on DLQ depth

### Metrics to Track

```typescript
"langfuse.event_propagation.attempts" // Histogram
"langfuse.event_propagation.dlq_added" // Counter
"langfuse.event_propagation.dlq_depth" // Gauge
"langfuse.event_propagation.dlq_retried" // Counter
```

---

## Effort Estimation

- **Development:** 2 days
- **Testing:** 1 day
- **Documentation:** 0.5 days
- **Total:** ~3.5 dev-days

---

## Rollback Strategy

1. Revert configuration to 3 attempts
2. DLQ continues to function
3. Existing DLQ jobs remain for retry
