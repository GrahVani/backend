import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import { getContainer } from "./container";

async function testAnalyticsFlow() {
  console.log("Starting Analytics Integration Flow Verification...");
  const container = getContainer();
  const prisma = container.prisma;
  const analyticsService = container.analyticsService;

  const testUserId = `test-user-${Date.now()}`;
  const testSessionId = `test-sess-${Date.now()}`;
  const testMessageId = `test-msg-${Date.now()}`;

  try {
    const statsBefore = await analyticsService.getAdminStats();
    console.log("Baseline stats:", statsBefore);

    console.log("Logging usage for gemini-2.5-flash-lite...");
    await analyticsService.logUsage({
      userId: testUserId,
      sessionId: testSessionId,
      messageId: testMessageId,
      model: "gemini-2.5-flash-lite",
      inputTokens: 1000,
      outputTokens: 2000,
      latencyMs: 1500,
      provider: "google",
    });

    console.log("Logging usage with default rates...");
    await analyticsService.logUsage({
      userId: testUserId,
      sessionId: testSessionId,
      messageId: `${testMessageId}-2`,
      model: "custom-unsupported-model",
      inputTokens: 2000,
      outputTokens: 4000,
      latencyMs: 2500,
      provider: "mock",
    });

    const statsAfter = await analyticsService.getAdminStats();
    console.log("Stats after logging:", statsAfter);

    const requestsDiff = statsAfter.totalRequests - statsBefore.totalRequests;
    if (requestsDiff !== 2) {
      throw new Error(`Expected totalRequests diff to be 2, got ${requestsDiff}`);
    }

    const inputDiff = statsAfter.inputTokens - statsBefore.inputTokens;
    if (inputDiff !== 3000) {
      throw new Error(`Expected inputTokens diff to be 3000, got ${inputDiff}`);
    }

    const outputDiff = statsAfter.outputTokens - statsBefore.outputTokens;
    if (outputDiff !== 6000) {
      throw new Error(`Expected outputTokens diff to be 6000, got ${outputDiff}`);
    }

    const costDiff = statsAfter.totalCostUsd - statsBefore.totalCostUsd;
    const expectedCostDiff = 0.003375;
    if (Math.abs(costDiff - expectedCostDiff) > 0.000001) {
      throw new Error(`Expected cost diff to be around ${expectedCostDiff}, got ${costDiff}`);
    }

    const logs = await prisma.tutorUsageLog.findMany({
      where: { userId: testUserId },
    });
    if (logs.length !== 2) {
      throw new Error(
        `Expected to find 2 log entries in DB for user ${testUserId}, got ${logs.length}`,
      );
    }

    const firstLog = logs.find((l) => l.messageId === testMessageId);
    if (!firstLog) throw new Error("Could not find first log entry in database!");
    if (Math.abs((firstLog.costUsd || 0) - 0.000675) > 0.000001) {
      throw new Error(`Expected first log cost to be around 0.000675, got ${firstLog.costUsd}`);
    }

    const secondLog = logs.find((l) => l.messageId === `${testMessageId}-2`);
    if (!secondLog) throw new Error("Could not find second log entry in database!");
    if (Math.abs((secondLog.costUsd || 0) - 0.0027) > 0.000001) {
      throw new Error(`Expected second log cost to be around 0.0027, got ${secondLog.costUsd}`);
    }

    console.log("Cleaning up test database logs...");
    await prisma.tutorUsageLog.deleteMany({
      where: { userId: testUserId },
    });

    console.log("Analytics Integration Flow Verification Passed Successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Analytics integration validation failed:", err);
    process.exit(1);
  }
}

testAnalyticsFlow();
