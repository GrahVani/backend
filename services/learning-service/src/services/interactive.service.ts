/**
 * Interactive Component Analytics Service
 * Based on 05-interactive-component-taxonomy.md §12.5
 *
 * Tracks component opens, time spent, inputs explored.
 */

import { Prisma, InteractiveEvent } from "@prisma/client";
import { prisma } from "../config/database";
import { InteractiveEventData } from "../types/prisma-json";

export interface InteractiveEventInput {
  userId: string;
  componentSlug: string;
  lessonId?: string;
  eventType: "open" | "close" | "interaction" | "input_change";
  eventData?: {
    inputName?: string;
    inputValue?: string | number;
    durationSeconds?: number;
  };
}

interface ComponentAnalytics {
  componentId: string;
  slug: string;
  title: string;
  status: string;
  totalOpens: number;
  totalInteractions: number;
  uniqueUsers: number;
  avgDurationSeconds: number;
}

interface UserInteractiveStat {
  id: string;
  componentSlug: string;
  componentTitle: string;
  eventType: string;
  eventData: Prisma.JsonValue | null;
  createdAt: Date;
}

export async function trackInteractiveEvent(input: InteractiveEventInput): Promise<InteractiveEvent> {
  // Resolve component by slug
  let component = await prisma.interactiveComponent.findUnique({
    where: { slug: input.componentSlug },
  });

  // Auto-create component record if not exists
  if (!component) {
    component = await prisma.interactiveComponent.create({
      data: {
        slug: input.componentSlug,
        title: input.componentSlug,
        family: "UNKNOWN",
        tierCompatibility: "Both",
        status: "SPEC_ONLY",
      },
    });
  }

  return prisma.interactiveEvent.create({
    data: {
      userId: input.userId,
      componentId: component.id,
      lessonId: input.lessonId || null,
      eventType: input.eventType,
      eventData: input.eventData as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getComponentAnalytics(componentSlug: string): Promise<ComponentAnalytics | null> {
  const component = await prisma.interactiveComponent.findUnique({
    where: { slug: componentSlug },
    include: {
      events: true,
    },
  });

  if (!component) return null;

  const opens = component.events.filter((e) => e.eventType === "open");
  const interactions = component.events.filter((e) => e.eventType === "interaction");
  const uniqueUsers = new Set(component.events.map((e) => e.userId)).size;

  const avgDuration =
    interactions.length > 0
      ? Math.round(
          interactions.reduce((sum, e) => {
            const data = (e.eventData as unknown as InteractiveEventData) || {};
            return sum + (data.durationSeconds || 0);
          }, 0) / interactions.length
        )
      : 0;

  return {
    componentId: component.id,
    slug: component.slug,
    title: component.title,
    status: component.status,
    totalOpens: opens.length,
    totalInteractions: interactions.length,
    uniqueUsers,
    avgDurationSeconds: avgDuration,
  };
}

export async function getUserInteractiveStats(userId: string, lessonId?: string): Promise<UserInteractiveStat[]> {
  const where: Prisma.InteractiveEventWhereInput = { userId };
  if (lessonId) where.lessonId = lessonId;

  const events = await prisma.interactiveEvent.findMany({ take: 250, 
    where,
    orderBy: { createdAt: "desc" },
    include: {
      component: { select: { slug: true, title: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    componentSlug: e.component.slug,
    componentTitle: e.component.title,
    eventType: e.eventType,
    eventData: e.eventData,
    createdAt: e.createdAt,
  }));
}
