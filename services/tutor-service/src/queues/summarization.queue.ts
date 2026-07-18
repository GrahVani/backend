import { Queue } from "bullmq";
import { config } from "../config";
import { logger } from "../config/logger";
import { redis } from "../config/redis";

import Redis from "ioredis";

const queueName = "tutor-summarization";

export const summarizationQueue = new Queue(queueName, {
  connection: new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
  }),
});

export async function enqueueSummarizationJob(sessionId: string, userId: string): Promise<void> {
  logger.info({ sessionId, userId }, `Enqueuing summarization job for session`);
  await summarizationQueue.add(
    "summarize",
    { sessionId, userId },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
