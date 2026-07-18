import { prisma } from "../database/prisma";
import { redis } from "../config/redis";
import { logger } from "../config/logger";

export interface HealthChecks {
  database: boolean;
  redis: boolean;
}

export async function checkHealth(): Promise<HealthChecks> {
  const checks: HealthChecks = { database: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    logger.error({ err }, "Database health check failed");
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    logger.error({ err }, "Redis health check failed");
  }

  return checks;
}

export function isHealthy(checks: HealthChecks): boolean {
  return checks.database && checks.redis;
}
