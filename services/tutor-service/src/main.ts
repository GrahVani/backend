import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestIdMiddleware } from "@grahvani/contracts";
import { config } from "./config";
import { logger } from "./config/logger";
import { healthRouter } from "./routes/health.routes";
import { tutorRouter } from "./routes/tutor.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { rateLimiter } from "./middleware/rate-limit.middleware";
import { rateLimitHeadersMiddleware } from "./middleware/rate-limit-headers.middleware";
import { disconnectPrisma } from "./database/prisma";
import { disconnectRedis } from "./config/redis";
import { createContainer } from "./container";
import { createShutdownManager } from "./utils/shutdown";
import { summarizationQueue } from "./queues/summarization.queue";

const app = express();

// Initialize dependency container (Prisma client and future module services)
createContainer();

app.use(helmet());
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? ["https://grahvani.in"] : "*",
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));

// Request correlation
app.use(requestIdMiddleware);

// Request logging
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
      requestId: req.requestId,
    });
  });
  next();
});

// Rate limiting + header injection
app.use(rateLimiter);
app.use(rateLimitHeadersMiddleware);

// Health endpoints
app.use(healthRouter);
app.use(tutorRouter);

// Root route
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "tutor-service",
    version: "1.0.0",
    endpoints: ["/health", "/health/ready"],
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Error handler
app.use(errorMiddleware);

const PORT = config.port;
const server = app.listen(PORT, () => {
  logger.info(`Tutor Service running on port ${PORT}`);
  logger.info(`   - Health: /health`);
  logger.info(`   - Ready:  /health/ready`);
});

const shutdownManager = createShutdownManager({
  server,
  handlers: [
    async () => {
      logger.info("Disconnecting Prisma client");
      await disconnectPrisma();
    },
    async () => {
      logger.info("Closing summarization queue");
      await summarizationQueue.close();
    },
    async () => {
      logger.info("Disconnecting Redis client");
      await disconnectRedis();
    },
  ],
  serverCloseTimeoutMs: 25_000,
  handlerTimeoutMs: 25_000,
  forceExitTimeoutMs: 60_000,
});

process.on("SIGTERM", () => shutdownManager.shutdown("SIGTERM"));
process.on("SIGINT", () => shutdownManager.shutdown("SIGINT"));

export { app }; // Reload trigger v3
