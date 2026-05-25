import { z } from "zod";

export const termKeySchema = z.object({
  termKey: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Term key must be lowercase alphanumeric with underscores"),
});

export const batchQuerySchema = z.object({
  keys: z
    .string()
    .min(1, "keys parameter is required")
    .transform((val) => val.split(",").map((k) => k.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().min(1).max(100).regex(/^[a-z0-9_]+$/))
        .min(1, "At least 1 key required")
        .max(50, "Maximum 50 keys per batch"),
    ),
});

export const domainParamSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z_]+$/),
});

export const categoryParamSchema = z.object({
  category: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_]+$/),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  domain: z.string().max(30).optional(),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default("20"),
});
