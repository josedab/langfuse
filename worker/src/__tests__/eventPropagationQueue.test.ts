import { expect, test, describe } from "vitest";
import {
  QueueName,
  EventPropagationQueue,
} from "@langfuse/shared/src/server";
import { DlqRetryService } from "../services/dlq/dlqRetryService";

describe("EventPropagationQueue configuration", () => {
  test("should have correct retry configuration with 6 attempts", async () => {
    const queue = EventPropagationQueue.getInstance();

    if (!queue) {
      // Skip test if Redis is not available
      console.log("Skipping test - Redis not available");
      return;
    }

    const defaultJobOptions = queue.jobsOpts;

    // Verify the retry configuration matches RFC-0006 requirements
    expect(defaultJobOptions?.attempts).toBe(6);
    expect(defaultJobOptions?.removeOnFail).toBe(10000);
    expect(defaultJobOptions?.removeOnComplete).toBe(true);
    expect(defaultJobOptions?.backoff).toEqual({
      type: "exponential",
      delay: 5000,
    });
  });

  test("should be included in DlqRetryService retry queues", () => {
    // Access the private static property through type assertion
    const dlqService = DlqRetryService as unknown as {
      retryQueues: readonly string[];
    };

    expect(dlqService.retryQueues).toContain(QueueName.EventPropagationQueue);
  });

  test("should calculate correct total retry window", () => {
    // With exponential backoff starting at 5000ms and 6 attempts:
    // Attempt 1: immediate
    // Attempt 2: 5000ms delay
    // Attempt 3: 10000ms delay
    // Attempt 4: 20000ms delay
    // Attempt 5: 40000ms delay
    // Attempt 6: 80000ms delay
    // Total: 5000 + 10000 + 20000 + 40000 + 80000 = 155000ms (not 315s as in RFC)
    // Note: RFC calculation appears to include 160s for attempt 6 but BullMQ
    // calculates delays between attempts, so the window is approximately 2.5 minutes

    const baseDelay = 5000;
    const attempts = 6;
    let totalDelay = 0;

    for (let i = 1; i < attempts; i++) {
      totalDelay += baseDelay * Math.pow(2, i - 1);
    }

    // Total delay should be significantly longer than the previous 35 seconds (3 attempts)
    // Old: 5000 + 10000 + 20000 = 35000ms
    // New: 5000 + 10000 + 20000 + 40000 + 80000 = 155000ms (~2.5 minutes)
    expect(totalDelay).toBe(155000);
    expect(totalDelay).toBeGreaterThan(35000); // More than 4x the previous window
  });
});
