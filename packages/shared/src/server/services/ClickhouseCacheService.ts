import { createHash } from "crypto";
import Redis, { Cluster } from "ioredis";
import { SpanKind } from "@opentelemetry/api";
import { env } from "../../env";
import { redis, scanKeys, safeMultiDel } from "../redis/redis";
import {
  recordIncrement,
  recordHistogram,
  instrumentAsync,
} from "../instrumentation";
import { logger } from "../logger";

const CACHE_PREFIX = "langfuse:ch";

export interface CacheConfig {
  /** Whether caching is enabled for this query */
  enabled: boolean;
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Force fresh data by skipping cache read */
  skipCacheRead?: boolean;
  /** Don't cache the result */
  skipCacheWrite?: boolean;
}

/** Default cache configurations for different query types */
export const CacheTTL = {
  /** Dashboard aggregations - balance freshness vs performance */
  DASHBOARD: 60,
  /** Trace lists - moderate update frequency */
  TRACE_LIST: 30,
  /** Metrics/analytics - historical data rarely changes */
  METRICS: 300,
  /** Single entity lookup - high update frequency */
  SINGLE_ENTITY: 10,
} as const;

/**
 * Sort object keys for consistent hashing
 */
function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }

  return Object.keys(obj)
    .sort()
    .reduce(
      (result, key) => {
        const value = obj[key];
        result[key] =
          typeof value === "object" && value !== null
            ? sortKeys(value as Record<string, unknown>)
            : value;
        return result;
      },
      {} as Record<string, unknown>,
    );
}

/**
 * Generate a cache key for a ClickHouse query
 * Format: langfuse:ch:{queryHash}:{projectId}:{paramHash}
 */
export function generateCacheKey(
  queryTemplate: string,
  projectId: string,
  params: Record<string, unknown>,
): string {
  const queryHash = createHash("sha256")
    .update(queryTemplate)
    .digest("hex")
    .substring(0, 8);

  const paramHash = createHash("sha256")
    .update(JSON.stringify(sortKeys(params)))
    .digest("hex")
    .substring(0, 8);

  return `${CACHE_PREFIX}:${queryHash}:${projectId}:${paramHash}`;
}

/**
 * Service for caching ClickHouse query results in Redis
 */
export class ClickhouseCacheService {
  private static instance: ClickhouseCacheService | null = null;
  private redis: Redis | Cluster | null;

  private constructor() {
    this.redis = redis;
  }

  public static getInstance(): ClickhouseCacheService {
    if (!this.instance) {
      this.instance = new ClickhouseCacheService();
    }
    return this.instance;
  }

  /**
   * Check if caching is enabled
   */
  public isEnabled(): boolean {
    return (
      this.redis !== null && env.LANGFUSE_CACHE_CLICKHOUSE_ENABLED === "true"
    );
  }

  /**
   * Get cached query result
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;

    return instrumentAsync(
      { name: "clickhouse-cache-get", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("cache.key", key);
        span.setAttribute("cache.operation", "get");

        try {
          const startTime = Date.now();
          const cached = await this.redis!.get(key);
          const latency = Date.now() - startTime;

          recordHistogram("langfuse.clickhouse.cache.get_latency_ms", latency);

          if (cached) {
            recordIncrement("langfuse.clickhouse.cache.hit");
            span.setAttribute("cache.hit", true);

            try {
              return JSON.parse(cached) as T;
            } catch (parseError) {
              logger.warn("Failed to parse cached ClickHouse result", {
                key,
                error:
                  parseError instanceof Error
                    ? parseError.message
                    : String(parseError),
              });
              // Delete corrupted cache entry
              await this.redis!.del(key);
              return null;
            }
          }

          recordIncrement("langfuse.clickhouse.cache.miss");
          span.setAttribute("cache.hit", false);
          return null;
        } catch (error) {
          logger.error("Error getting cached ClickHouse result", {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
          recordIncrement("langfuse.clickhouse.cache.error", 1, {
            operation: "get",
          });
          span.setAttribute("cache.error", true);
          return null;
        }
      },
    );
  }

  /**
   * Cache a query result
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;

    return instrumentAsync(
      { name: "clickhouse-cache-set", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("cache.key", key);
        span.setAttribute("cache.operation", "set");
        span.setAttribute("cache.ttl_seconds", ttlSeconds);

        try {
          const serialized = JSON.stringify(value);
          const startTime = Date.now();

          await this.redis!.setex(key, ttlSeconds, serialized);

          const latency = Date.now() - startTime;
          recordHistogram("langfuse.clickhouse.cache.set_latency_ms", latency);
          recordIncrement("langfuse.clickhouse.cache.set");

          span.setAttribute("cache.value_size_bytes", serialized.length);
        } catch (error) {
          logger.error("Error setting cached ClickHouse result", {
            key,
            ttlSeconds,
            error: error instanceof Error ? error.message : String(error),
          });
          recordIncrement("langfuse.clickhouse.cache.error", 1, {
            operation: "set",
          });
          span.setAttribute("cache.error", true);
        }
      },
    );
  }

  /**
   * Invalidate cache entries matching a pattern
   * Use with caution in production as pattern matching can be expensive
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.redis) return 0;

    return instrumentAsync(
      { name: "clickhouse-cache-invalidate", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("cache.pattern", pattern);
        span.setAttribute("cache.operation", "invalidate");

        try {
          const keys = await scanKeys(this.redis, pattern);

          if (keys.length > 0) {
            await safeMultiDel(this.redis, keys);
            recordIncrement(
              "langfuse.clickhouse.cache.invalidated",
              keys.length,
            );
            span.setAttribute("cache.invalidated_count", keys.length);
          }

          return keys.length;
        } catch (error) {
          logger.error("Error invalidating ClickHouse cache", {
            pattern,
            error: error instanceof Error ? error.message : String(error),
          });
          recordIncrement("langfuse.clickhouse.cache.error", 1, {
            operation: "invalidate",
          });
          span.setAttribute("cache.error", true);
          return 0;
        }
      },
    );
  }

  /**
   * Invalidate all cache entries for a specific project
   */
  async invalidateProject(projectId: string): Promise<number> {
    return this.invalidate(`${CACHE_PREFIX}:*:${projectId}:*`);
  }

  /**
   * Delete a specific cache entry
   */
  async delete(key: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(key);
      recordIncrement("langfuse.clickhouse.cache.delete");
    } catch (error) {
      logger.error("Error deleting ClickHouse cache entry", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      recordIncrement("langfuse.clickhouse.cache.error", 1, {
        operation: "delete",
      });
    }
  }
}
