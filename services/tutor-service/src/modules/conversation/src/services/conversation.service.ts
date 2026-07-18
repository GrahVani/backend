import { TutorSession, TutorMessage } from "@grahvani/tutor-database";
import { ConversationRepository } from "../repositories/conversation.repository";
import { ForbiddenError, NotFoundError } from "@grahvani/contracts";
import { enqueueSummarizationJob } from "../../../../queues/summarization.queue";
import { logger } from "../../../../config/logger";

export interface CreateMessageParams {
  sessionId: string;
  clientMessageId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  intent?: string;
  promptVersion?: string;
  model?: string;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  latencyMs?: number;
  retrievedChunkIds?: string[];
}

export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

  async createSession(
    userId: string,
    title: string,
    lessonSlug?: string,
    id?: string,
  ): Promise<TutorSession> {
    return this.repository.createSession(userId, title, lessonSlug, id);
  }

  async getSession(sessionId: string, userId: string): Promise<TutorSession | null> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session) {
      return null;
    }
    if (session.userId !== userId) {
      throw new ForbiddenError("You do not have permission to access this session");
    }
    return session;
  }

  async listSessions(
    userId: string,
    filters?: { lessonSlug?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<TutorSession[]> {
    return this.repository.findSessionsByUserId(userId, filters);
  }

  async softDeleteSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError("Session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenError("You do not have permission to delete this session");
    }
    await this.repository.updateSession(sessionId, { deletedAt: new Date() });
  }

  async createMessage(params: CreateMessageParams, userId: string): Promise<TutorMessage> {
    // Verify session exists and is owned by the user
    const session = await this.repository.findSessionById(params.sessionId);
    if (!session) {
      throw new NotFoundError("Session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenError("You do not have permission to write to this session");
    }

    // Idempotency check using clientMessageId
    const existingMessage = await this.repository.findMessageByClientMessageId(
      params.clientMessageId,
    );
    if (existingMessage) {
      return existingMessage;
    }

    // Create the message
    const message = await this.repository.createMessage(params);

    // Update lastMessageAt on the session
    await this.repository.updateSession(params.sessionId, { lastMessageAt: new Date() });

    // Enqueue summarization rolling window if active message count is a multiple of 4
    try {
      const messages = await this.repository.findMessagesBySessionId(params.sessionId);
      const activeCount = messages.filter((m) => !m.deletedAt).length;
      if (activeCount >= 4 && activeCount % 4 === 0) {
        await enqueueSummarizationJob(params.sessionId, userId);
      }
    } catch (err: any) {
      logger.error(
        { err: err.message, sessionId: params.sessionId },
        "Failed to enqueue summarization job",
      );
    }

    return message;
  }

  async getMessages(
    sessionId: string,
    userId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TutorMessage[]> {
    // Verify session exists and is owned by the user
    const session = await this.repository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError("Session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenError("You do not have permission to access this session");
    }

    return this.repository.findMessagesBySessionId(sessionId, options);
  }

  async updateSessionSummary(
    sessionId: string,
    userId: string,
    summary: string,
  ): Promise<TutorSession> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError("Session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenError("You do not have permission to modify this session");
    }
    return this.repository.updateSession(sessionId, { summary });
  }

  async getLearnerProfile(userId: string) {
    return this.repository.getLearnerProfile(userId);
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
    return this.repository.upsertLearnerProfile(userId, data);
  }

  async createFeedback(messageId: string, rating: number, comment?: string, tags?: string[]) {
    return this.repository.createFeedback(messageId, rating, comment, tags);
  }

  async createMessageFlag(messageId: string, reason: string, flaggedBy: string) {
    return this.repository.createMessageFlag(messageId, reason, flaggedBy);
  }
}

