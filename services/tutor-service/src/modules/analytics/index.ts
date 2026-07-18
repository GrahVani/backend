/**
 * Analytics module — internal implementation module.
 *
 * This module owns usage logging, cost alerts, and admin stats.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP.
 */

export { AnalyticsFacade } from "./facade";

export interface UsageLogParams {
  userId: string;
  sessionId?: string;
  messageId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  provider: string;
}

export interface AdminStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  totalRequests: number;
  averageLatencyMs: number;
}

export interface AnalyticsService {
  logUsage(params: UsageLogParams): Promise<void>;
  getAdminStats(startDate?: Date, endDate?: Date): Promise<AdminStats>;
}

export { UsageLogRepository } from "./src/repositories/usage-log.repository";
export { AnalyticsServiceImpl } from "./src/services/analytics.service";
