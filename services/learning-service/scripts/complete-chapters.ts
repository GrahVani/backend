/// <reference types="node" />

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Module / Chapters Completion Script
 *  ─────────────────────────────────────────────────────────────────────────
 *  Marks all lessons in a module-chapter range as MASTERED for a given user.
 *
 *  Usage:
 *    tsx scripts/complete-chapters.ts <userId> <tierNumber> <moduleNumber> <chStart> <chEnd>
 *
 *  Examples:
 *    tsx scripts/complete-chapters.ts dev-local-user 1 1 1 3
 *    tsx scripts/complete-chapters.ts 240768f7-c2c2-4fdc-9cf1-37e8e7d6709d 1 1 1 4
 *    tsx scripts/complete-chapters.ts dev-local-user 1 2 1 5
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PrismaClient, ProgressStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_USER_ID = "dev-local-user";

function countSections(bodyMarkdown: string | null): number {
  if (!bodyMarkdown) return 0;
  const matches = bodyMarkdown.match(/^#\s+§\d+/gm);
  return matches ? matches.length : 0;
}

async function completeChapters(
  userId: string,
  tierNumber: number,
  moduleNumber: number,
  chapterStart: number,
  chapterEnd: number
) {
  console.log(`🎯 User: ${userId} | Tier ${tierNumber} | Module ${moduleNumber} | Chapters ${chapterStart} → ${chapterEnd}`);

  const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
  if (!tier) throw new Error(`Tier ${tierNumber} not found`);

  const moduleRecord = await prisma.module.findFirst({
    where: { number: moduleNumber, tierId: tier.id },
    orderBy: { sequenceOrder: "asc" },
  });
  if (!moduleRecord) throw new Error(`Module ${moduleNumber} not found`);
  console.log(`📚 ${moduleRecord.title}`);

  const chapters = await prisma.chapter.findMany({
    where: {
      moduleId: moduleRecord.id,
      number: { gte: chapterStart, lte: chapterEnd },
    },
    orderBy: { number: "asc" },
    include: {
      lessons: { orderBy: { sequence: "asc" } },
    },
  });

  if (chapters.length === 0) {
    throw new Error(`No chapters ${chapterStart}-${chapterEnd} found in Module ${moduleNumber}`);
  }

  let totalLessons = 0;
  let totalPoints = 0;

  for (const chapter of chapters) {
    console.log(`\n  📖 Ch ${chapter.number}: ${chapter.title} (${chapter.lessons.length} lessons)`);

    for (const lesson of chapter.lessons) {
      const sections = countSections(lesson.bodyMarkdown);
      const allSectionIds = Array.from({ length: sections }, (_, i) => i + 1);

      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
        create: {
          userId,
          lessonId: lesson.id,
          moduleId: moduleRecord.id,
          status: "MASTERED" as ProgressStatus,
          score: 100,
          completionPercentage: 100,
          sectionsViewedJson: allSectionIds as unknown as any,
          startedAt: new Date(),
          completedAt: new Date(),
          lastAttemptedAt: new Date(),
          pointsEarned: 50,
        },
        update: {
          status: "MASTERED" as ProgressStatus,
          score: 100,
          completionPercentage: 100,
          sectionsViewedJson: allSectionIds as unknown as any,
          completedAt: new Date(),
          lastAttemptedAt: new Date(),
          pointsEarned: 50,
        },
      });
      totalLessons++;
      totalPoints += 50;
    }

    const chapterPoints = chapter.lessons.length * 50 + 25;
    await prisma.chapterProgress.upsert({
      where: { userId_chapterId: { userId, chapterId: chapter.id } },
      create: {
        userId,
        chapterId: chapter.id,
        status: "MASTERED" as ProgressStatus,
        averageLessonScore: 100,
        chapterCheckScore: 100,
        progressPercentage: 100,
        pointsEarned: chapterPoints,
        completedAt: new Date(),
      },
      update: {
        status: "MASTERED" as ProgressStatus,
        averageLessonScore: 100,
        chapterCheckScore: 100,
        progressPercentage: 100,
        pointsEarned: chapterPoints,
        completedAt: new Date(),
      },
    });
    totalPoints += 25;
    console.log(`     ✅ MASTERED (+${chapterPoints} pts)`);
  }

  // ── Recalculate Module Progress ──
  const moduleLessons = await prisma.lesson.findMany({
    where: { module: moduleNumber },
    select: { id: true },
  });
  const moduleLessonIds = moduleLessons.map((l) => l.id);

  const completedLessonCount = await prisma.lessonProgress.count({
    where: { userId, lessonId: { in: moduleLessonIds }, status: "MASTERED" },
  });

  const moduleProgressPercentage =
    moduleLessonIds.length > 0
      ? Math.round((completedLessonCount / moduleLessonIds.length) * 100)
      : 0;

  const isModuleComplete = completedLessonCount === moduleLessonIds.length;

  await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId, moduleId: moduleRecord.id } },
    create: {
      userId,
      moduleId: moduleRecord.id,
      status: isModuleComplete ? ("COMPLETED" as ProgressStatus) : ("IN_PROGRESS" as ProgressStatus),
      averageLessonScore: 100,
      progressPercentage: moduleProgressPercentage,
      prerequisiteMet: true,
      pointsEarned: totalPoints,
      completedAt: isModuleComplete ? new Date() : undefined,
    },
    update: {
      status: isModuleComplete ? ("COMPLETED" as ProgressStatus) : ("IN_PROGRESS" as ProgressStatus),
      averageLessonScore: 100,
      progressPercentage: moduleProgressPercentage,
      pointsEarned: totalPoints,
      completedAt: isModuleComplete ? new Date() : undefined,
    },
  });

  // ── Update User Learning Profile ──
  const lpSum = await prisma.lessonProgress.aggregate({
    where: { userId },
    _sum: { pointsEarned: true },
  });
  const qaSum = await prisma.quizAttempt.aggregate({
    where: { userId },
    _sum: { pointsEarned: true },
  });
  const allPoints = (lpSum._sum.pointsEarned || 0) + (qaSum._sum.pointsEarned || 0);

  const totalMastered = await prisma.lessonProgress.count({
    where: { userId, status: "MASTERED" },
  });
  const totalModulesCompleted = await prisma.moduleProgress.count({
    where: { userId, status: "COMPLETED" },
  });

  const TIER_THRESHOLDS = [0, 500, 1500, 3000, 5000, 8000];
  let currentTier = 1;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (allPoints >= TIER_THRESHOLDS[i]) {
      currentTier = i + 1;
      break;
    }
  }

  await prisma.userLearningProfile.upsert({
    where: { userId },
    create: {
      userId,
      skillScore: Math.min(Math.round(allPoints / 10) + totalModulesCompleted * 40, 1000),
      currentTier,
      totalLessonsCompleted: totalMastered,
      totalModulesCompleted,
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      totalPoints: allPoints,
      lastActivityDate: new Date(),
    },
    update: {
      skillScore: Math.min(Math.round(allPoints / 10) + totalModulesCompleted * 40, 1000),
      currentTier,
      totalLessonsCompleted: totalMastered,
      totalModulesCompleted,
      totalPoints: allPoints,
      lastActivityDate: new Date(),
    },
  });

  console.log(`\n🏆 Summary:`);
  console.log(`   Lessons mastered : ${totalLessons}`);
  console.log(`   Chapters mastered: ${chapters.length}`);
  console.log(`   Module progress  : ${moduleProgressPercentage}% (${isModuleComplete ? "COMPLETED" : "IN_PROGRESS"})`);
  console.log(`   Points awarded   : ${totalPoints}`);
  console.log(`   Total user XP    : ${allPoints}`);
  console.log(`\n✅ Done!`);
}

// ── Parse CLI args ──
const userId = process.argv[2] || DEFAULT_USER_ID;
const tierNum = parseInt(process.argv[3] || "1", 10);
const moduleNum = parseInt(process.argv[4] || "1", 10);
const chStart = parseInt(process.argv[5] || "1", 10);
const chEnd = parseInt(process.argv[6] || String(chStart), 10);

if (isNaN(tierNum) || isNaN(moduleNum) || isNaN(chStart) || isNaN(chEnd)) {
  console.error("Usage: tsx scripts/complete-chapters.ts <userId> <tierNumber> <moduleNumber> <chStart> <chEnd>");
  process.exit(1);
}

completeChapters(userId, tierNum, moduleNum, chStart, chEnd)
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
