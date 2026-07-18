import Redis from "ioredis";
import { config } from "./index";
import { logger } from "./logger";

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("Redis client disconnected");
  } catch (err) {
    logger.error({ err }, "Failed to disconnect Redis client");
    throw err;
  }
}
