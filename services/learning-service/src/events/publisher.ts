import { randomUUID } from "crypto";
import {
  type CurriculumImportCompletedEvent,
  type CurriculumContentUpdatedEvent,
  type CurriculumContentDeletedEvent,
  type CurriculumContentType,
  EVENT_CHANNELS,
} from "@grahvani/contracts";
import { getRedisPublisher } from "../config/redis";
import { logger } from "../config/logger";

export type PublishStatus = "success" | "failed" | "skipped";

export type PublishResult =
  | {
      status: "success";
      eventId: string;
      eventType: string;
      channel: string;
      durationMs: number;
      correlationId?: string;
    }
  | {
      status: "failed";
      eventId: string;
      eventType: string;
      channel: string;
      durationMs: number;
      correlationId?: string;
      error: string;
    }
  | {
      status: "skipped";
      eventId: string;
      eventType: string;
      channel: string;
      correlationId?: string;
      reason: string;
    };

interface BaseMetadata {
  eventId: string;
  timestamp: string;
  source: string;
  correlationId?: string;
  version: "1.0";
}

function createMetadata(correlationId?: string): BaseMetadata {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "learning-service",
    correlationId: correlationId || randomUUID(),
    version: "1.0",
  };
}

async function publishEvent<T extends { type: string; data: unknown; metadata: BaseMetadata }>(
  event: T,
  channel: string,
): Promise<PublishResult> {
  const start = Date.now();
  const eventType = event.type;
  const { eventId, correlationId } = event.metadata;

  try {
    const redis = getRedisPublisher();

    if (!process.env.REDIS_URL && redis.status === "wait") {
      const reason = "REDIS_URL not configured; event publishing skipped";
      logger.warn(
        { eventId, eventType, channel, correlationId, reason },
        "Curriculum event skipped",
      );
      return { status: "skipped", eventId, eventType, channel, correlationId, reason };
    }

    await redis.publish(channel, JSON.stringify(event));
    const durationMs = Date.now() - start;

    logger.info(
      { eventId, eventType, channel, correlationId, durationMs },
      "Curriculum event published",
    );

    return { status: "success", eventId, eventType, channel, correlationId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);

    logger.error(
      { eventId, eventType, channel, correlationId, durationMs, error },
      "Curriculum event publish failed",
    );

    return { status: "failed", eventId, eventType, channel, correlationId, durationMs, error };
  }
}

export async function publishImportCompleted({
  scope,
  lessonSlug,
  correlationId,
}: {
  scope: "full" | "lesson";
  lessonSlug?: string;
  correlationId?: string;
}): Promise<PublishResult> {
  const event: CurriculumImportCompletedEvent = {
    type: "curriculum.import.completed",
    data: { scope, lessonSlug },
    metadata: createMetadata(correlationId),
  };

  return publishEvent(event, EVENT_CHANNELS.LEARNING);
}

export async function publishContentUpdated({
  contentType,
  contentId,
  lessonSlug,
  correlationId,
}: {
  contentType: CurriculumContentType;
  contentId: string;
  lessonSlug?: string;
  correlationId?: string;
}): Promise<PublishResult> {
  const event: CurriculumContentUpdatedEvent = {
    type: "curriculum.content.updated",
    data: { contentType, contentId, lessonSlug },
    metadata: createMetadata(correlationId),
  };

  return publishEvent(event, EVENT_CHANNELS.LEARNING);
}

export async function publishContentDeleted({
  contentType,
  contentId,
  lessonSlug,
  correlationId,
}: {
  contentType: CurriculumContentType;
  contentId: string;
  lessonSlug?: string;
  correlationId?: string;
}): Promise<PublishResult> {
  const event: CurriculumContentDeletedEvent = {
    type: "curriculum.content.deleted",
    data: { contentType, contentId, lessonSlug },
    metadata: createMetadata(correlationId),
  };

  return publishEvent(event, EVENT_CHANNELS.LEARNING);
}

export { disconnectRedisPublisher } from "../config/redis";
