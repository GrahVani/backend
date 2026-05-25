import { Request, Response, NextFunction } from "express";

/**
 * Sets Cache-Control headers for knowledge API responses.
 * Knowledge content is static educational text — aggressive caching is safe.
 *
 * - public: CDN/proxy caching allowed (no auth, no PII)
 * - max-age=86400: browser caches for 24 hours
 * - s-maxage=604800: CDN/proxy caches for 7 days
 * - stale-while-revalidate=86400: serve stale while revalidating for 24h
 */
export function cacheMiddleware(maxAge = 86400, sMaxAge = 604800) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set(
      "Cache-Control",
      `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${maxAge}`,
    );
    next();
  };
}
