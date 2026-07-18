import { PrismaClient, TutorUsageLog } from "@grahvani/tutor-database";

export interface CreateUsageLogParams {
  userId: string;
  sessionId?: string;
  messageId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  latencyMs?: number;
  provider: string;
}

export class UsageLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: CreateUsageLogParams): Promise<TutorUsageLog> {
    return this.prisma.tutorUsageLog.create({
      data: {
        userId: params.userId,
        sessionId: params.sessionId,
        messageId: params.messageId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: params.costUsd,
        latencyMs: params.latencyMs,
        provider: params.provider,
      },
    });
  }

  async getStats(startDate?: Date, endDate?: Date) {
    const whereClause: any = {};
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = startDate;
      }
      if (endDate) {
        whereClause.createdAt.lte = endDate;
      }
    }

    const aggregations = await this.prisma.tutorUsageLog.aggregate({
      where: whereClause,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
      },
      _avg: {
        latencyMs: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      inputTokens: aggregations._sum.inputTokens || 0,
      outputTokens: aggregations._sum.outputTokens || 0,
      costUsd: aggregations._sum.costUsd || 0,
      averageLatencyMs: aggregations._avg.latencyMs || 0,
      totalRequests: aggregations._count.id || 0,
    };
  }
}
