/**
 * Progress Service
 * All progress calculations are DYNAMIC — computed from actual learner activity.
 */

import { prisma } from "../config/database";
import {
  ProgressStatus,
  Prisma,
  ModuleProgress,
  UserLearningProfile,
  LessonProgress,
  ChapterProgress,
} from "@prisma/client";
import { SectionsViewedJson } from "../types/prisma-json";
import { getMilestones } from "./milestone.service";
import { MODULE_UNLOCK_RULES, TIER_THRESHOLDS, TIER_TITLES } from "../config/game.constants";

interface DashboardData {
  lessonsCompleted: number;
  attemptedLessons: number;
  totalLessons: number;
  averageScore: number;
  overallProgress: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  skillScore: number;
  currentTier: number;
  title: string;
  nextTierProgress: number;
  nextTierThreshold: number;
  prevTierThreshold: number;
  pointsToNextTier: number;
  totalModulesCompleted: number;
  perfectLessons: number;
  tierThresholds: number[];
  tierNames: Record<number, string>;
  badges: {
    earned: Array<{
      badgeCode: string;
      name: string;
      description: string;
      rarity: string;
      iconUrl: string | null;
      earnedAt?: Date;
    }>;
    upcoming: Array<{
      badgeCode: string;
      name: string;
      description: string;
      rarity: string;
      iconUrl: string | null;
      pointsReward: number;
      progress: { current: number; target: number; percent: number };
    }>;
  };
  progress: Array<{
    id: string;
    lessonId: string;
    status: string;
    score: number | null;
    completedAt: Date | null;
    lesson: { title: string; courseId: string };
  }>;
}

interface CourseWithProgress {
  id: string;
  title: string;
  description: string;
  level: string;
  category: string;
  thumbnailUrl: string | null;
  isPublished: boolean;
  sequenceOrder: number;
  lessons: Array<{
    id: string;
    title: string;
    sequenceOrder: number;
    lessonType: string;
  }>;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  averageScore: number;
  status: string;
  moduleNumber: number;
}

interface LessonProgressData {
  lessonId: string;
  courseId: string;
  status: string;
  completionPercentage: number;
  score: number;
  sectionProgressPercentage: number;
  sectionsViewed: number[];
  totalSections: number;
  quizAttempts: Array<{
    id: string;
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    pointsEarned: number;
    completedAt: Date | null;
  }>;
  bestScore: number;
  attemptsCount: number;
}

interface ModuleProgressListItem {
  moduleId: string;
  title: string;
  status: string;
  progressPercentage: number;
  lessonsCompleted: number;
  totalLessons: number;
  averageScore: number;
}

// Count sections in bodyMarkdown by counting § markers
function countSections(bodyMarkdown: string | null): number {
  if (!bodyMarkdown) return 0;
  const matches = bodyMarkdown.match(/^#\s+§\d+/gm);
  return matches ? matches.length : 0;
}

// ============================================================
// DYNAMIC MODULE PROGRESS RECALCULATION
// ============================================================

export async function recalculateModuleProgress(userId: string, moduleId: string): Promise<ModuleProgress | null> {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      chapters: {
        include: {
          lessons: { select: { id: true } },
        },
      },
    },
  });

  if (!module) return null;

  const lessonIds = module.chapters.flatMap((ch) => ch.lessons.map((l) => l.id));

  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
  });

  const completedLessons = lessonProgresses.filter(
    (lp) => lp.status === "MASTERED" || lp.status === "COMPLETED"
  );
  const totalLessons = lessonIds.length;
  const lessonsCompletedCount = completedLessons.length;

  const averageLessonScore =
    completedLessons.length > 0
      ? Math.round(
          completedLessons.reduce((sum, lp) => sum + (lp.score || 0), 0) / completedLessons.length
        )
      : 0;

  const progressPercentage = totalLessons > 0
    ? Math.round((lessonsCompletedCount / totalLessons) * 100)
    : 0;

  let status: ProgressStatus;
  if (lessonsCompletedCount === totalLessons && totalLessons > 0) {
    status = "COMPLETED";
  } else if (lessonsCompletedCount > 0) {
    status = "IN_PROGRESS";
  } else {
    status = "AVAILABLE";
  }

  // Check unlock rules (prerequisites)
  const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === moduleId);
  if (status !== "COMPLETED" && rule && rule.unlockCondition !== "free") {
    const prereqModuleId = rule.prerequisiteModuleId;
    if (prereqModuleId) {
      const prereqProgress = await prisma.moduleProgress.findUnique({
        where: { userId_moduleId: { userId, moduleId: prereqModuleId } },
      });
      const isPrereqMet =
        prereqProgress?.status === "COMPLETED" &&
        (prereqProgress.averageLessonScore || 0) >= rule.minimumScore;

      if (!isPrereqMet) {
        status = "LOCKED";
      }
    }
  }

  const existing = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });

  const shouldSetCompletedAt = status === "COMPLETED" && !existing?.completedAt;

  const moduleProgress = await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: {
      userId,
      moduleId,
      status,
      averageLessonScore,
      progressPercentage,
      prerequisiteModuleId: rule?.prerequisiteModuleId || null,
      prerequisiteMet: status !== "LOCKED",
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
    update: {
      status,
      averageLessonScore,
      progressPercentage,
      prerequisiteMet: status !== "LOCKED",
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
  });

  return moduleProgress;
}

// ============================================================
// DYNAMIC USER LEARNING PROFILE RECALCULATION
// ============================================================

export async function recalculateUserLearningProfile(userId: string): Promise<UserLearningProfile> {
  const totalLessonsCompleted = await prisma.lessonProgress.count({
    where: { userId, status: { in: ["MASTERED", "COMPLETED"] } },
  });

  const totalModulesCompleted = await prisma.moduleProgress.count({
    where: { userId, status: "COMPLETED" },
  });

  const quizAgg = await prisma.quizAttempt.aggregate({
    where: { userId },
    _sum: { totalQuestions: true, correctAnswers: true },
  });

  const totalQuestionsAnswered = quizAgg._sum.totalQuestions || 0;
  const totalCorrectAnswers = quizAgg._sum.correctAnswers || 0;

  const averageAccuracy =
    totalQuestionsAnswered > 0
      ? (totalCorrectAnswers / totalQuestionsAnswered) * 100
      : 0;

  const profile = await prisma.userLearningProfile.findUnique({ where: { userId } });
  const currentStreak = profile?.currentStreak || 0;
  const totalPoints = profile?.totalPoints || 0;
  const badgesEarned = await prisma.userBadge.count({ where: { userId } });

  const pointsComponent = Math.min(totalPoints / 10, 400);
  const moduleComponent = totalModulesCompleted * 40;
  const accuracyComponent = averageAccuracy * 1.5;
  const streakComponent = Math.min(currentStreak * 2, 30);
  const badgeComponent = Math.min(badgesEarned * 2, 20);

  const skillScore = Math.min(
    Math.round(pointsComponent + moduleComponent + accuracyComponent + streakComponent + badgeComponent),
    1000
  );

  let currentTier = 1;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalPoints >= TIER_THRESHOLDS[i]) {
      currentTier = i + 1;
      break;
    }
  }

  const nextTierThreshold = TIER_THRESHOLDS[currentTier] || TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
  const prevTierThreshold = TIER_THRESHOLDS[currentTier - 1] || 0;

  const updatedProfile = await prisma.userLearningProfile.upsert({
    where: { userId },
    create: {
      userId,
      skillScore,
      currentTier,
      totalLessonsCompleted,
      totalModulesCompleted,
      totalQuestionsAnswered,
      totalCorrectAnswers,
    },
    update: {
      skillScore,
      currentTier,
      totalLessonsCompleted,
      totalModulesCompleted,
      totalQuestionsAnswered,
      totalCorrectAnswers,
    },
  });

  return updatedProfile;
}

// ============================================================
// DASHBOARD DATA (fully dynamic)
// ============================================================

export async function computeDashboardData(userId: string): Promise<DashboardData> {
  const [allModules, lessonProgressesRaw, quizAttempts, profile, milestones] =
    await Promise.all([
      prisma.module.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { sequenceOrder: "asc" },
        include: {
          chapters: {
            include: {
              lessons: { select: { id: true, slug: true, title: true, chapterId: true }, orderBy: { sequence: "asc" } },
            },
          },
        },
      }),
      prisma.lessonProgress.findMany({
        where: { userId },
      }),
      prisma.quizAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.userLearningProfile.findUnique({ where: { userId } }),
      getMilestones(userId),
    ]);

  // Build lesson title map
  const lessonTitleMap = new Map<string, { title: string; courseId: string; slug: string }>();
  for (const mod of allModules) {
    for (const ch of mod.chapters) {
      for (const lesson of ch.lessons) {
        lessonTitleMap.set(lesson.id, { title: lesson.title, courseId: mod.id, slug: lesson.slug });
      }
    }
  }

  const lessonProgresses = lessonProgressesRaw.map((lp) => ({
    ...lp,
    lesson: lessonTitleMap.get(lp.lessonId) || { title: "Unknown Lesson", courseId: "" },
  }));

  const totalLessons = allModules.reduce((sum, m) => sum + m.chapters.reduce((s, ch) => s + ch.lessons.length, 0), 0);
  const completedLessons = lessonProgresses.filter((lp) => lp.status === "MASTERED" || lp.status === "COMPLETED").length;
  const attemptedLessons = lessonProgresses.length;

  const averageScore =
    lessonProgresses.length > 0
      ? Math.round(lessonProgresses.reduce((sum, lp) => sum + (lp.score || 0), 0) / lessonProgresses.length)
      : 0;

  const weightedProgress = totalLessons > 0
    ? Math.round(lessonProgresses.reduce((sum, lp) => sum + (lp.completionPercentage || 0), 0) / totalLessons)
    : 0;

  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: allModules.map((m) => m.id) } },
  });
  const totalModulesCompleted = moduleProgresses.filter((mp) => mp.status === "COMPLETED").length;

  const currentTier = profile?.currentTier || 1;
  const nextTierThreshold = TIER_THRESHOLDS[currentTier] || 8000;
  const prevTierThreshold = TIER_THRESHOLDS[currentTier - 1] || 0;
  const tierProgress = profile
    ? Math.min(
        100,
        Math.round(
          ((profile.totalPoints - prevTierThreshold) / (nextTierThreshold - prevTierThreshold)) * 100
        )
      )
    : 0;

  const perfectLessons = await prisma.lessonProgress.count({
    where: { userId, score: 100 },
  });

  return {
    lessonsCompleted: completedLessons,
    attemptedLessons,
    totalLessons,
    averageScore,
    overallProgress: weightedProgress,
    totalPoints: profile?.totalPoints || 0,
    currentStreak: profile?.currentStreak || 0,
    longestStreak: profile?.longestStreak || 0,
    skillScore: profile?.skillScore || 0,
    currentTier,
    title: TIER_TITLES[currentTier] || "Jyotish Novice",
    nextTierProgress: tierProgress,
    nextTierThreshold,
    prevTierThreshold,
    pointsToNextTier: Math.max(0, nextTierThreshold - (profile?.totalPoints || 0)),
    totalModulesCompleted,
    perfectLessons,
    tierThresholds: TIER_THRESHOLDS,
    tierNames: TIER_TITLES,
    badges: {
      earned: milestones.earned.map((m) => ({
        badgeCode: m.badgeCode,
        name: m.name,
        description: m.description,
        rarity: m.rarity,
        iconUrl: m.iconUrl,
        earnedAt: m.earnedAt,
      })),
      upcoming: milestones.upcoming.map((m) => ({
        badgeCode: m.badgeCode,
        name: m.name,
        description: m.description,
        rarity: m.rarity,
        iconUrl: m.iconUrl,
        pointsReward: m.pointsReward,
        progress: m.progress,
      })),
    },
    progress: lessonProgresses.map((lp) => ({
      id: lp.id,
      lessonId: lp.lessonId,
      lessonSlug: (lp.lesson as any)?.slug || lp.lessonId,
      status: lp.status === "MASTERED" ? "MASTERED" : lp.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      score: lp.score,
      completedAt: lp.completedAt,
      lesson: lp.lesson,
    })),
  };
}

// ============================================================
// MODULES WITH DYNAMIC PROGRESS
// ============================================================

export async function getCoursesWithProgress(userId: string | undefined): Promise<CourseWithProgress[]> {
  const modules = await prisma.module.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sequenceOrder: "asc" },
    include: {
      chapters: {
        include: {
          lessons: { orderBy: { sequence: "asc" } },
        },
      },
      tier: true,
    },
  });

  if (!userId) {
    return modules.map((mod, index) => {
      const allLessons = mod.chapters.flatMap((ch) => ch.lessons);
      return {
        id: mod.id,
        title: mod.title,
        description: mod.description || `Module ${mod.number} — ${mod.tier.title}`,
        level: mod.tier.number === 1 ? "LEVEL_1" : "LEVEL_2",
        category: mod.slug.toUpperCase().replace(/-/g, "_"),
        thumbnailUrl: null,
        isPublished: mod.status === "PUBLISHED",
        sequenceOrder: mod.sequenceOrder,
        lessons: allLessons.map((l) => ({
          id: l.id,
          title: l.title,
          sequenceOrder: l.sequence,
          lessonType: l.lessonType,
        })),
        completedLessons: 0,
        totalLessons: allLessons.length,
        progressPercentage: 0,
        averageScore: 0,
        status: index === 0 ? "AVAILABLE" : "LOCKED",
        moduleNumber: mod.number,
      };
    });
  }

  const allLessonIds = modules.flatMap((m) => m.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)));
  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: allLessonIds } },
  });
  const lpMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: modules.map((m) => m.id) } },
  });
  const mpMap = new Map(moduleProgresses.map((mp) => [mp.moduleId, mp]));

  return modules.map((mod, index) => {
    const mp = mpMap.get(mod.id);
    const allLessons = mod.chapters.flatMap((ch) => ch.lessons);

    const completedCount = allLessons.filter(
      (l) => lpMap.get(l.id)?.status === "MASTERED" || lpMap.get(l.id)?.status === "COMPLETED"
    ).length;

    const scores = allLessons
      .map((l) => lpMap.get(l.id)?.score)
      .filter((s): s is number => s !== undefined && s !== null);

    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    let status = mp?.status;
    if (!status) {
      const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === mod.id);
      if (!rule || rule.unlockCondition === "free") {
        status = "AVAILABLE";
      } else {
        status = "LOCKED";
      }
    }

    return {
      id: mod.id,
      title: mod.title,
      description: mod.description || `Module ${mod.number} — ${mod.tier.title}`,
      level: mod.tier.number === 1 ? "LEVEL_1" : "LEVEL_2",
      category: mod.slug.toUpperCase().replace(/-/g, "_"),
      thumbnailUrl: null,
      isPublished: mod.status === "PUBLISHED",
      sequenceOrder: mod.sequenceOrder,
      lessons: allLessons.map((l) => ({
        id: l.id,
        title: l.title,
        sequenceOrder: l.sequence,
        lessonType: l.lessonType,
      })),
      completedLessons: completedCount,
      totalLessons: allLessons.length,
      progressPercentage: allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0,
      averageScore,
      status,
      moduleNumber: mod.number,
    };
  });
}

// ============================================================
// LESSON PROGRESS (including section views)
// ============================================================

export async function getLessonProgress(userId: string, lessonId: string): Promise<LessonProgressData | null> {
  const [lesson, lessonProgress, quizAttempts] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
    }),
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, lessonId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!lesson) return null;

  const sectionsViewed = (lessonProgress?.sectionsViewedJson as unknown as SectionsViewedJson) || [];
  const totalSections = countSections(lesson.bodyMarkdown);
  const sectionProgressPercentage = totalSections > 0
    ? Math.round((sectionsViewed.length / totalSections) * 100)
    : 0;

  return {
    lessonId,
    courseId: lesson.chapterId, // transitional
    status: lessonProgress?.status || "AVAILABLE",
    completionPercentage: lessonProgress?.completionPercentage || 0,
    score: lessonProgress?.score || 0,
    sectionProgressPercentage,
    sectionsViewed,
    totalSections,
    quizAttempts: quizAttempts.map((qa) => ({
      id: qa.id,
      score: qa.score,
      totalQuestions: qa.totalQuestions,
      correctAnswers: qa.correctAnswers,
      pointsEarned: qa.pointsEarned,
      completedAt: qa.completedAt,
    })),
    bestScore: quizAttempts.length > 0 ? Math.max(...quizAttempts.map((qa) => qa.score)) : 0,
    attemptsCount: quizAttempts.length,
  };
}

export async function trackSectionView(userId: string, lessonId: string, sectionId: number): Promise<LessonProgress> {
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });

  let sectionsViewed: number[] = [];
  if (existing?.sectionsViewedJson) {
    sectionsViewed = (existing.sectionsViewedJson as unknown as SectionsViewedJson) || [];
  }

  if (!sectionsViewed.includes(sectionId)) {
    sectionsViewed.push(sectionId);
  }

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  const totalSections = countSections(lesson?.bodyMarkdown || null);
  const sectionProgressPercentage = totalSections > 0
    ? Math.round((sectionsViewed.length / totalSections) * 100)
    : 0;

  const updated = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      moduleId: lesson?.chapterId || "",
      status: "IN_PROGRESS",
      completionPercentage: sectionProgressPercentage,
      sectionsViewedJson: sectionsViewed as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
    update: {
      status: existing?.status === "MASTERED" || existing?.status === "COMPLETED" ? existing.status : "IN_PROGRESS",
      completionPercentage: Math.max(existing?.completionPercentage || 0, sectionProgressPercentage),
      sectionsViewedJson: sectionsViewed as unknown as Prisma.InputJsonValue,
      lastAttemptedAt: new Date(),
    },
  });

  return updated;
}

// ============================================================
// MODULE PROGRESS LIST (for /gamification/modules/:userId)
// ============================================================

export async function getModuleProgressList(userId: string): Promise<ModuleProgressListItem[]> {
  const modules = await prisma.module.findMany({
    where: { status: "PUBLISHED" },
    include: {
      chapters: {
        include: {
          lessons: { orderBy: { sequence: "asc" } },
        },
      },
    },
    orderBy: { sequenceOrder: "asc" },
  });

  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: modules.map((m) => m.id) } },
  });
  const mpMap = new Map(moduleProgresses.map((mp) => [mp.moduleId, mp]));

  const allLessonIds = modules.flatMap((m) => m.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)));
  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: allLessonIds } },
  });
  const lpMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

  return modules.map((mod) => {
    const mp = mpMap.get(mod.id);
    const allLessons = mod.chapters.flatMap((ch) => ch.lessons);

    const completedCount = allLessons.filter(
      (l) => lpMap.get(l.id)?.status === "MASTERED" || lpMap.get(l.id)?.status === "COMPLETED"
    ).length;

    const scores = allLessons
      .map((l) => lpMap.get(l.id)?.score)
      .filter((s): s is number => s !== undefined && s !== null);

    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const progressPercentage = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

    let status = mp?.status;
    if (!status) {
      const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === mod.id);
      if (!rule || rule.unlockCondition === "free") status = "AVAILABLE";
      else status = "LOCKED";
    }

    return {
      moduleId: mod.id,
      title: mod.title,
      status,
      progressPercentage,
      lessonsCompleted: completedCount,
      totalLessons: allLessons.length,
      averageScore,
    };
  });
}

// ============================================================
// DYNAMIC CHAPTER PROGRESS RECALCULATION
// ============================================================

export async function recalculateChapterProgress(userId: string, chapterId: string): Promise<ChapterProgress | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      lessons: { select: { id: true } },
      module: true,
    },
  });

  if (!chapter) return null;

  const lessonIds = chapter.lessons.map((l) => l.id);

  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
  });

  const completedLessons = lessonProgresses.filter(
    (lp) => lp.status === "MASTERED" || lp.status === "COMPLETED"
  );
  const totalLessons = lessonIds.length;
  const lessonsCompletedCount = completedLessons.length;

  const averageLessonScore =
    completedLessons.length > 0
      ? Math.round(
          completedLessons.reduce((sum, lp) => sum + (lp.score || 0), 0) / completedLessons.length
        )
      : 0;

  const progressPercentage = totalLessons > 0
    ? Math.round((lessonsCompletedCount / totalLessons) * 100)
    : 0;

  // Chapter is mastered when all lessons are mastered AND chapter-check quiz is passed (≥80%)
  const allLessonsMastered = lessonsCompletedCount === totalLessons && totalLessons > 0;
  const chapterCheckPassed = await checkChapterCheckPassed(userId, chapterId);

  let status: ProgressStatus;
  if (allLessonsMastered && chapterCheckPassed) {
    status = "MASTERED";
  } else if (lessonsCompletedCount > 0) {
    status = "IN_PROGRESS";
  } else {
    status = "AVAILABLE";
  }

  const shouldSetCompletedAt = allLessonsMastered && !chapterCheckPassed ? false : status === "MASTERED";

  const existing = await prisma.chapterProgress.findUnique({
    where: { userId_chapterId: { userId, chapterId } },
  });

  const chapterProgress = await prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    create: {
      userId,
      chapterId,
      status,
      averageLessonScore,
      chapterCheckScore: chapterCheckPassed ? 100 : 0,
      progressPercentage,
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
    update: {
      status,
      averageLessonScore,
      chapterCheckScore: chapterCheckPassed ? 100 : 0,
      progressPercentage,
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt && !existing?.completedAt ? new Date() : existing?.completedAt,
    },
  });

  // Also recalculate parent module progress
  await recalculateModuleProgress(userId, chapter.module.id);

  return chapterProgress;
}

async function checkChapterCheckPassed(userId: string, chapterId: string): Promise<boolean> {
  // Check if user has a passing quiz attempt for the chapter-check synthetic lesson
  const syntheticLessonId = `chapter-${chapterId}`;
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, lessonId: syntheticLessonId },
    orderBy: { createdAt: "desc" },
  });

  if (attempts.length === 0) return false;

  // Chapter check is passed if best score ≥ 80%
  const bestScore = Math.max(...attempts.map((a) => a.score));
  return bestScore >= 80;
}
