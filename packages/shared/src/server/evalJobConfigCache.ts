import { logger } from "./logger";
import { redis } from "./";
import { batchDelete } from "./redis/pipeline";

/**
 * Redis cache utilities for eval job configuration optimization.
 *
 * This module provides caching functionality to reduce database calls when
 * checking for job configurations. When a project has no active evaluation
 * job configurations, we cache this information in Redis to avoid unnecessary
 * database queries and queue processing.
 */

const NO_JOB_CONFIG_PREFIX = "langfuse:eval:no-job-configs";

/**
 * Check if a project has no job configurations cached in Redis.
 * Returns true if the cache indicates no eval job configs exist.
 *
 * @param projectId - The project ID to check cache for
 * @returns Promise<boolean> - true if no eval job configs present
 */
export const hasNoJobConfigsCache = async (
  projectId: string,
): Promise<boolean> => {
  if (!redis) {
    return false;
  }

  try {
    const cacheKey = `${NO_JOB_CONFIG_PREFIX}:${projectId}`;
    const cached = await redis.get(cacheKey);
    return Boolean(cached);
  } catch (error) {
    logger.error("Failed to check no eval job configs cache", error);
    return false;
  }
};

/**
 * Cache that a project has no active job configurations.
 * This is set when a database query returns no active EVAL job configurations.
 * The cache expires after 10 minutes to ensure eventual consistency.
 *
 * @param projectId - The project ID to cache
 */
export const setNoJobConfigsCache = async (
  projectId: string,
): Promise<void> => {
  if (!redis) {
    return;
  }

  try {
    const cacheKey = `${NO_JOB_CONFIG_PREFIX}:${projectId}`;
    await redis.setex(cacheKey, 600, "1"); // Cache for 10 minutes
    logger.debug(`Cached no eval job configs for project ${projectId}`);
  } catch (error) {
    logger.error("Failed to cache no eval job configs status", error);
  }
};

/**
 * Clear the "no eval job configs" cache for a project.
 * Should be called when job configurations are created or activated.
 *
 * @param projectId - The project ID to clear cache for
 */
export const clearNoJobConfigsCache = async (
  projectId: string,
): Promise<void> => {
  if (!redis) {
    return;
  }

  try {
    const cacheKey = `${NO_JOB_CONFIG_PREFIX}:${projectId}`;
    await redis.del(cacheKey);
    logger.debug(`Cleared no eval job configs cache for project ${projectId}`);
  } catch (error) {
    logger.error("Failed to clear no eval job configs cache", error);
  }
};

/**
 * Clear the "no eval job configs" cache for multiple projects in batch.
 * Uses pipelined Redis operations for efficiency.
 *
 * Performance:
 * - 100 projects: ~50ms (vs ~10s sequential)
 * - 1,000 projects: ~100ms (vs ~100s sequential)
 *
 * @param projectIds - Array of project IDs to clear cache for
 */
export const clearNoJobConfigsCacheBatch = async (
  projectIds: string[],
): Promise<void> => {
  if (projectIds.length === 0) {
    return;
  }

  try {
    const cacheKeys = projectIds.map(
      (projectId) => `${NO_JOB_CONFIG_PREFIX}:${projectId}`,
    );
    await batchDelete(cacheKeys);
    logger.debug(
      `Batch cleared no eval job configs cache for ${projectIds.length} projects`,
    );
  } catch (error) {
    logger.error("Failed to batch clear no eval job configs cache", error);
  }
};
