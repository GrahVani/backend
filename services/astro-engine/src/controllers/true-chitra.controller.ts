import { Request, Response } from "express";
import { trueChitraClient } from "../clients";
import { cacheService } from "../services/cache.service";
import { logger } from "../config/logger";
import { BirthData } from "../types";

// =============================================================================
// TRUE CHITRA AYANAMSA CONTROLLER
// Handles all True Chitra system calculations (12+ dasha endpoints)
// =============================================================================

export class TrueChitraController {
  // =========================================================================
  // DASHA CALCULATIONS (True Chitra specializes in dasha systems)
  // =========================================================================

  /** Prana Dasha - Micro-level planetary periods */
  async getPranaDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "prana", (data) => trueChitraClient.getPranaDasha(data));
  }

  /** Ashtottari Dasha - 108-year cycle dasha system */
  async getAshtottariDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "ashtottari", (data) => trueChitraClient.getAshtottariDasha(data));
  }

  /** Tribhagi Dasha - One-third division of Vimshottari */
  async getTribhagiDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "tribhagi", (data) => trueChitraClient.getTribhagiDasha(data));
  }

  /** Tribhagi 40 Dasha - 40-year modified tribhagi */
  async getTribhagi40Dasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "tribhagi40", (data) => trueChitraClient.getTribhagi40Dasha(data));
  }

  /** Shodashottari Dasha - 116-year cycle for specific nakshatras */
  async getShodashottariDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "shodashottari", (data) => trueChitraClient.getShodashottariDasha(data));
  }

  /** Dwadashottari Dasha - 112-year cycle dasha */
  async getDwadashottariDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "dwadashottari", (data) => trueChitraClient.getDwadashottariDasha(data));
  }

  /** Dwisaptati Sama Dasha - 72-year equal period dasha */
  async getDwisaptatiSama(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "dwisaptati-sama", (data) => trueChitraClient.getDwisaptatiSama(data));
  }

  /** Shastihayani Dasha - 60-year cycle dasha */
  async getShastihayaniDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "shastihayani", (data) => trueChitraClient.getShastihayaniDasha(data));
  }

  /** Shattrimshatsama Dasha - 36-year equal dasha */
  async getShattrimshatsama(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "shattrimshatsama", (data) => trueChitraClient.getShattrimshatsama(data));
  }

  /** Panchottari Dasha - 105-year cycle dasha */
  async getPanchottariDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "panchottari", (data) => trueChitraClient.getPanchottariDasha(data));
  }

  /** Shatabdika Dasha - 100-year century dasha */
  async getShatabdikaDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "shatabdika", (data) => trueChitraClient.getShatabdikaDasha(data));
  }

  /** Chaturshitisama Dasha - 84-year cycle dasha */
  async getChaturshitisamaDasha(req: Request, res: Response): Promise<void> {
    await this.handleDasha(req, res, "chaturshitisama", (data) => trueChitraClient.getChaturshitisamaDasha(data));
  }

  // =========================================================================
  // GENERIC DASHA HANDLER
  // =========================================================================

  async getDasha(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.params;
      const birthData: BirthData = req.body;
      
      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: `true-chitra-dasha:${type}` };
      const cached = await cacheService.get<any>(`true-chitra-dasha:${type}`, cacheKey);
      
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          ayanamsa: "true-chitra",
          dashaType: type,
          calculatedAt: new Date().toISOString(),
        });
        return;
      }

      const data = await trueChitraClient.getDasha(birthData, type);
      await cacheService.set(`true-chitra-dasha:${type}`, cacheKey, data);
      
      res.json({
        success: true,
        data,
        cached: false,
        ayanamsa: "true-chitra",
        dashaType: type,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error({ error: error.message, type: req.params.type }, "True Chitra dasha failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async handleDasha(
    req: Request,
    res: Response,
    dashaName: string,
    clientFn: (data: BirthData) => Promise<any>,
  ): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: `true-chitra-${dashaName}` };
      const cached = await cacheService.get<any>(`true-chitra-${dashaName}`, cacheKey);
      
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          ayanamsa: "true-chitra",
          dashaType: dashaName,
          calculatedAt: new Date().toISOString(),
        });
        return;
      }

      const data = await clientFn(birthData);
      await cacheService.set(`true-chitra-${dashaName}`, cacheKey, data);
      
      res.json({
        success: true,
        data,
        cached: false,
        ayanamsa: "true-chitra",
        dashaType: dashaName,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error({ error: error.message, dashaName }, `True Chitra ${dashaName} failed`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private validateBirthData(data: BirthData, res: Response): boolean {
    if (!data.birthDate || !data.birthTime || !data.latitude || !data.longitude) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: birthDate, birthTime, latitude, longitude",
      });
      return false;
    }
    return true;
  }
}

export const trueChitraController = new TrueChitraController();
