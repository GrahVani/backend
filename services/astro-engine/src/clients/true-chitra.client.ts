import { BaseAstroClient } from "./base.client";
import { BirthData } from "../types";
import { TRUE_CHITRA_ENDPOINTS } from "../constants";

// =============================================================================
// TRUE CHITRA AYANAMSA CLIENT
// Handles all True Chitra system calculations (12+ dasha endpoints)
// =============================================================================

export class TrueChitraClient extends BaseAstroClient {
  constructor() {
    super("true-chitra-client");
  }

  // =========================================================================
  // DASHA CALCULATIONS (True Chitra specializes in dasha systems)
  // =========================================================================

  /** Prana Dasha - Micro-level planetary periods */
  async getPranaDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.PRANA_DASHA, data);
  }

  /** Ashtottari Dasha - 108-year cycle dasha system */
  async getAshtottariDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.ASHTOTTARI_DASHA, data);
  }

  /** Tribhagi Dasha - One-third division of Vimshottari */
  async getTribhagiDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.TRIBHAGI_DASHA, data);
  }

  /** Tribhagi 40 Dasha - 40-year modified tribhagi */
  async getTribhagi40Dasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.TRIBHAGI_40_DASHA, data);
  }

  /** Shodashottari Dasha - 116-year cycle for specific nakshatras */
  async getShodashottariDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.SHODASHOTTARI_DASHA, data);
  }

  /** Dwadashottari Dasha - 112-year cycle dasha */
  async getDwadashottariDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.DWADASHOTTARI_DASHA, data);
  }

  /** Dwisaptati Sama Dasha - 72-year equal period dasha */
  async getDwisaptatiSama(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.DWISAPTATI_SAMA, data);
  }

  /** Shastihayani Dasha - 60-year cycle dasha */
  async getShastihayaniDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.SHASTIHAYANI_DASHA, data);
  }

  /** Shattrimshatsama Dasha - 36-year equal dasha */
  async getShattrimshatsama(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.SHATTRIMSHATSAMA, data);
  }

  /** Panchottari Dasha - 105-year cycle dasha */
  async getPanchottariDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.PANCHOTTARI_DASHA, data);
  }

  /** Shatabdika Dasha - 100-year century dasha */
  async getShatabdikaDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.SHATABDIKA_DASHA, data);
  }

  /** Chaturshitisama Dasha - 84-year cycle dasha */
  async getChaturshitisamaDasha(data: BirthData) {
    return this.post(TRUE_CHITRA_ENDPOINTS.CHATURSHITISAMA_DASHA, data);
  }

  // =========================================================================
  // GENERIC DASHA GETTER
  // =========================================================================

  /**
   * Generic dasha getter with dasha type
   */
  async getDasha(
    data: BirthData,
    dashaType: string = "prana"
  ) {
    const dashaTypeMap: Record<string, string> = {
      prana: TRUE_CHITRA_ENDPOINTS.PRANA_DASHA,
      ashtottari: TRUE_CHITRA_ENDPOINTS.ASHTOTTARI_DASHA,
      tribhagi: TRUE_CHITRA_ENDPOINTS.TRIBHAGI_DASHA,
      tribhagi40: TRUE_CHITRA_ENDPOINTS.TRIBHAGI_40_DASHA,
      shodashottari: TRUE_CHITRA_ENDPOINTS.SHODASHOTTARI_DASHA,
      dwadashottari: TRUE_CHITRA_ENDPOINTS.DWADASHOTTARI_DASHA,
      dwisaptati: TRUE_CHITRA_ENDPOINTS.DWISAPTATI_SAMA,
      shastihayani: TRUE_CHITRA_ENDPOINTS.SHASTIHAYANI_DASHA,
      shattrimshatsama: TRUE_CHITRA_ENDPOINTS.SHATTRIMSHATSAMA,
      panchottari: TRUE_CHITRA_ENDPOINTS.PANCHOTTARI_DASHA,
      shatabdika: TRUE_CHITRA_ENDPOINTS.SHATABDIKA_DASHA,
      chaturshitisama: TRUE_CHITRA_ENDPOINTS.CHATURSHITISAMA_DASHA,
    };

    const endpoint = dashaTypeMap[dashaType.toLowerCase()];
    if (!endpoint) {
      throw new Error(`Unknown dasha type: ${dashaType}`);
    }

    return this.post(endpoint, data);
  }
}

export const trueChitraClient = new TrueChitraClient();
