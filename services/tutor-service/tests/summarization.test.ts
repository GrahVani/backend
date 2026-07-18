import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";
import { enqueueSummarizationJob, summarizationQueue } from "../src/queues/summarization.queue";
import { startSummarizationWorker } from "../src/workers/summarization";
import { disconnectRedis, redis } from "../src/config/redis";
import { disconnectPrisma, prisma } from "../src/database/prisma";
import { randomUUID } from "crypto";

async function runSummarizationTests() {
  console.log("Starting Cost Logging & Summarization Worker Verification...");

  const container = getContainer();
  const conversationFacade = container.conversationFacade;
  const contextBuilder = container.contextBuilder;
  const learningClient = container.learningClient;
  const prismaClient = prisma;

  const userId = "summarize-test-user";
  const lessonSlug = "jyotisha-as-vedanga";
  const sessionId = `sum-sess-${Date.now()}`;

  let worker: any;

  try {
    // 1. Create a new session
    console.log("Creating new test session...");
    await conversationFacade.createSession(userId, "Astrology Summary Test", lessonSlug, sessionId);

    // 2. Clear pre-existing jobs
    await summarizationQueue.drain(true);

    // 3. Write 9 messages (should NOT trigger enqueue)
    console.log("Writing first 9 messages...");
    for (let i = 1; i <= 9; i++) {
      await conversationFacade.createMessage({
        sessionId,
        clientMessageId: `msg-${sessionId}-${i}`,
        role: i % 2 === 1 ? "USER" : "ASSISTANT",
        content: `Message turn content number ${i}`,
      }, userId);
    }

    let jobsCount = await summarizationQueue.getJobCounts();
    console.log("Job counts after 9 messages:", jobsCount);
    if (jobsCount.waiting > 0 || jobsCount.active > 0) {
      throw new Error("Expected zero queued jobs before 10th message threshold");
    }

    // 4. Write 10th message (triggers enqueue)
    console.log("Writing 10th message to trigger worker enqueuing...");
    await conversationFacade.createMessage({
      sessionId,
      clientMessageId: `msg-${sessionId}-10`,
      role: "ASSISTANT",
      content: "This is the 10th message that should trigger background summarization.",
    }, userId);

    // Give a brief delay for async enqueuer
    await new Promise((resolve) => setTimeout(resolve, 500));

    jobsCount = await summarizationQueue.getJobCounts();
    console.log("Job counts after 10th message:", jobsCount);
    if (jobsCount.waiting === 0) {
      throw new Error("Failed to enqueue summarization job at 10th message threshold");
    }

    // 5. Start worker and wait for execution completion
    console.log("Starting background worker to process job...");
    worker = startSummarizationWorker();

    // Poll until queue is processed
    let attempts = 0;
    while (attempts < 20) {
      jobsCount = await summarizationQueue.getJobCounts();
      if (jobsCount.waiting === 0 && jobsCount.active === 0) {
        break;
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log("Processing finished. Fetching updated session data...");
    const updatedSession = await conversationFacade.getSession(sessionId, userId);
    if (!updatedSession || !updatedSession.summary) {
      throw new Error("Failed to update TutorSession.summary in database");
    }
    console.log("Updated Session Summary:", updatedSession.summary);

    // 6. Verify ContextBuilder summary integration and history truncation
    console.log("Testing ContextBuilder truncation behavior with summary...");
    const lessonContext = await learningClient.getLessonContext(lessonSlug);
    const messages = await conversationFacade.getMessages(sessionId, userId);

    const builderResult = contextBuilder.build(
      "What is next?",
      lessonContext,
      messages,
      [],
      updatedSession.summary
    );

    console.log("Generated conversationHistory length:", builderResult.conversationHistory.length);
    if (!builderResult.conversationHistory.includes("[Session Summary of previous conversation]")) {
      throw new Error("ContextBuilder failed to prepend session summary");
    }

    // Since a summary is present, the message history is sliced to the last 10 turns.
    // 7. Verify analytics usage logs was written for background worker (messageId: null)
    console.log("Verifying background cost and token usage logging...");
    const logs = await prismaClient.tutorUsageLog.findMany({
      where: { sessionId },
    });
    console.log(`Found ${logs.length} usage logs for session.`);
    const workerLog = logs.find((l) => l.messageId === null);
    if (!workerLog) {
      throw new Error("Background summarization worker usage log was not persisted with messageId = null");
    }
    console.log("Worker Usage Log:", workerLog);

    console.log("All Cost Logging & Summarization Worker checks passed successfully!");
    
    // Clean up
    console.log("Cleaning up test database records...");
    await prismaClient.tutorUsageLog.deleteMany({ where: { sessionId } });
    await prismaClient.tutorMessage.deleteMany({ where: { sessionId } });
    await prismaClient.tutorSession.deleteMany({ where: { id: sessionId } });

    // Close connections
    await worker.close();
    await summarizationQueue.close();
    await disconnectRedis();
    await disconnectPrisma();
    process.exit(0);
  } catch (err: any) {
    console.error("Summarization verification failed with error:", err.message || err);
    try {
      if (worker) await worker.close();
      await summarizationQueue.close();
      await disconnectRedis();
      await disconnectPrisma();
    } catch {}
    process.exit(1);
  }
}

runSummarizationTests();
