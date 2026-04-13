import { Router } from "express";
import { trueChitraController } from "../controllers/true-chitra.controller";

const router = Router();

// =============================================================================
// TRUE CHITRA AYANAMSA SYSTEM ROUTES
// All endpoints specific to True Chitra Ayanamsa calculations
// True Chitra specializes in various dasha (planetary period) systems
// =============================================================================

// Dasha Calculations (True Chitra's specialty)
router.post("/dasha/prana", trueChitraController.getPranaDasha.bind(trueChitraController));
router.post("/dasha/ashtottari", trueChitraController.getAshtottariDasha.bind(trueChitraController));
router.post("/dasha/tribhagi", trueChitraController.getTribhagiDasha.bind(trueChitraController));
router.post("/dasha/tribhagi40", trueChitraController.getTribhagi40Dasha.bind(trueChitraController));
router.post("/dasha/shodashottari", trueChitraController.getShodashottariDasha.bind(trueChitraController));
router.post("/dasha/dwadashottari", trueChitraController.getDwadashottariDasha.bind(trueChitraController));
router.post("/dasha/dwisaptati-sama", trueChitraController.getDwisaptatiSama.bind(trueChitraController));
router.post("/dasha/shastihayani", trueChitraController.getShastihayaniDasha.bind(trueChitraController));
router.post("/dasha/shattrimshatsama", trueChitraController.getShattrimshatsama.bind(trueChitraController));
router.post("/dasha/panchottari", trueChitraController.getPanchottariDasha.bind(trueChitraController));
router.post("/dasha/shatabdika", trueChitraController.getShatabdikaDasha.bind(trueChitraController));
router.post("/dasha/chaturshitisama", trueChitraController.getChaturshitisamaDasha.bind(trueChitraController));

// Generic dasha endpoint with type parameter
router.post("/dasha/:type", trueChitraController.getDasha.bind(trueChitraController));

export default router;
