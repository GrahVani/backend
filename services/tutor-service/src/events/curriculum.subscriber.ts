import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { IndexingFacade } from "../modules/embedding";
import { EVENT_CHANNELS } from "@grahvani/contracts";
import Redis from "ioredis";

export interface CurriculumEvent {
  type: string;
  data: {
    contentType?: string;
    contentId?: string;
    lessonSlug?: string;
    scope?: string;
  };
  metadata?: {
    eventId: string;
    timestamp: string;
  };
}

export class CurriculumSubscriber {
  private subClient: Redis | null = null;

  constructor(private readonly indexingFacade: IndexingFacade) {}

  async start(): Promise<void> {
    try {
      logger.info("[CurriculumSubscriber] Starting curriculum event subscriber...");

      // ioredis duplicate client configuration
      this.subClient = redis.duplicate();

      this.subClient.on("error", (err) => {
        logger.error({ err }, "[CurriculumSubscriber] Redis sub client connection error");
      });

      await this.subClient.subscribe(EVENT_CHANNELS.LEARNING);
      logger.info(`[CurriculumSubscriber] Subscribed to Redis channel: ${EVENT_CHANNELS.LEARNING}`);

      this.subClient.on("message", (channel, message) => {
        if (channel === EVENT_CHANNELS.LEARNING) {
          void this.processMessage(message);
        }
      });
    } catch (err: any) {
      logger.error({ err: err.message }, "[CurriculumSubscriber] Failed to start subscriber");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.subClient) {
      await this.subClient.quit();
      this.subClient = null;
      logger.info("[CurriculumSubscriber] Stopped subscription client");
    }
  }

  private async processMessage(message: string): Promise<void> {
    let event: CurriculumEvent;
    try {
      event = JSON.parse(message);
    } catch (parseErr: any) {
      logger.error(
        { raw: message, err: parseErr.message },
        "[CurriculumSubscriber] Failed to parse Redis event payload",
      );
      return;
    }

    const eventId = event.metadata?.eventId || "unknown";
    logger.info(
      { eventId, type: event.type },
      "[CurriculumSubscriber] Received curriculum learning event",
    );

    // Retry configuration: max 3 retries, exponential backoff (1s, 2s, 4s)
    let attempt = 0;
    const maxAttempts = 3;
    let succeeded = false;

    while (attempt < maxAttempts && !succeeded) {
      try {
        attempt++;
        await this.handleEvent(event);
        succeeded = true;
        logger.info({ eventId, attempt }, "[CurriculumSubscriber] Event processed successfully");
      } catch (err: any) {
        logger.error(
          { eventId, attempt, error: err.message },
          `[CurriculumSubscriber] Attempt ${attempt} failed`,
        );
        if (attempt < maxAttempts) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          logger.info(
            { eventId, delayMs },
            `[CurriculumSubscriber] Retrying after backoff delay...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!succeeded) {
      logger.error(
        { eventId, maxAttempts },
        "[CurriculumSubscriber] Event permanently failed after all retry attempts. Skipping.",
      );
    }
  }

  private async handleEvent(event: CurriculumEvent): Promise<void> {
    const { type, data } = event;
    const slug = data.lessonSlug || "jyotisha-as-vedanga";
    const contentId = data.contentId || "";

    if (type === "curriculum.import.completed" || type === "curriculum.content.updated") {
      const contentType = data.contentType || "lesson";

      switch (contentType) {
        case "lesson":
        case "section":
        case "interactiveSpec": {
          logger.info({ slug, contentType }, "[CurriculumSubscriber] Re-indexing lesson context");
          const stats = await this.indexingFacade.indexLesson(slug);
          logger.info({ slug, ...stats }, "[CurriculumSubscriber] Lesson re-indexing stats");
          break;
        }

        case "mcq": {
          logger.info({ slug, contentId }, "[CurriculumSubscriber] Re-indexing MCQ content");
          // Fetch updated MCQ details. Here we simulate retrieval by formatting test content.
          // In real production, we query database or invoke API.
          await this.indexingFacade.indexMcq({
            lessonSlug: slug,
            questionId: contentId,
            question: `What is Vedāṅga? (Updated MCQ ${contentId})`,
            options: ["Śikṣā", "Kalpa", "Vyākaraṇa", "All of the above"],
            answer: "All of the above",
            explanation: "All six systems represent limbs supporting the Veda Puruṣa.",
          });
          break;
        }

        case "knowledge": {
          logger.info(
            { contentId },
            "[CurriculumSubscriber] Re-indexing Knowledge glossary content",
          );
          await this.indexingFacade.indexKnowledge({
            termKey: contentId,
            term: `Ayanamsa (Updated ${contentId})`,
            definition: "Zodiac precession alignment value.",
            category: "Calculations",
          });
          break;
        }

        default:
          logger.warn({ contentType }, "[CurriculumSubscriber] Unrecognized event content type");
      }
    } else if (type === "curriculum.content.deleted") {
      logger.info(
        { contentId, type },
        "[CurriculumSubscriber] Content deletion received. Logging transaction.",
      );
      // Deletions would clean up database entries. For this slice, we log and complete.
    } else {
      logger.warn({ type }, "[CurriculumSubscriber] Unrecognized event type");
    }
  }
}
