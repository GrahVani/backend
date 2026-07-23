import { config } from "../config";
import { logger } from "../config/logger";

export interface LessonMetadata {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  learningOutcomes: string[];
  prerequisites: string[];
}

export interface LessonSectionData {
  sectionNumber: number;
  sectionTitle: string;
  sectionType: string;
  content: string;
}

export interface InteractiveSummary {
  type: string;
  spec: string;
  fallback: string;
}

export interface LearnerProgressResponse {
  level: string;
  tier: number;
  xp: number;
  currentStreak: number;
  lessonStatus: string;
  completionPercentage: number;
  quizScore: number;
  quizAttempts: number;
}

export interface LearningContextResponse {
  lesson: LessonMetadata;
  sections: LessonSectionData[];
  mcqs: any[];
  knowledge: any[];
  interactiveSummary: InteractiveSummary | null;
}

export class LearningContextClient {
  private serviceUrl: string;
  private serviceKey: string;

  constructor() {
    this.serviceUrl = config.services.learning || "http://localhost:3013";
    this.serviceKey = config.internalServiceKey;
  }

  async getLessonContext(lessonSlug: string): Promise<LearningContextResponse> {
    const url = `${this.serviceUrl}/internal/tutor/context/${lessonSlug}`;
    logger.debug({ url, lessonSlug }, "Fetching lesson context from learning-service");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-internal-key": this.serviceKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Failed to fetch lesson context");
      throw new Error(
        `Failed to fetch lesson context from learning-service: ${response.status} ${response.statusText}`,
      );
    }

    const json: any = await response.json();
    return json.data;
  }

  async getLearnerProgress(userId: string, lessonSlug: string): Promise<LearnerProgressResponse> {
    const url = `${this.serviceUrl}/internal/tutor/progress/${userId}/${lessonSlug}`;
    logger.debug({ url, userId, lessonSlug }, "Fetching learner progress from learning-service");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-internal-key": this.serviceKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Failed to fetch learner progress");
      throw new Error(
        `Failed to fetch learner progress from learning-service: ${response.status} ${response.statusText}`,
      );
    }

    const json: any = await response.json();
    return json.data;
  }
}
