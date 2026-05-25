import { Router } from "express";
import { knowledgeController } from "../controllers/knowledge.controller";
import { cacheMiddleware } from "../middlewares/cache.middleware";

const router = Router();

// All routes are public read-only with aggressive caching
const cache24h = cacheMiddleware(86400, 604800);     // 24h browser, 7d CDN
const cache1h = cacheMiddleware(3600, 86400);         // 1h browser, 24h CDN (for stats/search)

// Static content endpoints (24h cache)
router.get("/batch", cache24h, knowledgeController.getBatch);
router.get("/domain/:domain", cache24h, knowledgeController.getByDomain);
router.get("/category/:category", cache24h, knowledgeController.getByCategory);

// Dynamic endpoints (1h cache)
router.get("/search", cache1h, knowledgeController.search);
router.get("/stats", cache1h, knowledgeController.getStats);

// Single term lookup (24h cache) — must be last to avoid matching "batch", "domain", etc.
router.get("/:termKey", cache24h, knowledgeController.getByTermKey);

export { router as knowledgeRoutes };
