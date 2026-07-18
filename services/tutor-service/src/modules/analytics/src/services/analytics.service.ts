import { AnalyticsService, UsageLogParams, AdminStats } from "../../index";
import { UsageLogRepository } from "../repositories/usage-log.repository";

// Pricing rates per token
const PRICING_RATES: Record<string, { inputRate: number; outputRate: number }> = {
  "gemini-2.5-flash-lite": {
    inputRate: 0.075 / 1000000,
    outputRate: 0.3 / 1000000,
  },
  "gemini-2.5-flash": {
    inputRate: 0.075 / 1000000,
    outputRate: 0.3 / 1000000,
  },
  default: {
    inputRate: 0.15 / 1000000,
    outputRate: 0.6 / 1000000,
  },
};

export class AnalyticsServiceImpl implements AnalyticsService {
  constructor(private readonly repository: UsageLogRepository) {}

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rate = PRICING_RATES[model.toLowerCase()] || PRICING_RATES.default;
    return inputTokens * rate.inputRate + outputTokens * rate.outputRate;
  }

  async logUsage(params: UsageLogParams): Promise<void> {
    const costUsd = this.calculateCost(params.model, params.inputTokens, params.outputTokens);
    await this.repository.create({
      ...params,
      costUsd,
    });
  }

  async getAdminStats(startDate?: Date, endDate?: Date): Promise<AdminStats> {
    const rawStats = await this.repository.getStats(startDate, endDate);
    return {
      totalTokens: rawStats.inputTokens + rawStats.outputTokens,
      inputTokens: rawStats.inputTokens,
      outputTokens: rawStats.outputTokens,
      totalCostUsd: rawStats.costUsd,
      totalRequests: rawStats.totalRequests,
      averageLatencyMs: Math.round(rawStats.averageLatencyMs),
    };
  }
}
