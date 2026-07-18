import { AnalyticsService, UsageLogParams, AdminStats } from "./index";

export class AnalyticsFacade {
  constructor(private readonly service: AnalyticsService) {}

  async logUsage(params: UsageLogParams): Promise<void> {
    return this.service.logUsage(params);
  }

  async getAdminStats(startDate?: Date, endDate?: Date): Promise<AdminStats> {
    return this.service.getAdminStats(startDate, endDate);
  }
}
