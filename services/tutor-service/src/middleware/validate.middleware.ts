import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export interface ValidationTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}

/**
 * Express middleware factory that validates request body, query, and/or params
 * against Zod schemas. Returns 400 with a `VALIDATION_ERROR` envelope on failure.
 */
export function validate(target: ValidationTarget) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ field: string; message: string }> = [];

    for (const [key, schema] of Object.entries(target) as Array<
      [keyof ValidationTarget, ZodSchema]
    >) {
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error));
      } else {
        req[key] = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: errors,
        },
      });
    }

    next();
  };
}
