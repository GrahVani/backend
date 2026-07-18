import { Router, Request, Response } from "express";
import { checkHealth, isHealthy } from "../services/health.service";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "tutor-service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

router.get("/health/ready", async (_req: Request, res: Response) => {
  const checks = await checkHealth();
  const healthy = isHealthy(checks);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ready" : "not_ready",
    service: "tutor-service",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
