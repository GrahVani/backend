// Knowledge Service - Main Entry Point
process.env.TZ = "Asia/Kolkata";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config";
import { errorMiddleware } from "./interfaces/http/middlewares/error.middleware";
import {
  metricsMiddleware,
  metricsHandler,
} from "./interfaces/http/middlewares/metrics.middleware";
import { requestIdMiddleware } from "@grahvani/contracts";
import { logger } from "./config/logger";
import { disconnectDatabase } from "./config/database";
import { knowledgeRoutes } from "./interfaces/http/routes/knowledge.routes";

const app = express();

// ============ TRUST PROXY ============
if (config.env === "production") {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", false);
}

// ============ SECURITY MIDDLEWARES ============
app.use(helmet());
app.use(
  cors({
    origin:
      config.env === "production"
        ? ["https://grahvani.in", "https://www.grahvani.in", "https://admin.grahvani.in"]
        : "*",
  }),
);
app.use(compression());
app.use(express.json({ limit: "1kb" }));
app.use(requestIdMiddleware);
app.use(metricsMiddleware);

// ============ METRICS ENDPOINT ============
app.get("/metrics", metricsHandler);

// ============ HEALTH CHECK ============
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "knowledge-service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ============ API ROUTES ============
app.use("/api/v1/knowledge", knowledgeRoutes);

// ============ ERROR HANDLING ============
app.use(errorMiddleware);

// ============ 404 HANDLER ============
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

// ============ START SERVER ============
const PORT = config.port;
const server = app.listen(PORT, () => {
  logger.info(`Knowledge Service running on port ${PORT}`);
  logger.info(`   - Public API: /api/v1/knowledge/*`);
  logger.info(`   - Health: /health`);
});

// ============ GRACEFUL SHUTDOWN ============
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(async () => {
    await disconnectDatabase();
    logger.info("Server closed");
    process.exit(0);
  });
});

export { app };
