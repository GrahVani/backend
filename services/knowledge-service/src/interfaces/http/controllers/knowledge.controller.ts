import { Request, Response, NextFunction } from "express";
import { knowledgeService } from "../../../services/knowledge.service";
import {
  termKeySchema,
  batchQuerySchema,
  domainParamSchema,
  categoryParamSchema,
  searchQuerySchema,
} from "../../../validators/knowledge.validators";
import { logger } from "../../../config/logger";

export const knowledgeController = {
  async getByTermKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { termKey } = termKeySchema.parse(req.params);
      const entry = await knowledgeService.getByTermKey(termKey);

      if (!entry) {
        res.status(404).json({
          error: {
            code: "TERM_NOT_FOUND",
            message: `Knowledge entry '${termKey}' not found`,
          },
        });
        return;
      }

      res.json({ data: entry });
    } catch (err) {
      next(err);
    }
  },

  async getBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { keys } = batchQuerySchema.parse(req.query);
      const entries = await knowledgeService.getBatch(keys);

      // Return as a map keyed by termKey for easy frontend lookup
      const map: Record<string, any> = {};
      for (const entry of entries) {
        map[entry.termKey] = entry;
      }

      res.json({
        data: map,
        meta: {
          requested: keys.length,
          found: entries.length,
          missing: keys.filter((k) => !map[k]),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getByDomain(req: Request, res: Response, next: NextFunction) {
    try {
      const { domain } = domainParamSchema.parse(req.params);
      const entries = await knowledgeService.getByDomain(domain);

      res.json({
        data: entries,
        meta: { count: entries.length, domain },
      });
    } catch (err) {
      next(err);
    }
  },

  async getByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { category } = categoryParamSchema.parse(req.params);
      const entries = await knowledgeService.getByCategory(category);

      res.json({
        data: entries,
        meta: { count: entries.length, category },
      });
    } catch (err) {
      next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, domain, limit } = searchQuerySchema.parse(req.query);
      const entries = await knowledgeService.search(q, domain, limit);

      res.json({
        data: entries,
        meta: { query: q, count: entries.length },
      });
    } catch (err) {
      next(err);
    }
  },

  async getStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await knowledgeService.getStats();
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  },
};
