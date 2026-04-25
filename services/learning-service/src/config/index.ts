import { z } from "zod";
import path from "path";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3013"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default(process.env.NODE_ENV === "test" ? "mock-secret-at-least-32-chars-long" : ""),
});

const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  database: { url: env.DATABASE_URL },
  redis: { url: env.REDIS_URL },
  jwt: { secret: env.JWT_SECRET },
};
