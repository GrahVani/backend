import { RecommendationServiceImpl, RecommendationItem } from "./src/services/recommendation.service";

export class RecommendationFacade {
  constructor(private readonly service: RecommendationServiceImpl) {}

  async getRecommendations(userId: string, lessonSlug?: string): Promise<RecommendationItem[]> {
    return this.service.getRecommendations(userId, lessonSlug);
  }

  async recordConceptInteraction(
    userId: string,
    concept: string,
    outcome: "WEAK" | "STRONG" | "ASKED",
  ): Promise<void> {
    return this.service.recordConceptInteraction(userId, concept, outcome);
  }
}
