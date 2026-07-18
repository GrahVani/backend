import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

process.env.TZ = "Asia/Kolkata";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), override: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3015"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TUTOR_DATABASE_URL: z.string(),
  TUTOR_REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32).default("test-secret-at-least-32-characters-long"),
  INTERNAL_SERVICE_KEY: z.string().default("dev-internal-key"),
  ADMIN_SERVICE_URL: z.string().url().optional(),
  LEARNING_SERVICE_URL: z.string().url().optional(),
  KNOWLEDGE_SERVICE_URL: z.string().url().optional(),
  USER_SERVICE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().default("xxx"),
  TUTOR_GEMINI_MODEL: z.string().default("gemini-2.5-flash-lite"),
  TUTOR_GEMINI_RETRY_COUNT: z.string().transform(Number).default("3"),
  TUTOR_GEMINI_TIMEOUT_MS: z.string().transform(Number).default("30000"),
  TUTOR_GEMINI_COOLDOWN_MS: z.string().transform(Number).default("10000"),
  TUTOR_GEMINI_FAILURE_THRESHOLD: z.string().transform(Number).default("5"),
  TUTOR_GEMINI_RETRY_DELAY_MS: z.string().transform(Number).default("1000"),
});

const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  database: { url: env.TUTOR_DATABASE_URL },
  redis: { url: env.TUTOR_REDIS_URL },
  jwt: { secret: env.JWT_SECRET },
  internalServiceKey: env.INTERNAL_SERVICE_KEY,
  geminiApiKey: env.GEMINI_API_KEY,
  services: {
    admin: env.ADMIN_SERVICE_URL,
    learning: env.LEARNING_SERVICE_URL,
    knowledge: env.KNOWLEDGE_SERVICE_URL,
    user: env.USER_SERVICE_URL,
  },
  gemini: {
    model: env.TUTOR_GEMINI_MODEL,
    retryCount: env.TUTOR_GEMINI_RETRY_COUNT,
    timeoutMs: env.TUTOR_GEMINI_TIMEOUT_MS,
    cooldownMs: env.TUTOR_GEMINI_COOLDOWN_MS,
    failureThreshold: env.TUTOR_GEMINI_FAILURE_THRESHOLD,
    retryDelayMs: env.TUTOR_GEMINI_RETRY_DELAY_MS,
  },
};
