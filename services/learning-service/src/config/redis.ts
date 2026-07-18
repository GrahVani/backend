import Redis from "ioredis";
import { logger } from "./logger";

let redisClient: Redis | null = null;

/**
 * Returns a singleton ioredis publisher client for learning-service.
 * The client is created lazily and reused across all publish calls.
 * If REDIS_URL is not set, a no-op stub is returned so callers can still
 * invoke publish() without crashing, but events will be skipped.
 */
export function getRedisPublisher(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      logger.error({ err }, "Learning service Redis publisher error");
    });

    redisClient.on("connect", () => {
      logger.info("Learning service Redis publisher connected");
    });
  }

  return redisClient;
}

/**
 * Disconnects the Redis publisher immediately.
 * Uses disconnect() rather than quit() so shutdown cannot be blocked.
 */
export async function disconnectRedisPublisher(): Promise<void> {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch (err) {
      logger.error({ err }, "Failed to disconnect Redis publisher");
    } finally {
      redisClient = null;
    }
  }
}
