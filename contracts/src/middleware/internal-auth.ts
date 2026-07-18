import type { Request, Response, NextFunction } from "express";

export interface InternalAuthRequest extends Request {
  internalService?: {
    authenticated: true;
  };
}

export interface InternalAuthMiddlewareOptions {
  /**
   * Returns the expected internal service key (typically from INTERNAL_SERVICE_KEY env var).
   */
  getServiceKey: () => string | undefined;
  /**
   * Header name to read. Defaults to `x-internal-key` per repository convention.
   */
  headerName?: string;
}

/**
 * Factory that creates an Express middleware for service-to-service authentication.
 *
 * The middleware validates the `x-internal-key` header (configurable) against a
 * configured service key. On success it sets `req.internalService` and calls `next()`.
 * On failure it returns a 401 JSON response matching the canonical error shape.
 */
export function createInternalAuthMiddleware(options: InternalAuthMiddlewareOptions) {
  const headerName = options.headerName ?? "x-internal-key";

  return (req: InternalAuthRequest, res: Response, next: NextFunction) => {
    const expectedKey = options.getServiceKey();

    if (!expectedKey) {
      throw new Error("INTERNAL_SERVICE_KEY is not configured. Internal authentication cannot be verified.");
    }

    const providedKey = req.headers[headerName];

    if (!providedKey || providedKey !== expectedKey) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing internal service key",
        },
      });
    }

    req.internalService = { authenticated: true };
    next();
  };
}
