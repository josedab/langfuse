import {
  ClickhouseCacheService,
  generateCacheKey,
  CacheTTL,
  queryClickhouseCached,
} from "@langfuse/shared/src/server";
import { redis } from "@langfuse/shared/src/server";

describe("ClickHouse Query Cache", () => {
  const testProjectId = "test-project-cache-123";
  const testQuery = "SELECT count() FROM traces WHERE project_id = {projectId: String}";
  const testParams = { projectId: testProjectId };

  beforeEach(async () => {
    // Clean up any existing test cache entries
    if (redis) {
      const keys = await redis.keys(`langfuse:ch:*:${testProjectId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => redis!.del(key)));
      }
    }
  });

  describe("generateCacheKey", () => {
    it("should generate consistent cache keys for same inputs", () => {
      const key1 = generateCacheKey(testQuery, testProjectId, testParams);
      const key2 = generateCacheKey(testQuery, testProjectId, testParams);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^langfuse:ch:[a-f0-9]{8}:test-project-cache-123:[a-f0-9]{8}$/);
    });

    it("should generate different keys for different queries", () => {
      const key1 = generateCacheKey(testQuery, testProjectId, testParams);
      const key2 = generateCacheKey(
        "SELECT * FROM traces WHERE project_id = {projectId: String}",
        testProjectId,
        testParams
      );

      expect(key1).not.toBe(key2);
    });

    it("should generate different keys for different params", () => {
      const key1 = generateCacheKey(testQuery, testProjectId, { projectId: "proj-1" });
      const key2 = generateCacheKey(testQuery, testProjectId, { projectId: "proj-2" });

      expect(key1).not.toBe(key2);
    });

    it("should generate same key regardless of param order", () => {
      const key1 = generateCacheKey(testQuery, testProjectId, { a: 1, b: 2 });
      const key2 = generateCacheKey(testQuery, testProjectId, { b: 2, a: 1 });

      expect(key1).toBe(key2);
    });

    it("should handle nested objects consistently", () => {
      const key1 = generateCacheKey(testQuery, testProjectId, {
        filter: { type: "string", value: "test" },
        limit: 10,
      });
      const key2 = generateCacheKey(testQuery, testProjectId, {
        limit: 10,
        filter: { value: "test", type: "string" },
      });

      expect(key1).toBe(key2);
    });
  });

  describe("CacheTTL constants", () => {
    it("should have correct default TTL values", () => {
      expect(CacheTTL.DASHBOARD).toBe(60);
      expect(CacheTTL.TRACE_LIST).toBe(30);
      expect(CacheTTL.METRICS).toBe(300);
      expect(CacheTTL.SINGLE_ENTITY).toBe(10);
    });
  });

  describe("ClickhouseCacheService", () => {
    let cacheService: ClickhouseCacheService;

    beforeEach(() => {
      cacheService = ClickhouseCacheService.getInstance();
    });

    it("should return singleton instance", () => {
      const instance1 = ClickhouseCacheService.getInstance();
      const instance2 = ClickhouseCacheService.getInstance();

      expect(instance1).toBe(instance2);
    });

    describe("when Redis is available", () => {
      // Skip these tests if Redis is not configured
      const skipIfNoRedis = redis ? describe : describe.skip;

      skipIfNoRedis("cache operations", () => {
        it("should cache and retrieve values", async () => {
          const cacheKey = generateCacheKey(testQuery, testProjectId, testParams);
          const testData = [{ count: 100 }];

          await cacheService.set(cacheKey, testData, 60);
          const cached = await cacheService.get<typeof testData>(cacheKey);

          expect(cached).toEqual(testData);
        });

        it("should return null for cache miss", async () => {
          const cacheKey = generateCacheKey(
            testQuery,
            testProjectId,
            { projectId: "non-existent" }
          );

          const cached = await cacheService.get(cacheKey);

          expect(cached).toBeNull();
        });

        it("should delete cache entries", async () => {
          const cacheKey = generateCacheKey(testQuery, testProjectId, testParams);
          const testData = [{ count: 200 }];

          await cacheService.set(cacheKey, testData, 60);
          await cacheService.delete(cacheKey);
          const cached = await cacheService.get(cacheKey);

          expect(cached).toBeNull();
        });

        it("should invalidate project cache", async () => {
          // Set up multiple cache entries for the same project
          const key1 = generateCacheKey(testQuery, testProjectId, { projectId: testProjectId });
          const key2 = generateCacheKey(
            "SELECT * FROM observations",
            testProjectId,
            { projectId: testProjectId }
          );

          await cacheService.set(key1, [{ count: 1 }], 60);
          await cacheService.set(key2, [{ count: 2 }], 60);

          // Invalidate project cache
          const invalidatedCount = await cacheService.invalidateProject(testProjectId);

          // Verify both entries are invalidated
          const cached1 = await cacheService.get(key1);
          const cached2 = await cacheService.get(key2);

          expect(invalidatedCount).toBeGreaterThanOrEqual(2);
          expect(cached1).toBeNull();
          expect(cached2).toBeNull();
        });

        it("should handle complex data structures", async () => {
          const cacheKey = generateCacheKey(testQuery, testProjectId, testParams);
          const complexData = [
            {
              id: "trace-1",
              name: "Test Trace",
              metadata: { key: "value", nested: { a: 1 } },
              tags: ["tag1", "tag2"],
              timestamp: "2024-01-01T00:00:00Z",
            },
          ];

          await cacheService.set(cacheKey, complexData, 60);
          const cached = await cacheService.get<typeof complexData>(cacheKey);

          expect(cached).toEqual(complexData);
        });
      });
    });
  });

  describe("queryClickhouseCached", () => {
    // These tests verify the caching wrapper works correctly
    // They use actual ClickHouse queries but with caching

    it("should execute query when cache is disabled", async () => {
      const result = await queryClickhouseCached<{ test_value: number }>({
        query: "SELECT 1 as test_value",
        params: {},
        projectId: testProjectId,
        cache: {
          enabled: false,
          ttlSeconds: 60,
        },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].test_value).toBe(1);
    });

    it("should execute query with cache enabled", async () => {
      const result = await queryClickhouseCached<{ test_value: number }>({
        query: "SELECT 2 as test_value",
        params: {},
        projectId: testProjectId,
        cache: {
          enabled: true,
          ttlSeconds: 60,
        },
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].test_value).toBe(2);
    });

    it("should skip cache read when skipCacheRead is true", async () => {
      const cacheService = ClickhouseCacheService.getInstance();
      const cacheKey = generateCacheKey(
        "SELECT 3 as test_value",
        testProjectId,
        {}
      );

      // Pre-populate cache with stale data
      if (cacheService.isEnabled()) {
        await cacheService.set(cacheKey, [{ test_value: 999 }], 60);
      }

      const result = await queryClickhouseCached<{ test_value: number }>({
        query: "SELECT 3 as test_value",
        params: {},
        projectId: testProjectId,
        cache: {
          enabled: true,
          ttlSeconds: 60,
          skipCacheRead: true,
        },
      });

      // Should get fresh data from ClickHouse, not cached value
      expect(result[0].test_value).toBe(3);
    });

    it("should skip cache write when skipCacheWrite is true", async () => {
      const cacheService = ClickhouseCacheService.getInstance();

      // Execute query with skipCacheWrite
      await queryClickhouseCached<{ test_value: number }>({
        query: "SELECT 4 as test_value",
        params: {},
        projectId: testProjectId,
        cache: {
          enabled: true,
          ttlSeconds: 60,
          skipCacheWrite: true,
        },
      });

      // Verify nothing was cached
      if (cacheService.isEnabled()) {
        const cacheKey = generateCacheKey(
          "SELECT 4 as test_value",
          testProjectId,
          {}
        );
        const cached = await cacheService.get(cacheKey);
        expect(cached).toBeNull();
      }
    });

    it("should handle query errors gracefully", async () => {
      await expect(
        queryClickhouseCached({
          query: "SELECT * FROM non_existent_table_xyz123",
          params: {},
          projectId: testProjectId,
          cache: {
            enabled: true,
            ttlSeconds: 60,
          },
        })
      ).rejects.toThrow();
    });

    it("should pass tags to underlying query", async () => {
      const result = await queryClickhouseCached<{ test_value: number }>({
        query: "SELECT 5 as test_value",
        params: {},
        projectId: testProjectId,
        cache: {
          enabled: true,
          ttlSeconds: 60,
        },
        tags: {
          feature: "test",
          operation: "cache-test",
        },
      });

      expect(result).toBeDefined();
      expect(result[0].test_value).toBe(5);
    });
  });

  describe("Cache key format", () => {
    it("should include prefix, query hash, project id, and param hash", () => {
      const key = generateCacheKey(testQuery, testProjectId, testParams);
      const parts = key.split(":");

      expect(parts[0]).toBe("langfuse");
      expect(parts[1]).toBe("ch");
      expect(parts[2]).toMatch(/^[a-f0-9]{8}$/); // query hash
      expect(parts[3]).toBe(testProjectId);
      expect(parts[4]).toMatch(/^[a-f0-9]{8}$/); // param hash
    });
  });
});
