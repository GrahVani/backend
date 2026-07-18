import { PrismaClient, TutorSession, TutorMessage, Prisma } from "@grahvani/tutor-database";

export interface CreateMessageDbParams {
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

export class ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(
    userId: string,
    title: string,
    lessonSlug?: string,
    id?: string,
  ): Promise<TutorSession> {
    return this.prisma.tutorSession.create({
      data: {
        id,
        userId,
        title,
        lessonSlug,
        status: "ACTIVE",
      },
    });
  }

  async findSessionById(id: string): Promise<TutorSession | null> {
    return this.prisma.tutorSession.findUnique({
      where: { id },
    });
  }

  async findSessionsByUserId(
    userId: string,
    filters?: { lessonSlug?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<TutorSession[]> {
    const limit = filters?.limit || 20;
    const where: Prisma.TutorSessionWhereInput = { userId, deletedAt: null };

    if (filters?.lessonSlug) {
      where.lessonSlug = filters.lessonSlug;
    }
    if (filters?.status) {
      where.status = filters.status as any;
    }

    const query: Prisma.TutorSessionFindManyArgs = {
      where,
      take: limit,
      orderBy: { startedAt: "desc" },
    };

    if (filters?.cursor) {
      query.skip = 1;
      query.cursor = { id: filters.cursor };
    }

    return this.prisma.tutorSession.findMany(query);
  }

  async createMessage(params: CreateMessageDbParams): Promise<TutorMessage> {
    return this.prisma.tutorMessage.create({
      data: {
        sessionId: params.sessionId,
        clientMessageId: params.clientMessageId,
        role: params.role,
        content: params.content,
        intent: params.intent,
        promptVersion: params.promptVersion,
        model: params.model,
        tokenUsageInput: params.tokenUsageInput,
        tokenUsageOutput: params.tokenUsageOutput,
        latencyMs: params.latencyMs,
        retrievedChunkIds: params.retrievedChunkIds,
      },
    });
  }

  async findMessageByClientMessageId(clientMessageId: string): Promise<TutorMessage | null> {
    return this.prisma.tutorMessage.findUnique({
      where: { clientMessageId },
    });
  }

  async findMessagesBySessionId(
    sessionId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TutorMessage[]> {
    const limit = options?.limit || 100;
    const query: Prisma.TutorMessageFindManyArgs = {
      where: { sessionId, deletedAt: null },
      take: limit,
      orderBy: { createdAt: "asc" },
    };

    if (options?.cursor) {
      query.skip = 1;
      query.cursor = { id: options.cursor };
    }

    return this.prisma.tutorMessage.findMany(query);
  }

  async updateSession(id: string, data: Prisma.TutorSessionUpdateInput): Promise<TutorSession> {
    return this.prisma.tutorSession.update({
      where: { id },
      data,
    });
  }

  async getLearnerProfile(userId: string) {
    return this.prisma.learnerTutorProfile.findUnique({
      where: { userId },
    });
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
    return this.prisma.learnerTutorProfile.upsert({
      where: { userId },
      create: {
        userId,
        weakConcepts: data.weakConcepts || [],
        strongConcepts: data.strongConcepts || [],
        askedConcepts: data.askedConcepts || [],
        preferredExplanationStyle: data.preferredExplanationStyle,
        preferredLanguage: data.preferredLanguage,
        summary: data.summary,
      },
      update: {
        ...(data.weakConcepts ? { weakConcepts: data.weakConcepts } : {}),
        ...(data.strongConcepts ? { strongConcepts: data.strongConcepts } : {}),
        ...(data.askedConcepts ? { askedConcepts: data.askedConcepts } : {}),
        ...(data.preferredExplanationStyle !== undefined
          ? { preferredExplanationStyle: data.preferredExplanationStyle }
          : {}),
        ...(data.preferredLanguage !== undefined
          ? { preferredLanguage: data.preferredLanguage }
          : {}),
        ...(data.summary !== undefined ? { summary: data.summary } : {}),
      },
    });
  }

  async createFeedback(messageId: string, rating: number, comment?: string, tags?: string[]) {
    const feedback = await this.prisma.tutorFeedback.create({
      data: {
        messageId,
        rating,
        comment,
        tags: tags || [],
      },
    });
    await this.prisma.tutorMessage.updateMany({
      where: { id: messageId },
      data: { feedbackRating: rating },
    });
    return feedback;
  }

  async createMessageFlag(messageId: string, reason: string, flaggedBy: string) {
    return this.prisma.tutorMessageFlag.create({
      data: {
        messageId,
        reason,
        flaggedBy,
      },
    });
  }

  async listFlaggedMessages(limit = 50) {
    const flags = await this.prisma.tutorMessageFlag.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    const messageIds = Array.from(new Set(flags.map((f: any) => f.messageId).filter(Boolean)));
    const messages = await this.prisma.tutorMessage.findMany({
      where: { id: { in: messageIds } },
    });
    const messageMap = new Map(messages.map((m: any) => [m.id, m]));
    return flags.map((f: any) => ({
      ...f,
      message: messageMap.get(f.messageId) || null,
    }));
  }

  async resolveMessageFlag(flagId: string) {
    return this.prisma.tutorMessageFlag.deleteMany({
      where: { id: flagId },
    });
  }
}


