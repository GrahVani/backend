import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") }); // Root .env
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true }); // Service .env

export const config = {
  port: parseInt(process.env.ASTRO_ENGINE_PORT || process.env.PORT || "3014", 10),
  astroEngineUrl: process.env.ASTRO_ENGINE_EXTERNAL_URL || "https://astroengine.astrocorp.in",
  astroEngineApiKey: process.env.ASTRO_ENGINE_API_KEY,
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "86400", 10),
  },
  logLevel: process.env.LOG_LEVEL || "info",
};

export function getAstroEngineApiKeyHeader(): Record<string, string> {
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(config.astroEngineUrl);
  if (config.astroEngineApiKey && !isLocalhost) {
    return { "X-API-Key": config.astroEngineApiKey };
  }
  return {};
}
