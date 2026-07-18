/**
 * Recommendation module — internal implementation module.
 *
 * This module owns learner profile and adaptive recommendation logic.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP directly.
 */

export { RecommendationFacade } from "./facade";
export { RecommendationServiceImpl, RecommendationItem } from "./src/services/recommendation.service";
