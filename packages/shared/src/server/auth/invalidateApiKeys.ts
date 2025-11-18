import { prisma } from "../../db";
import { redis, safeMultiDel } from "..";
import { batchDelete } from "../redis/pipeline";
import { logger } from "../logger";

import { type ApiKey } from "../../db";

/**
 * Invalidate cached API keys from Redis cache
 *
 * Utility used by higher-level helpers to remove individual API keys from the cache,
 * e.g. after key rotation, revocation, or entitlement/plan changes.
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * Behavior:
 * - Skips keys without a `fastHashedSecretKey`
 * - No-ops when Redis is not configured
 *
 * @param apiKeys - List of API key records to invalidate from cache
 * @param identifier - Context string for logging (e.g., org or project identifier)
 */
export async function invalidateCachedApiKeys(
  apiKeys: ApiKey[],
  identifier: string,
) {
  const hashKeys = apiKeys.map((key) => key.fastHashedSecretKey);

  const filteredHashKeys = hashKeys.filter((hash): hash is string =>
    Boolean(hash),
  );
  if (filteredHashKeys.length === 0) {
    logger.info("No valid keys to invalidate");
    return;
  }

  if (redis) {
    logger.info(`Invalidating API keys in redis for ${identifier}`);
    const keysToDelete = filteredHashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}

/**
 * Invalidate all cached API keys for an organization from Redis cache
 *
 * This function is used when organization-level changes occur that affect API key validity,
 * such as:
 * - Plan changes (subscription created/updated/deleted)
 * - Usage threshold state changes (blocking/unblocking)
 * - Billing cycle changes
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * @param orgId - The organization ID whose API keys should be invalidated from cache
 */
export async function invalidateCachedOrgApiKeys(orgId: string): Promise<void> {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      OR: [
        {
          project: {
            orgId,
          },
        },
        { orgId },
      ],
    },
  });

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(`No valid API keys to invalidate for org ${orgId}`);
    return;
  }

  if (redis) {
    logger.info(`Invalidating API keys in redis for org ${orgId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}

/**
 * Invalidate all cached API keys for a project from Redis cache
 *
 * This function is used when project-level changes occur that affect API key validity.
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * @param projectId - The project ID whose API keys should be invalidated from cache
 */
export async function invalidateCachedProjectApiKeys(
  projectId: string,
): Promise<void> {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      projectId: projectId,
      scope: "PROJECT",
    },
  });

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(`No valid API keys to invalidate for project ${projectId}`);
    return;
  }

  if (redis) {
    logger.info(`Invalidating API keys in redis for project ${projectId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}

/**
 * Invalidate all cached API keys for multiple organizations in a single batch operation.
 *
 * This function is optimized for bulk operations where multiple organizations need
 * their API keys invalidated at once. Uses pipelined Redis operations for efficiency.
 *
 * Performance:
 * - 100 orgs: ~50ms (vs ~10s sequential)
 * - 1,000 orgs: ~100ms (vs ~100s sequential)
 *
 * @param orgIds - Array of organization IDs whose API keys should be invalidated
 */
export async function invalidateCachedOrgApiKeysBatch(
  orgIds: string[],
): Promise<void> {
  if (orgIds.length === 0) return;

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      OR: [
        {
          project: {
            orgId: { in: orgIds },
          },
        },
        { orgId: { in: orgIds } },
      ],
    },
  });

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(
      `No valid API keys to invalidate for ${orgIds.length} organizations`,
    );
    return;
  }

  logger.info(
    `Invalidating ${hashKeys.length} API keys in redis for ${orgIds.length} organizations`,
  );
  const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
  await batchDelete(keysToDelete);
}

/**
 * Invalidate all cached API keys for multiple projects in a single batch operation.
 *
 * @param projectIds - Array of project IDs whose API keys should be invalidated
 */
export async function invalidateCachedProjectApiKeysBatch(
  projectIds: string[],
): Promise<void> {
  if (projectIds.length === 0) return;

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      projectId: { in: projectIds },
      scope: "PROJECT",
    },
  });

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(
      `No valid API keys to invalidate for ${projectIds.length} projects`,
    );
    return;
  }

  logger.info(
    `Invalidating ${hashKeys.length} API keys in redis for ${projectIds.length} projects`,
  );
  const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
  await batchDelete(keysToDelete);
}
