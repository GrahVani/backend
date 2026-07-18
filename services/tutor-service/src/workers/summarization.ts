import { Worker, Job } from "bullmq";
import { config } from "../config";
import { logger } from "../config/logger";
import { redis } from "../config/redis";
import { getContainer } from "../container";

const queueName = "tutor-summarization";

export function startSummarizationWorker() {
  logger.info("Starting summarization worker...");

  // Duplicate redis client with maxRetriesPerRequest: null for blocking BullMQ commands
  const connection = redis.duplicate({
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const { sessionId, userId } = job.data;
      logger.info({ jobId: job.id, sessionId }, "Processing summarization job");

      const container = getContainer();
      const conversationFacade = container.conversationFacade;
      const geminiClient = container.geminiClient;
      const promptService = container.promptService;
      const analyticsService = container.analyticsService;

      // 1. Fetch all messages in the session
      const messages = await conversationFacade.getMessages(sessionId, userId, { limit: 100 });
      if (messages.length === 0) {
        logger.warn({ sessionId }, "No messages found for session summarization");
        return;
      }

      // 2. Format the messages for the summarization prompt
      const formattedLog = messages
        .filter((msg) => !msg.deletedAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((msg) => `${msg.role === "USER" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n");

      // 3. Render the summarization prompt using the centralized PromptService
      const renderResult = await promptService.renderSummarizationPrompt({
        conversationHistory: formattedLog,
      });

      // 4. Call Gemini to get the summary
      const startTime = Date.now();
      let response;
      try {
        response = await geminiClient.generateDetailed(renderResult.rendered);
      } catch (genErr: any) {
        logger.warn({ err: genErr.message, sessionId }, "Gemini API failed during summarization, preserving existing summary");
        throw genErr; // Re-throw so BullMQ triggers retry backoff
      }
      const latencyMs = Date.now() - startTime;
      const summaryText = (response?.text || "").trim();

      if (summaryText.length < 10) {
        logger.warn({ sessionId, summaryLength: summaryText.length }, "Generated summary is too short or empty, skipping database update");
        return;
      }

      // 5. Update session summary and AI cognitive memory profile in database
      await conversationFacade.updateSessionSummary(sessionId, userId, summaryText);
      try {
        await conversationFacade.upsertLearnerProfile(userId, {
          summary: `Latest AI Session Summary (${sessionId}): ${summaryText.slice(0, 800)}`,
        });
      } catch (profileErr: any) {
        logger.warn({ err: profileErr.message, userId }, "Failed to update learner profile summary");
      }
      logger.info({ sessionId }, "Session and learner profile summarized and updated successfully");


      // 6. Log background usage metrics
      try {
        await analyticsService.logUsage({
          userId,
          sessionId,
          messageId: undefined, // undefined messageId for background workers
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs,
          provider: "google",
        });
      } catch (err: any) {
        logger.error({ err: err.message }, "Failed to log summarization usage stats");
      }
    },
    {
      connection,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "Summarization job failed");
  });

  return worker;
}

if (require.main === module) {
  startSummarizationWorker();
}
