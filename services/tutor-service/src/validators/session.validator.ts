import { z } from "zod";

export const createSessionSchema = z.object({
  lessonSlug: z.string().optional(),
  title: z.string().min(1).max(200),
});

export const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"]).optional(),
});
