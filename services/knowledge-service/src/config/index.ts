import { z } from "zod";
import path from "path";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
    override: true,
  });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3017"),
  DATABASE_URL: z
    .string()
    .default(process.env.NODE_ENV === "test" ? "postgresql://mock:mock@localhost:5432/mock" : ""),
});

const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  database: {
    url: env.DATABASE_URL,
  },
};
