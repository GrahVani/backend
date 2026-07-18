import type { ErrorRequestHandler, Request } from "express";
import { BaseError } from "@grahvani/contracts";
import { logger } from "../config/logger";

export const errorMiddleware: ErrorRequestHandler = (err: Error, req: Request, res, _next) => {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof BaseError) {
    logger.warn({ err, requestId, path: req.path }, "Application error");
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
    return;
  }

  logger.error({ err, requestId, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
};
