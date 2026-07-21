process.env.TZ = "Asia/Kolkata";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestIdMiddleware } from "@grahvani/contracts";
import { config } from "./config";
import { learnRoutes } from "./interfaces/http/routes/learn.routes";
import { adminRoutes } from "./interfaces/http/routes/admin.routes";
import { internalRoutes } from "./interfaces/http/routes/internal.routes";
import gamificationRoutes from "./routes/gamification.routes";
import { logger } from "./config/logger";
import { disconnectRedisPublisher } from "./config/redis";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? ["https://grahvani.in"] : "*",
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));

// Request correlation ID forwarding / generation
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

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "learning-service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "learning-service",
    version: "1.0.0",
    endpoints: ["/health", "/api/v1/learn/*"],
  });
});

// Routes (more specific sub-paths mounted before general path prefix)
app.use("/api/v1/learn/admin", adminRoutes);
app.use("/api/v1/learn/gamification", gamificationRoutes);
app.use("/api/v1/learn", learnRoutes);
app.use("/internal", internalRoutes);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

const PORT = config.port;
const server = app.listen(PORT, () => {
  logger.info(`Learning Service running on port ${PORT}`);
  logger.info(`   - API: /api/v1/learn/*`);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Learning service shutting down");

  const shutdownTimeout = setTimeout(() => {
    logger.error("Shutdown timeout exceeded; forcing exit");
    process.exit(1);
  }, 10_000);

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Failed to close HTTP server during shutdown");
    }

    await disconnectRedisPublisher();
    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app }; // Reload trigger
