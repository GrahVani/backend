import type { Request, Response, NextFunction } from "express";

/**
 * Ensures legacy `X-RateLimit-*` headers are present on every response by
 * copying values from the standard `RateLimit-*` headers set by the rate limiter.
 */
export function rateLimitHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const standardToLegacy: Record<string, string> = {
    "RateLimit-Limit": "X-RateLimit-Limit",
    "RateLimit-Remaining": "X-RateLimit-Remaining",
    "RateLimit-Reset": "X-RateLimit-Reset",
  };

  for (const [standard, legacy] of Object.entries(standardToLegacy)) {
    if (!res.hasHeader(legacy)) {
      const value = res.getHeader(standard);
      if (value !== undefined) {
        res.setHeader(legacy, value);
      }
    }
  }

  next();
}
