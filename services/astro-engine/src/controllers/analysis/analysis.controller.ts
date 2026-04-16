import { Request, Response } from "express";
import { lahiriClient, BirthData } from "../../clients";
import { cacheService } from "../../services/cache.service";
import { logger } from "../../config/logger";

// =============================================================================
// ANALYSIS CONTROLLER
// Handles Yogas, Doshas, and Remedies
// =============================================================================

export class AnalysisController {
  // =========================================================================
  // YOGAS
  // =========================================================================

  async getYoga(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.params;
      const birthData: BirthData = req.body;

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: `yoga-${type}` };
      const cached = await cacheService.get(`yoga:${type}`, cacheKey);

      if (cached) {
        res.json({ success: true, data: cached, cached: true });
        return;
      }

      let data;
      // Map type to client method
      switch (type.toLowerCase()) {
        case "gaja-kesari":
          data = await lahiriClient.getGajaKesariYoga(birthData);
          break;
        case "guru-mangal":
          data = await lahiriClient.getGuruMangalYoga(birthData);
          break;
        case "budha-aditya":
          data = await lahiriClient.getBudhaAdityaYoga(birthData);
          break;
        case "chandra-mangal":
          data = await lahiriClient.getChandraMangalYoga(birthData);
          break;
        case "raj-yoga":
          data = await lahiriClient.getRajYoga(birthData);
          break;
        case "pancha-mahapurusha":
          data = await lahiriClient.getPanchaMahapurushaYoga(birthData);
          break;
        case "dhan-yoga":
          data = await lahiriClient.getDhanYoga(birthData);
          break;
        case "malefic":
          data = await lahiriClient.getMaleficYogas(birthData);
          break;
        case "analysis":
          data = await lahiriClient.getYogaAnalysis(birthData);
          break;
        case "special":
          data = await lahiriClient.getSpecialYogas(birthData);
          break;

        // Existing yogas (previously missing from switch)
        case "daridra":
          data = await lahiriClient.getDaridraYoga(birthData);
          break;
        case "spiritual":
          data = await lahiriClient.getSpiritualYogas(birthData);
          break;
        case "shubh":
          data = await lahiriClient.getShubhYogas(birthData);
          break;
        case "viparitha-raj":
          data = await lahiriClient.getViparithaRajYoga(birthData);
          break;
        case "kalpadruma":
          data = await lahiriClient.getKalpadrumaYoga(birthData);
          break;

        // =====================================================================
        // JAIMINI YOGAS (27 endpoints)
        // =====================================================================
        case "chara-karakas-raja":
          data = await lahiriClient.getCharaKarakasRaja(birthData);
          break;
        case "arudha-lagna-raja":
          data = await lahiriClient.getArudhaLagnaRaja(birthData);
          break;
        case "swamsa-raja":
          data = await lahiriClient.getSwamsaRaja(birthData);
          break;
        case "hora-lagna-dhana":
          data = await lahiriClient.getHoraLagnaDhana(birthData);
          break;
        case "jaimini-wealth-indicator":
          data = await lahiriClient.getJaiminiWealthIndicator(birthData);
          break;
        case "karakamsa-arishta":
          data = await lahiriClient.getKarakamsaArishta(birthData);
          break;
        case "jaimini-maraka":
          data = await lahiriClient.getJaiminiMaraka(birthData);
          break;
        case "arista-sutra-special":
          data = await lahiriClient.getAristaSutraSpecial(birthData);
          break;
        case "jaimini-gajakesari":
          data = await lahiriClient.getJaiminiGajakesari(birthData);
          break;
        case "amala":
          data = await lahiriClient.getAmalaYoga(birthData);
          break;
        case "parvata":
          data = await lahiriClient.getParvataYoga(birthData);
          break;
        case "kahala":
          data = await lahiriClient.getKahalaYoga(birthData);
          break;
        case "vasumati":
          data = await lahiriClient.getVasumatiYoga(birthData);
          break;
        case "kartari":
          data = await lahiriClient.getKartariYoga(birthData);
          break;
        case "jaimini-combination":
          data = await lahiriClient.getJaiminiYogasCombination(birthData);
          break;
        case "jaimini-argala":
          data = await lahiriClient.getJaiminiArgalaYoga(birthData);
          break;
        case "jaimini-argala-position":
          data = await lahiriClient.getJaiminiArgalaPosition(birthData);
          break;
        case "virodha-argala":
          data = await lahiriClient.getVirodhaArgala(birthData);
          break;
        case "relationship-upapada":
          data = await lahiriClient.getRelationshipUpapadaYogas(birthData);
          break;
        case "jaimini-navamsa":
          data = await lahiriClient.getJaiminiNavamsa(birthData);
          break;
        case "karakamsa-spiritual":
          data = await lahiriClient.getKarakamsaSpiritual(birthData);
          break;
        case "jaimini-spiritual":
          data = await lahiriClient.getJaiminiSpiritualYogas(birthData);
          break;
        case "bk-yogas":
          data = await lahiriClient.getBkYogas(birthData);
          break;
        case "jaimini-mk":
          data = await lahiriClient.getJaiminiMkYogas(birthData);
          break;
        case "putrakaraka":
          data = await lahiriClient.getPutrakarakaYogas(birthData);
          break;
        case "gk-yogas":
          data = await lahiriClient.getGkYogas(birthData);
          break;
        case "jaimini-other-combinations":
          data = await lahiriClient.getJaiminiOtherCombinations(birthData);
          break;

        // =====================================================================
        // TAJIKA YOGAS (16 endpoints)
        // =====================================================================
        case "duphali-kutta":
          data = await lahiriClient.getDuphaliKuttaYoga(birthData);
          break;
        case "iqabala":
          data = await lahiriClient.getIqabalaYoga(birthData);
          break;
        case "induvara":
          data = await lahiriClient.getInduvaraYoga(birthData);
          break;
        case "ithasala":
          data = await lahiriClient.getIthasalaYoga(birthData);
          break;
        case "esharpha":
          data = await lahiriClient.getEsharphaYoga(birthData);
          break;
        case "nakata":
          data = await lahiriClient.getNakataYoga(birthData);
          break;
        case "yamaya":
          data = await lahiriClient.getYamayaYoga(birthData);
          break;
        case "manau":
          data = await lahiriClient.getManauYoga(birthData);
          break;
        case "kamboola":
          data = await lahiriClient.getKamboolaYoga(birthData);
          break;
        case "gairi-kamboola":
          data = await lahiriClient.getGairiKamboolaYoga(birthData);
          break;
        case "khallasara":
          data = await lahiriClient.getKhallasaraYoga(birthData);
          break;
        case "radda":
          data = await lahiriClient.getRaddaYoga(birthData);
          break;
        case "dutthotta-daivira":
          data = await lahiriClient.getDutthottaDaiviraYoga(birthData);
          break;
        case "tambira":
          data = await lahiriClient.getTambiraYoga(birthData);
          break;
        case "kuttha":
          data = await lahiriClient.getKutthaYoga(birthData);
          break;
        case "durupha":
          data = await lahiriClient.getDuruphaYoga(birthData);
          break;

        default:
          res.status(400).json({ success: false, error: `Unknown yoga type: ${type}` });
          return;
      }

      await cacheService.set(`yoga:${type}`, cacheKey, data);
      res.json({ success: true, data, cached: false });
    } catch (error: any) {
      logger.error({ error: error.message, type: req.params.type }, "Yoga analysis failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =========================================================================
  // DOSHAS
  // =========================================================================

  async getDosha(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.params;
      const birthData: BirthData = req.body;

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: `dosha-${type}` };
      const cached = await cacheService.get(`dosha:${type}`, cacheKey);

      if (cached) {
        res.json({ success: true, data: cached, cached: true });
        return;
      }

      let data;
      switch (type.toLowerCase()) {
        case "angarak":
          data = await lahiriClient.getAngarakDosha(birthData);
          break;
        case "guru-chandal":
          data = await lahiriClient.getGuruChandalDosha(birthData);
          break;
        case "shrapit":
          data = await lahiriClient.getShrapitDosha(birthData);
          break;
        case "sade-sati":
          data = await lahiriClient.getSadeSati(birthData);
          break;
        case "pitra":
          data = await lahiriClient.getPitraDosha(birthData);
          break;
        case "dhaiya":
          data = await lahiriClient.getDhaiya(birthData);
          break;
        case "kala-sarpa":
          data = await lahiriClient.getKalaSarpaDosha(birthData);
          break;
        default:
          res.status(400).json({ success: false, error: `Unknown dosha type: ${type}` });
          return;
      }

      await cacheService.set(`dosha:${type}`, cacheKey, data);
      res.json({ success: true, data, cached: false });
    } catch (error: any) {
      logger.error({ error: error.message, type: req.params.type }, "Dosha analysis failed");
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // =========================================================================
  // REMEDIES
  // =========================================================================

  async getRemedies(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.params;
      const birthData: BirthData = req.body;

      if (!this.validateBirthData(birthData, res)) return;

      const cacheKey = { ...birthData, type: `remedies-${type}` };
      const cached = await cacheService.get(`remedies:${type}`, cacheKey);

      if (cached) {
        res.json({ success: true, data: cached, cached: true });
        return;
      }

      let data;
      switch (type.toLowerCase()) {
        case "yantra":
          data = await lahiriClient.getYantraRemedies(birthData);
          break;
        case "mantra":
          data = await lahiriClient.getMantraRemedies(birthData);
          // Helper: Inject D1 Chart if missing (for UI dashboard)
          // Always ensure data.analysis exists for consistency
          if (!data.analysis) data.analysis = {};
          if (!data.analysis.chart) {
            const chartData = await lahiriClient.getNatalChart(birthData);
            // Natal endpoint returns { success: true, data: { planets, ascendant, ... } }
            data.analysis.chart = chartData.data || chartData;
          }
          break;
        case "vedic":
          data = await lahiriClient.getVedicRemedies(birthData);
          // Helper: Inject D1 Chart if missing (for UI dashboard)
          if (!data.analysis) data.analysis = {};
          if (!data.analysis.chart) {
            const chartData = await lahiriClient.getNatalChart(birthData);
            data.analysis.chart = chartData.data || chartData;
          }
          break;
        case "gemstone":
          data = await lahiriClient.getGemstoneRemedies(birthData);
          break;
        case "lal-kitab":
          data = await lahiriClient.getLalKitabRemedies(birthData);
          break;
        default:
          res.status(400).json({ success: false, error: `Unknown remedy type: ${type}` });
          return;
      }

      await cacheService.set(`remedies:${type}`, cacheKey, data);
      res.json({ success: true, data, cached: false });
    } catch (error: any) {
      logger.error({ error: error.message, type: req.params.type }, "Remedies analysis failed");
      res.status(500).json({ success: false, error: error.message });
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

export const analysisController = new AnalysisController();
