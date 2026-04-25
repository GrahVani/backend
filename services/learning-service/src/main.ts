process.env.TZ = "Asia/Kolkata";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { learnRoutes } from "./interfaces/http/routes/learn.routes";
import { logger } from "./config/logger";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.NODE_ENV === "production" ? ["https://grahvani.in"] : "*", credentials: true }));
app.use(express.json({ limit: "100kb" }));

// Request logging
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({ method: req.method, path: req.path, statusCode: res.statusCode, duration: Date.now() - start });
  });
  next();
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "learning-service", version: "1.0.0", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/v1/learn", learnRoutes);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Learning Service running on port ${PORT}`);
  logger.info(`   - API: /api/v1/learn/*`);
});

export { app };
