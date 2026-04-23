import { Request, Response } from "express";
import {
  lahiriClient,
  kpClient,
  ramanClient,
  yukteswarClient,
  bhasinClient,
  BirthData,
  AyanamsaType,
} from "../../clients";
import { cacheService } from "../../services/cache.service";
import { logger } from "../../config/logger";

// =============================================================================
// ASHTAKAVARGA CONTROLLER
// Handles Bhinna, Sarva, and Shodasha Varga calculations
// =============================================================================

export class AshtakavargaController {
  /**
   * POST /api/ashtakavarga/bhinna
   * Get Bhinna (individual planet) Ashtakavarga
   */
  async getBhinnaAshtakavarga(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      const ayanamsa: AyanamsaType = birthData.ayanamsa || "lahiri";

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: "bhinna", ayanamsa };
      const cached = await cacheService.get<any>(`ashtakavarga:bhinna:${ayanamsa}`, cacheKey);

      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          calculatedAt: new Date().toISOString(),
        });
        return;
      }

      const client = this.getClient(ayanamsa);
      const data = await client.getBhinnaAshtakavarga(birthData);
      await cacheService.set(`ashtakavarga:bhinna:${ayanamsa}`, cacheKey, data);

      res.json({
        success: true,
        data,
        cached: false,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Bhinna Ashtakavarga failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/ashtakavarga/sarva
   * Get Sarva (combined) Ashtakavarga
   */
  async getSarvaAshtakavarga(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      const ayanamsa: AyanamsaType = birthData.ayanamsa || "lahiri";

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: "sarva", ayanamsa };
      const cached = await cacheService.get<any>(`ashtakavarga:sarva:${ayanamsa}`, cacheKey);

      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          calculatedAt: new Date().toISOString(),
        });
        return;
      }

      const client = this.getClient(ayanamsa);
      const data = await client.getSarvaAshtakavarga(birthData);
      await cacheService.set(`ashtakavarga:sarva:${ayanamsa}`, cacheKey, data);

      res.json({
        success: true,
        data,
        cached: false,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Sarva Ashtakavarga failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/ashtakavarga/shodasha
   * Get Shodasha Varga (16 divisional chart signs)
   */
  async getShodashaVarga(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: "shodasha" };
      const cached = await cacheService.get<any>("shodasha-varga", cacheKey);

      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true,
          calculatedAt: new Date().toISOString(),
        });
        return;
      }

      const ayanamsa: AyanamsaType = birthData.ayanamsa || "lahiri";
      const client = this.getClient(ayanamsa);
      const data = await client.getShodashaVarga(birthData);
      await cacheService.set("shodasha-varga", cacheKey, data);

      res.json({
        success: true,
        data,
        cached: false,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Shodasha Varga failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =========================================================================
  // SAMUDAYA ASHTAKAVARGA (Divisional Charts) — Lahiri-only
  // =========================================================================

  async getSamudayaD1(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD1(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D1 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD2(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD2(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D2 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD3(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD3(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D3 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD7(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD7(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D7 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD9(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD9(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D9 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD10(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD10(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D10 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD12(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD12(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D12 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD16(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD16(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D16 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD30(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD30(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D30 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSamudayaD60(req: Request, res: Response): Promise<void> {
    try {
      const birthData: BirthData = req.body;
      if (!this.validateBirthData(birthData, res)) return;
      const data = await lahiriClient.getSamudayaD60(birthData);
      res.json({ success: true, data, cached: false, calculatedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error({ error: error.message }, "Samudaya D60 failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private getClient(ayanamsa: AyanamsaType) {
    switch (ayanamsa.toLowerCase()) {
      case "raman":
        return ramanClient;
      case "kp":
        return kpClient;
      case "yukteswar":
        return yukteswarClient;
      case "bhasin":
        return bhasinClient;
      case "lahiri":
      default:
        return lahiriClient;
    }
  }

  private validateBirthData(data: BirthData, res: Response): boolean {
    if (!data.birthDate || !data.birthTime || !data.latitude || !data.longitude) {
      res.status(400).json({ success: false, error: "Missing required fields" });
      return false;
    }
    return true;
  }
}

export const ashtakavargaController = new AshtakavargaController();
