import { TutorSession, TutorMessage } from "@grahvani/tutor-database";
import { ConversationService, CreateMessageParams } from "./src/services/conversation.service";

export class ConversationFacade {
  constructor(private readonly service: ConversationService) {}

  async createSession(
    userId: string,
    title: string,
    lessonSlug?: string,
    id?: string,
  ): Promise<TutorSession> {
    return this.service.createSession(userId, title, lessonSlug, id);
  }

  async getSession(sessionId: string, userId: string): Promise<TutorSession | null> {
    return this.service.getSession(sessionId, userId);
  }

  async listSessions(
    userId: string,
    filters?: { lessonSlug?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<TutorSession[]> {
    return this.service.listSessions(userId, filters);
  }

  async softDeleteSession(sessionId: string, userId: string): Promise<void> {
    return this.service.softDeleteSession(sessionId, userId);
  }

  async createMessage(params: CreateMessageParams, userId: string): Promise<TutorMessage> {
    return this.service.createMessage(params, userId);
  }

  async getMessages(
    sessionId: string,
    userId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TutorMessage[]> {
    return this.service.getMessages(sessionId, userId, options);
  }

  async updateSessionSummary(
    sessionId: string,
    userId: string,
    summary: string,
  ): Promise<TutorSession> {
    return this.service.updateSessionSummary(sessionId, userId, summary);
  }

  async getLearnerProfile(userId: string) {
    return this.service.getLearnerProfile(userId);
  }

  async upsertLearnerProfile(
    userId: string,
    data: {
      weakConcepts?: string[];
      strongConcepts?: string[];
      askedConcepts?: string[];
      preferredExplanationStyle?: string;
      preferredLanguage?: string;
      summary?: string;
    },
  ) {
    return this.service.upsertLearnerProfile(userId, data);
  }

  async createFeedback(messageId: string, rating: number, comment?: string, tags?: string[]) {
    return this.service.createFeedback(messageId, rating, comment, tags);
  }

  async createMessageFlag(messageId: string, reason: string, flaggedBy: string) {
    return this.service.createMessageFlag(messageId, reason, flaggedBy);
  }
}

