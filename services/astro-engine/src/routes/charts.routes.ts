import { Router } from "express";
import { natalController, divisionalController, specialChartsController } from "../controllers";

const router = Router();

// =============================================================================
// CHARTS ROUTES
// =============================================================================

// Natal Chart (D1)
router.post("/natal", natalController.getNatalChart.bind(natalController));

// Divisional Charts (D2-D60)
router.post(
  "/divisional/:type",
  divisionalController.getDivisionalChart.bind(divisionalController),
);
router.post("/navamsa", divisionalController.getNavamsa.bind(divisionalController)); // Convenience
router.post("/dasamsa", divisionalController.getDasamsa.bind(divisionalController)); // Convenience

// Special Charts
router.post("/transit", specialChartsController.getTransitChart.bind(specialChartsController));

// NEW: Daily transit — Lahiri-only, dynamic date range
router.post(
  "/daily-transit",
  specialChartsController.getDailyTransit.bind(specialChartsController),
);
router.post("/moon", specialChartsController.getMoonChart.bind(specialChartsController));
router.post("/sun", specialChartsController.getSunChart.bind(specialChartsController));
router.post(
  "/sudarshan-chakra",
  specialChartsController.getSudarshanChakra.bind(specialChartsController),
);

// Special Lagnas & Bhavas
router.post("/arudha-lagna", specialChartsController.getArudhaLagna.bind(specialChartsController));
router.post("/bhava-lagna", specialChartsController.getBhavaLagna.bind(specialChartsController));
router.post("/hora-lagna", specialChartsController.getHoraLagna.bind(specialChartsController));
router.post(
  "/sripathi-bhava",
  specialChartsController.getSripathiBhava.bind(specialChartsController),
);
router.post("/kp-bhava", specialChartsController.getKpBhava.bind(specialChartsController));
router.post("/equal-bhava", specialChartsController.getEqualBhava.bind(specialChartsController));
router.post("/karkamsha-d1", specialChartsController.getKarkamshaD1.bind(specialChartsController));
router.post("/karkamsha-d9", specialChartsController.getKarkamshaD9.bind(specialChartsController));
router.post("/mandi", specialChartsController.getMandi.bind(specialChartsController));
router.post("/gulika", specialChartsController.getGulika.bind(specialChartsController));
router.post(
  "/upapada-lagna",
  specialChartsController.getUpapadaLagna.bind(specialChartsController),
);
router.post("/swamsha", specialChartsController.getSwamsha.bind(specialChartsController));
router.post(
  "/panchadha-maitri",
  specialChartsController.getPanchadhaMaitri.bind(specialChartsController),
);
router.post("/pada-chart", specialChartsController.getPadaChart.bind(specialChartsController));
router.post(
  "/shodasha-varga",
  specialChartsController.getShodashaVarga.bind(specialChartsController),
);

// Specialized Divisional Charts (Lahiri-only)
router.post("/d2-somanatha", specialChartsController.getD2Somanatha.bind(specialChartsController));
router.post("/d2-kashinatha", specialChartsController.getD2Kashinatha.bind(specialChartsController));
router.post("/d4-vedamsha", specialChartsController.getD4Vedamsha.bind(specialChartsController));
router.post("/d6-kaulaka", specialChartsController.getD6Kaulaka.bind(specialChartsController));
router.post("/d9-nadhi", specialChartsController.getD9Nadhi.bind(specialChartsController));
router.post("/d9-pada", specialChartsController.getD9Pada.bind(specialChartsController));
router.post("/d9-somanatha", specialChartsController.getD9Somanatha.bind(specialChartsController));
router.post("/d24-parasidamsha", specialChartsController.getD24Parasidamsha.bind(specialChartsController));
router.post("/d24-siddhamsha", specialChartsController.getD24Siddhamsha.bind(specialChartsController));
router.post("/d30-venkatesha", specialChartsController.getD30Venkatesha.bind(specialChartsController));
router.post("/d108-nd", specialChartsController.getD108ND.bind(specialChartsController));
router.post("/d108-dn", specialChartsController.getD108DN.bind(specialChartsController));
router.post("/d2-iyer", specialChartsController.getD2Iyer.bind(specialChartsController));
router.post("/d5", specialChartsController.getD5.bind(specialChartsController));
router.post("/d8-chart", specialChartsController.getD8Chart.bind(specialChartsController));
router.post("/d11", specialChartsController.getD11.bind(specialChartsController));

// Lal Kitab (Lahiri-only)
router.post("/lalkitab-house-position", specialChartsController.getLalKitabHousePosition.bind(specialChartsController));
router.post("/lalkitab-planetary-position", specialChartsController.getLalKitabPlanetaryPosition.bind(specialChartsController));
router.post("/lalkitab-dasha", specialChartsController.getLalKitabDasha.bind(specialChartsController));
router.post("/lalkitab-teva", specialChartsController.getLalKitabTeva.bind(specialChartsController));
router.post("/lalkitab-varshphal-timeline", specialChartsController.getLalKitabVarshphalTimeline.bind(specialChartsController));

// Specialized Navamsha & Divisional Charts
router.post("/bhava-navamsha", specialChartsController.getBhavaNavamsha.bind(specialChartsController));
router.post("/divajiya-navamsha", specialChartsController.getDivajiyaNavamsha.bind(specialChartsController));
router.post("/kshetra-navamsha", specialChartsController.getKshetraNavamsha.bind(specialChartsController));
router.post("/tajika-navamsha", specialChartsController.getTajikaNavamsha.bind(specialChartsController));
router.post("/tulya-navamsha", specialChartsController.getTulyaNavamsha.bind(specialChartsController));
router.post("/vargottama-navamsha", specialChartsController.getVargottamaNavamsha.bind(specialChartsController));
router.post("/karmasthana-navamsha", specialChartsController.getKarmasthanaNavamsha.bind(specialChartsController));
router.post("/sukhabham-chart", specialChartsController.getSukhabhamChart.bind(specialChartsController));
router.post("/vainashika-navamsha", specialChartsController.getVainashikaNavamsha.bind(specialChartsController));
router.post("/karmabham-chart", specialChartsController.getKarmabhamChart.bind(specialChartsController));
router.post("/d55-navamsha", specialChartsController.getD55Navamsha.bind(specialChartsController));
router.post("/d64-khara-navamsha", specialChartsController.getD64KharaNavamsha.bind(specialChartsController));
router.post("/d81-chart", specialChartsController.getD81Chart.bind(specialChartsController));
router.post("/d88-synastry-chart", specialChartsController.getD88SynastryChart.bind(specialChartsController));
router.post("/d91-labham-chart", specialChartsController.getD91LabhamChart.bind(specialChartsController));
router.post("/antya-chart", specialChartsController.getAntyaChart.bind(specialChartsController));

export default router;
