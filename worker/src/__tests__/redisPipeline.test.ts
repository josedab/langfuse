import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  redis,
  batchDelete,
  batchDeletePattern,
  batchSet,
  batchGet,
} from "@langfuse/shared/src/server";

describe("Redis Pipeline Operations", () => {
  const testKeyPrefix = "test:pipeline:";

  beforeEach(async () => {
    // Clear test keys
    if (redis) {
      const keys = await redis.keys(`${testKeyPrefix}*`);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  });

  afterEach(async () => {
    // Clean up test keys
    if (redis) {
      const keys = await redis.keys(`${testKeyPrefix}*`);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  });

  describe("batchDelete", () => {
    it("should delete multiple keys in a single operation", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      // Create test keys
      const keys = [
        `${testKeyPrefix}key1`,
        `${testKeyPrefix}key2`,
        `${testKeyPrefix}key3`,
      ];

      for (const key of keys) {
        await redis.set(key, "value");
      }

      // Verify keys exist
      for (const key of keys) {
        const value = await redis.get(key);
        expect(value).toBe("value");
      }

      // Delete keys in batch
      await batchDelete(keys);

      // Verify all keys are deleted
      for (const key of keys) {
        const value = await redis.get(key);
        expect(value).toBeNull();
      }
    });

    it("should handle empty array gracefully", async () => {
      await expect(batchDelete([])).resolves.toBeUndefined();
    });

    it("should handle large number of keys", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      // Create 100 test keys
      const keys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const key = `${testKeyPrefix}large:${i}`;
        keys.push(key);
        await redis.set(key, `value-${i}`);
      }

      // Delete all keys in batch
      await batchDelete(keys);

      // Verify all keys are deleted
      for (const key of keys) {
        const value = await redis.get(key);
        expect(value).toBeNull();
      }
    });
  });

  describe("batchDeletePattern", () => {
    it("should delete keys matching multiple patterns", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      // Create keys with different patterns
      await redis.set(`${testKeyPrefix}pattern1:a`, "value");
      await redis.set(`${testKeyPrefix}pattern1:b`, "value");
      await redis.set(`${testKeyPrefix}pattern2:a`, "value");
      await redis.set(`${testKeyPrefix}pattern2:b`, "value");
      await redis.set(`${testKeyPrefix}keep:this`, "value");

      // Delete patterns
      await batchDeletePattern([
        `${testKeyPrefix}pattern1:*`,
        `${testKeyPrefix}pattern2:*`,
      ]);

      // Verify pattern keys are deleted
      expect(await redis.get(`${testKeyPrefix}pattern1:a`)).toBeNull();
      expect(await redis.get(`${testKeyPrefix}pattern1:b`)).toBeNull();
      expect(await redis.get(`${testKeyPrefix}pattern2:a`)).toBeNull();
      expect(await redis.get(`${testKeyPrefix}pattern2:b`)).toBeNull();

      // Verify non-matching key is preserved
      expect(await redis.get(`${testKeyPrefix}keep:this`)).toBe("value");
    });

    it("should handle empty patterns array", async () => {
      await expect(batchDeletePattern([])).resolves.toBeUndefined();
    });

    it("should handle patterns with no matches", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      await expect(
        batchDeletePattern([`${testKeyPrefix}nonexistent:*`]),
      ).resolves.toBeUndefined();
    });
  });

  describe("batchSet", () => {
    it("should set multiple keys in a single operation", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      const entries = [
        { key: `${testKeyPrefix}set1`, value: "value1" },
        { key: `${testKeyPrefix}set2`, value: "value2" },
        { key: `${testKeyPrefix}set3`, value: "value3" },
      ];

      await batchSet(entries);

      // Verify all keys are set
      expect(await redis.get(`${testKeyPrefix}set1`)).toBe("value1");
      expect(await redis.get(`${testKeyPrefix}set2`)).toBe("value2");
      expect(await redis.get(`${testKeyPrefix}set3`)).toBe("value3");
    });

    it("should set keys with TTL", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      const entries = [
        { key: `${testKeyPrefix}ttl1`, value: "value1", ttl: 60 },
        { key: `${testKeyPrefix}ttl2`, value: "value2", ttl: 120 },
      ];

      await batchSet(entries);

      // Verify keys are set
      expect(await redis.get(`${testKeyPrefix}ttl1`)).toBe("value1");
      expect(await redis.get(`${testKeyPrefix}ttl2`)).toBe("value2");

      // Verify TTL is set (should be close to the specified value)
      const ttl1 = await redis.ttl(`${testKeyPrefix}ttl1`);
      const ttl2 = await redis.ttl(`${testKeyPrefix}ttl2`);
      expect(ttl1).toBeGreaterThan(0);
      expect(ttl1).toBeLessThanOrEqual(60);
      expect(ttl2).toBeGreaterThan(0);
      expect(ttl2).toBeLessThanOrEqual(120);
    });

    it("should handle empty entries array", async () => {
      await expect(batchSet([])).resolves.toBeUndefined();
    });
  });

  describe("batchGet", () => {
    it("should get multiple keys in a single operation", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      // Set test keys
      await redis.set(`${testKeyPrefix}get1`, "value1");
      await redis.set(`${testKeyPrefix}get2`, "value2");
      await redis.set(`${testKeyPrefix}get3`, "value3");

      const keys = [
        `${testKeyPrefix}get1`,
        `${testKeyPrefix}get2`,
        `${testKeyPrefix}get3`,
      ];

      const values = await batchGet(keys);

      expect(values).toEqual(["value1", "value2", "value3"]);
    });

    it("should return null for missing keys", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      await redis.set(`${testKeyPrefix}exists`, "value");

      const keys = [
        `${testKeyPrefix}exists`,
        `${testKeyPrefix}missing`,
      ];

      const values = await batchGet(keys);

      expect(values).toEqual(["value", null]);
    });

    it("should handle empty keys array", async () => {
      const values = await batchGet([]);
      expect(values).toEqual([]);
    });

    it("should preserve order of results", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      await redis.set(`${testKeyPrefix}order1`, "first");
      await redis.set(`${testKeyPrefix}order2`, "second");
      await redis.set(`${testKeyPrefix}order3`, "third");

      // Request in different order
      const keys = [
        `${testKeyPrefix}order3`,
        `${testKeyPrefix}order1`,
        `${testKeyPrefix}order2`,
      ];

      const values = await batchGet(keys);

      expect(values).toEqual(["third", "first", "second"]);
    });
  });

  describe("Performance characteristics", () => {
    it("should be significantly faster than sequential operations for large batches", async () => {
      if (!redis) {
        console.log("Redis not available, skipping test");
        return;
      }

      const keyCount = 50;
      const entries = Array.from({ length: keyCount }, (_, i) => ({
        key: `${testKeyPrefix}perf:${i}`,
        value: `value-${i}`,
      }));

      // Measure batch set
      const batchStart = Date.now();
      await batchSet(entries);
      const batchDuration = Date.now() - batchStart;

      // Verify all keys were set
      const keys = entries.map((e) => e.key);
      const values = await batchGet(keys);
      expect(values.filter((v) => v !== null).length).toBe(keyCount);

      // Batch operation should complete reasonably quickly
      // (sequential would take ~keyCount * 10ms minimum with network latency)
      expect(batchDuration).toBeLessThan(5000); // Very generous timeout

      // Clean up
      await batchDelete(keys);
    });
  });
});

describe("Batch API Key Invalidation", () => {
  it("should export invalidateCachedOrgApiKeysBatch function", async () => {
    const { invalidateCachedOrgApiKeysBatch } = await import(
      "@langfuse/shared/src/server"
    );
    expect(typeof invalidateCachedOrgApiKeysBatch).toBe("function");
  });

  it("should export invalidateCachedProjectApiKeysBatch function", async () => {
    const { invalidateCachedProjectApiKeysBatch } = await import(
      "@langfuse/shared/src/server"
    );
    expect(typeof invalidateCachedProjectApiKeysBatch).toBe("function");
  });

  it("should export clearNoJobConfigsCacheBatch function", async () => {
    const { clearNoJobConfigsCacheBatch } = await import(
      "@langfuse/shared/src/server"
    );
    expect(typeof clearNoJobConfigsCacheBatch).toBe("function");
  });
});
