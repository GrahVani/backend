/**
 * Spaced Repetition Service
 * Based on 01-pedagogical-framework.md §5.3
 *
 * Implements a modified SM-2 algorithm (Ankidroid-style).
 * Auto-generates cards from lesson MCQs and "Things to remember" callouts.
 */

import { prisma } from "../config/database";
import { SpacedRepetitionCard } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// SM-2 Algorithm
// ─────────────────────────────────────────────────────────────

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2Result {
  easeFactor: number;
  intervalDays: number;
  repetitionCount: number;
  dueDate: Date;
}

/**
 * SM-2 algorithm implementation.
 * quality: 0-5 (0=complete blackout, 5=perfect response)
 */
export function sm2(
  quality: ReviewQuality,
  currentEaseFactor: number,
  currentIntervalDays: number,
  currentRepetitionCount: number
): SM2Result {
  let easeFactor = currentEaseFactor;
  let intervalDays = currentIntervalDays;
  let repetitionCount = currentRepetitionCount;

  // Minimum ease factor cap (SM-2 standard)
  const MIN_EASE_FACTOR = 1.3;

  if (quality < 3) {
    // Failed recall — reset repetition count
    repetitionCount = 0;
    intervalDays = 1; // Review again tomorrow
  } else {
    // Successful recall
    repetitionCount += 1;

    if (repetitionCount === 1) {
      intervalDays = 1;
    } else if (repetitionCount === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(currentIntervalDays * currentEaseFactor);
    }

    // Update ease factor
    easeFactor = currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < MIN_EASE_FACTOR) {
      easeFactor = MIN_EASE_FACTOR;
    }
  }

  // Cap interval at 365 days for practical reasons
  if (intervalDays > 365) intervalDays = 365;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + intervalDays);

  return { easeFactor, intervalDays, repetitionCount, dueDate };
}

// ─────────────────────────────────────────────────────────────
// Card Generation
// ─────────────────────────────────────────────────────────────

/**
 * Auto-generates SR cards for a user from a lesson's content.
 * Sources: MCQ bank + "Things to remember" callouts.
 */
export async function generateCardsForLesson(
  userId: string,
  lessonId: string
): Promise<number> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      slug: true,
      bodyMarkdown: true,
    },
  });

  if (!lesson) return 0;

  let createdCount = 0;

  // 1. Generate from MCQ bank spaced_repetition fields (DB-only)
  try {
    const bank = await prisma.mcqBank.findUnique({ where: { lessonId } });
    const questions = (bank?.questions as unknown as any[]) || [];

    for (const q of questions) {
      const sr = q.spaced_repetition || q.spaced_repetition_card;
      if (sr?.include_in_sr_deck) {
        const stem = q.stem || q.question_text || q.question || "";
        const front = sr.sr_card_front || stem;
        const correctOpt = (q.options || []).find((o: any) => o.is_correct || o.isCorrect);
        const back = sr.sr_card_back || correctOpt?.text || "";
        
        const existing = await prisma.spacedRepetitionCard.findUnique({
          where: {
            userId_lessonId_sourceType_sourceId: {
              userId,
              lessonId: lesson.id,
              sourceType: "MCQ",
              sourceId: q.id,
            },
          },
        });

        if (!existing) {
          await prisma.spacedRepetitionCard.create({
            data: {
              userId,
              lessonId: lesson.id,
              front,
              back,
              sourceType: "MCQ",
              sourceId: q.id,
            },
          });
          createdCount++;
        }
      }
    }
  } catch (e) {
    // Silently skip if MCQ bank can't be loaded
  }

  // 2. Generate from "Things to remember" callouts (§9)
  if (lesson.bodyMarkdown) {
    const calloutMatches = lesson.bodyMarkdown.matchAll(
      />\s*💡\s*\*\*Remember:\*\*\s*(.+?)(?=\n>|\n#|$)/gs
    );
    let calloutIdx = 0;
    for (const match of calloutMatches) {
      const text = match[1].trim();
      if (text.length > 5) {
        const existing = await prisma.spacedRepetitionCard.findUnique({
          where: {
            userId_lessonId_sourceType_sourceId: {
              userId,
              lessonId: lesson.id,
              sourceType: "CALLOUT",
              sourceId: String(calloutIdx),
            },
          },
        });

        if (!existing) {
          await prisma.spacedRepetitionCard.create({
            data: {
              userId,
              lessonId: lesson.id,
              front: `From "${lesson.slug}": What is the principle?`,
              back: text,
              sourceType: "CALLOUT",
              sourceId: String(calloutIdx),
            },
          });
          createdCount++;
        }
      }
      calloutIdx++;
    }
  }

  return createdCount;
}

// ─────────────────────────────────────────────────────────────
// Review Operations
// ─────────────────────────────────────────────────────────────

interface DueCard {
  id: string;
  front: string;
  back: string;
  sourceType: string;
  lessonTitle: string;
  lessonSlug: string;
  dueDate: Date;
  totalReviews: number;
  correctReviews: number;
}

interface SRStats {
  dueToday: number;
  totalCards: number;
  todayReviewed: number;
  todayCorrect: number;
}

export async function getDueCards(userId: string, limit: number = 50): Promise<DueCard[]> {
  const now = new Date();
  
  const cards = await prisma.spacedRepetitionCard.findMany({
    where: {
      userId,
      dueDate: { lte: now },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: {
      lesson: { select: { title: true, slug: true } },
    },
  });

  return cards.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    sourceType: c.sourceType,
    lessonTitle: c.lesson.title,
    lessonSlug: c.lesson.slug,
    dueDate: c.dueDate,
    totalReviews: c.totalReviews,
    correctReviews: c.correctReviews,
  }));
}

export async function submitCardReview(
  userId: string,
  cardId: string,
  quality: ReviewQuality
): Promise<SpacedRepetitionCard> {
  const card = await prisma.spacedRepetitionCard.findFirst({
    where: { id: cardId, userId },
  });

  if (!card) {
    throw new Error("Card not found");
  }

  const result = sm2(
    quality,
    card.easeFactor,
    card.intervalDays,
    card.repetitionCount
  );

  const updated = await prisma.spacedRepetitionCard.update({
    where: { id: cardId },
    data: {
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitionCount: result.repetitionCount,
      dueDate: result.dueDate,
      lastReviewedAt: new Date(),
      totalReviews: { increment: 1 },
      correctReviews: quality >= 3 ? { increment: 1 } : undefined,
    },
  });

  // Update today's session stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.userSRSession.upsert({
    where: {
      userId_sessionDate: {
        userId,
        sessionDate: today,
      },
    },
    create: {
      userId,
      sessionDate: today,
      cardsReviewed: 1,
      cardsCorrect: quality >= 3 ? 1 : 0,
    },
    update: {
      cardsReviewed: { increment: 1 },
      cardsCorrect: quality >= 3 ? { increment: 1 } : undefined,
    },
  });

  return updated;
}

export async function getSRStats(userId: string): Promise<SRStats> {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [dueCount, totalCards, todaySession] = await Promise.all([
    prisma.spacedRepetitionCard.count({
      where: { userId, dueDate: { lte: now } },
    }),
    prisma.spacedRepetitionCard.count({
      where: { userId },
    }),
    prisma.userSRSession.findUnique({
      where: { userId_sessionDate: { userId, sessionDate: today } },
    }),
  ]);

  return {
    dueToday: dueCount,
    totalCards,
    todayReviewed: todaySession?.cardsReviewed || 0,
    todayCorrect: todaySession?.cardsCorrect || 0,
  };
}
