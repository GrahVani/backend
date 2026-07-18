import { z } from "zod";

export const createMessageSchema = z.object({
  content: z.string().min(1).max(10_000),
  clientMessageId: z.string().min(1).max(64),
  lessonSlug: z.string().optional(),
});

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});
