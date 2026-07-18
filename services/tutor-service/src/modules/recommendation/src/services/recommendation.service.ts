import { ConversationFacade } from "../../../conversation";
import { logger } from "../../../../config/logger";

export interface RecommendationItem {
  id: string;
  concept: string;
  category: "WEAK_CONCEPT_REVIEW" | "NEXT_STEP" | "STRENGTH_MASTERY";
  title: string;
  reason: string;
  suggestedPrompt: string;
  lessonSlug?: string;
}

export class RecommendationServiceImpl {
  constructor(private readonly conversationFacade: ConversationFacade) {}

  async getRecommendations(userId: string, lessonSlug?: string): Promise<RecommendationItem[]> {
    try {
      const profile = await this.conversationFacade.getLearnerProfile(userId);
      const weakConcepts = profile?.weakConcepts || [];
      const strongConcepts = profile?.strongConcepts || [];
      const askedConcepts = profile?.askedConcepts || [];

      const recommendations: RecommendationItem[] = [];

      // 1. Weak concepts priority review
      for (const concept of weakConcepts.slice(0, 3)) {
        recommendations.push({
          id: `rec-weak-${concept.toLowerCase().replace(/\s+/g, "-")}`,
          concept,
          category: "WEAK_CONCEPT_REVIEW",
          title: `Reinforce ${concept}`,
          reason: `You encountered difficulty with ${concept} in recent practice.`,
          suggestedPrompt: `Can you explain ${concept} simply with an everyday analogy and verify my understanding?`,
          lessonSlug,
        });
      }

      // 2. Next step suggestions based on asked concepts or defaults
      if (recommendations.length < 4) {
        const nextConcept = askedConcepts.length > 0 ? askedConcepts[0] : "Bhāvas & Planetary Rulership";
        recommendations.push({
          id: `rec-next-${nextConcept.toLowerCase().replace(/\s+/g, "-")}`,
          concept: nextConcept,
          category: "NEXT_STEP",
          title: `Explore ${nextConcept}`,
          reason: "Recommended based on your study trajectory across Vedic astrology principles.",
          suggestedPrompt: `How does ${nextConcept} connect to what we previously discussed about Jyotiṣa foundational rules?`,
          lessonSlug,
        });
      }

      // 3. Mastery challenge
      for (const concept of strongConcepts.slice(0, 1)) {
        recommendations.push({
          id: `rec-strong-${concept.toLowerCase().replace(/\s+/g, "-")}`,
          concept,
          category: "STRENGTH_MASTERY",
          title: `Mastery Challenge: ${concept}`,
          reason: `You have demonstrated strong grasp of ${concept}. Test your deep mastery.`,
          suggestedPrompt: `Give me an advanced practical scenario or chart analysis question involving ${concept} to test my mastery.`,
          lessonSlug,
        });
      }

      return recommendations;
    } catch (err) {
      logger.error({ err, userId }, "Failed to generate recommendations; returning default fallback");
      return [
        {
          id: "rec-default-vedanga",
          concept: "Jyotiṣa as Vedāṅga",
          category: "NEXT_STEP",
          title: "Explore Vedic Astronomy & Time",
          reason: "Essential foundational knowledge for reading horoscopic charts.",
          suggestedPrompt: "Why is Jyotiṣa called the eye of the Veda, and how does time tracking govern astrological calculations?",
          lessonSlug,
        }
      ];
    }
  }

  async recordConceptInteraction(
    userId: string,
    concept: string,
    outcome: "WEAK" | "STRONG" | "ASKED",
  ): Promise<void> {
    try {
      const profile = await this.conversationFacade.getLearnerProfile(userId);
      const weak = new Set(profile?.weakConcepts || []);
      const strong = new Set(profile?.strongConcepts || []);
      const asked = new Set(profile?.askedConcepts || []);

      if (outcome === "WEAK") {
        weak.add(concept);
        strong.delete(concept);
      } else if (outcome === "STRONG") {
        strong.add(concept);
        weak.delete(concept);
      } else if (outcome === "ASKED") {
        asked.add(concept);
      }

      await this.conversationFacade.upsertLearnerProfile(userId, {
        weakConcepts: Array.from(weak),
        strongConcepts: Array.from(strong),
        askedConcepts: Array.from(asked),
      });
    } catch (err) {
      logger.error({ err, userId, concept, outcome }, "Failed to record concept interaction");
    }
  }
}
