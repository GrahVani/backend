import { Router } from "express";
import { ashtakavargaController } from "../controllers";

const router = Router();

// =============================================================================
// ASHTAKAVARGA ROUTES
// =============================================================================

router.post("/bhinna", ashtakavargaController.getBhinnaAshtakavarga.bind(ashtakavargaController));
router.post("/sarva", ashtakavargaController.getSarvaAshtakavarga.bind(ashtakavargaController));
router.post("/shodasha", ashtakavargaController.getShodashaVarga.bind(ashtakavargaController));

// =============================================================================
// SAMUDAYA ASHTAKAVARGA (Divisional Charts) — Lahiri-only
// =============================================================================
router.post("/samudaya-d1", ashtakavargaController.getSamudayaD1.bind(ashtakavargaController));
router.post("/samudaya-d2", ashtakavargaController.getSamudayaD2.bind(ashtakavargaController));
router.post("/samudaya-d3", ashtakavargaController.getSamudayaD3.bind(ashtakavargaController));
router.post("/samudaya-d7", ashtakavargaController.getSamudayaD7.bind(ashtakavargaController));
router.post("/samudaya-d9", ashtakavargaController.getSamudayaD9.bind(ashtakavargaController));
router.post("/samudaya-d10", ashtakavargaController.getSamudayaD10.bind(ashtakavargaController));
router.post("/samudaya-d12", ashtakavargaController.getSamudayaD12.bind(ashtakavargaController));
router.post("/samudaya-d16", ashtakavargaController.getSamudayaD16.bind(ashtakavargaController));
router.post("/samudaya-d30", ashtakavargaController.getSamudayaD30.bind(ashtakavargaController));
router.post("/samudaya-d60", ashtakavargaController.getSamudayaD60.bind(ashtakavargaController));

export default router;
