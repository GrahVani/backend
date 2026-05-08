/**
 * Progress Service
 * All progress calculations are DYNAMIC — computed from actual learner activity.
 * No static counters. Everything derives from LessonProgress, QuizAttempt, ModuleProgress, etc.
 */

import { prisma } from "../config/database";
import { getMilestones } from "./milestone.service";
import { MODULE_UNLOCK_RULES, TIER_THRESHOLDS, TIER_TITLES } from "../config/game.constants";

// Map course.sequenceOrder (1-10) to module IDs for unlock rules
function getModuleIdFromCourse(course: { id: string; sequenceOrder?: number | null }): string {
  if (course.sequenceOrder) return `M${course.sequenceOrder}`;
  // Fallback: try to extract from id or title
  const match = course.id.match(/M?(\d+)/i);
  if (match) return `M${match[1]}`;
  return course.id;
}

// ============================================================
// DYNAMIC MODULE PROGRESS RECALCULATION
// ============================================================

export async function recalculateModuleProgress(userId: string, moduleId: string) {
  // Find the course
  const course = await prisma.course.findFirst({
    where: {
      OR: [
        { id: moduleId },
        { sequenceOrder: parseInt(moduleId.replace("M", "")) || undefined },
      ],
    },
    include: { lessons: true },
  });

  if (!course) return null;

  const lessonIds = course.lessons.map((l) => l.id);

  // Dynamically compute from actual LessonProgress rows
  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
  });

  const completedLessons = lessonProgresses.filter((lp) => lp.status === "completed");
  const totalLessons = course.lessons.length;
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

  // Determine status dynamically
  let status: string;
  if (lessonsCompletedCount === totalLessons && totalLessons > 0) {
    status = "completed";
  } else if (lessonsCompletedCount > 0) {
    status = "in_progress";
  } else {
    status = "available";
  }

  // Check unlock rules (prerequisites)
  const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === moduleId);
  // Unlock rules only affect access status, not completion status
  if (status !== "completed" && rule && rule.unlockCondition !== "free") {
    const prereqModuleId = rule.prerequisiteModuleId;
    if (prereqModuleId) {
      const prereqProgress = await prisma.moduleProgress.findUnique({
        where: { userId_moduleId: { userId, moduleId: prereqModuleId } },
      });
      const isPrereqMet =
        prereqProgress?.status === "completed" &&
        (prereqProgress.averageLessonScore || 0) >= rule.minimumScore;

      if (!isPrereqMet) {
        status = "locked";
      }
    }
  }

  // Fetch existing progress to preserve original completedAt
  const existing = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });

  const shouldSetCompletedAt = status === "completed" && !existing?.completedAt;

  // Upsert ModuleProgress with dynamically computed values
  const moduleProgress = await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: {
      userId,
      moduleId,
      status,
      averageLessonScore,
      progressPercentage,
      prerequisiteModuleId: rule?.prerequisiteModuleId || null,
      prerequisiteMet: status !== "locked",
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
    update: {
      status,
      averageLessonScore,
      progressPercentage,
      prerequisiteMet: status !== "locked",
      pointsEarned: lessonProgresses.reduce((sum, lp) => sum + (lp.pointsEarned || 0), 0),
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
  });

  return moduleProgress;
}

// ============================================================
// DYNAMIC USER LEARNING PROFILE RECALCULATION
// ============================================================

export async function recalculateUserLearningProfile(userId: string) {
  // totalLessonsCompleted — dynamically count from LessonProgress
  const totalLessonsCompleted = await prisma.lessonProgress.count({
    where: { userId, status: "completed" },
  });

  // totalModulesCompleted — dynamically count from ModuleProgress
  const totalModulesCompleted = await prisma.moduleProgress.count({
    where: { userId, status: "completed" },
  });

  // totalQuestionsAnswered & totalCorrectAnswers — dynamically sum from QuizAttempt
  const quizAgg = await prisma.quizAttempt.aggregate({
    where: { userId },
    _sum: { totalQuestions: true, correctAnswers: true },
  });

  const totalQuestionsAnswered = quizAgg._sum.totalQuestions || 0;
  const totalCorrectAnswers = quizAgg._sum.correctAnswers || 0;

  // skillScore — recalculate using the existing formula
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

  // Determine tier based on totalPoints
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

export async function computeDashboardData(userId: string) {
  const [allCourses, lessonProgressesRaw, quizAttempts, profile, milestones] =
    await Promise.all([
      prisma.course.findMany({
        where: { isPublished: true },
        orderBy: { sequenceOrder: "asc" },
        include: {
          lessons: { select: { id: true, title: true, courseId: true }, orderBy: { sequenceOrder: "asc" } },
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

  // Build a lesson title map from courses for the progress response
  const lessonTitleMap = new Map<string, { title: string; courseId: string }>();
  for (const course of allCourses) {
    for (const lesson of course.lessons) {
      lessonTitleMap.set(lesson.id, { title: lesson.title, courseId: course.id });
    }
  }

  const lessonProgresses = lessonProgressesRaw.map((lp) => ({
    ...lp,
    lesson: lessonTitleMap.get(lp.lessonId) || { title: "Unknown Lesson", courseId: "" },
  }));

  const totalLessons = allCourses.reduce((sum, c) => sum + c.lessons.length, 0);
  const completedLessons = lessonProgresses.filter((lp) => lp.status === "completed").length;
  const attemptedLessons = lessonProgresses.length;

  const averageScore =
    lessonProgresses.length > 0
      ? Math.round(lessonProgresses.reduce((sum, lp) => sum + (lp.score || 0), 0) / lessonProgresses.length)
      : 0;

  // Weighted overall progress: counts in-progress lessons by their score%
  const weightedProgress = totalLessons > 0
    ? Math.round(lessonProgresses.reduce((sum, lp) => sum + (lp.completionPercentage || 0), 0) / totalLessons)
    : 0;

  // Module progress — batch fetch to avoid N+1
  const moduleIds = allCourses.map((c) => getModuleIdFromCourse(c));
  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: moduleIds } },
  });
  const mpMap = new Map(moduleProgresses.map((mp) => [mp.moduleId, mp]));
  const moduleProgressList = moduleIds.map((id) => mpMap.get(id));

  const totalModulesCompleted = moduleProgressList.filter((mp) => mp?.status === "completed").length;

  // Tier progress
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

  // Extra aggregates for richer frontend
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
      status: lp.status === "completed" ? "COMPLETED" : "IN_PROGRESS",
      score: lp.score,
      completedAt: lp.completedAt,
      lesson: lp.lesson,
    })),
  };
}

// ============================================================
// COURSES WITH DYNAMIC PROGRESS
// ============================================================

export async function getCoursesWithProgress(userId: string | undefined) {
  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    orderBy: { sequenceOrder: "asc" },
    include: {
      lessons: { orderBy: { sequenceOrder: "asc" } },
    },
  });

  if (!userId) {
    return courses.map((course, index) => ({
      ...course,
      completedLessons: 0,
      totalLessons: course.lessons.length,
      progressPercentage: 0,
      averageScore: 0,
      status: index === 0 ? "available" : "locked",
      moduleNumber: index + 1,
    }));
  }

  // Batch fetch all lesson progresses for this user
  const allLessonIds = courses.flatMap((c) => c.lessons.map((l) => l.id));
  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: allLessonIds } },
  });
  const lpMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

  // Batch fetch all module progresses
  const moduleIds = courses.map((c) => getModuleIdFromCourse(c));
  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: moduleIds } },
  });
  const mpMap = new Map(moduleProgresses.map((mp) => [mp.moduleId, mp]));

  return courses.map((course, index) => {
    const moduleId = getModuleIdFromCourse(course);
    const mp = mpMap.get(moduleId);

    const completedCount = course.lessons.filter(
      (l) => lpMap.get(l.id)?.status === "completed"
    ).length;

    const scores = course.lessons
      .map((l) => lpMap.get(l.id)?.score)
      .filter((s): s is number => s !== undefined && s !== null);

    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    let status = mp?.status;
    if (!status) {
      // Dynamically compute status if no ModuleProgress row exists
      const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === moduleId);
      if (!rule || rule.unlockCondition === "free") {
        status = "available";
      } else {
        status = "locked";
      }
    }

    return {
      ...course,
      completedLessons: completedCount,
      totalLessons: course.lessons.length,
      progressPercentage: course.lessons.length > 0 ? Math.round((completedCount / course.lessons.length) * 100) : 0,
      averageScore,
      status,
      moduleNumber: index + 1,
    };
  });
}

// ============================================================
// LESSON PROGRESS (including section views)
// ============================================================

export async function getLessonProgress(userId: string, lessonId: string) {
  const [lesson, lessonProgress, quizAttempts] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
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

  const sectionsViewed = ((lessonProgress as any)?.sectionsViewedJson as number[]) || [];
  const totalSections = (lesson.contentJson as any)?.sections?.length || 0;
  const sectionProgressPercentage = totalSections > 0
    ? Math.round((sectionsViewed.length / totalSections) * 100)
    : 0;

  return {
    lessonId,
    courseId: lesson.courseId,
    status: lessonProgress?.status || "available",
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

export async function trackSectionView(userId: string, lessonId: string, sectionId: number) {
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });

  let sectionsViewed: number[] = [];
  if (existing?.sectionsViewedJson) {
    sectionsViewed = (existing.sectionsViewedJson as number[]) || [];
  }

  if (!sectionsViewed.includes(sectionId)) {
    sectionsViewed.push(sectionId);
  }

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  const totalSections = (lesson?.contentJson as any)?.sections?.length || 0;
  const sectionProgressPercentage = totalSections > 0
    ? Math.round((sectionsViewed.length / totalSections) * 100)
    : 0;

  const updated = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      moduleId: lesson?.courseId || "",
      status: "in_progress",
      completionPercentage: sectionProgressPercentage,
      sectionsViewedJson: sectionsViewed as any,
      startedAt: new Date(),
    },
    update: {
      status: existing?.status === "completed" ? "completed" : "in_progress",
      completionPercentage: Math.max(existing?.completionPercentage || 0, sectionProgressPercentage),
      sectionsViewedJson: sectionsViewed as any,
      lastAttemptedAt: new Date(),
    },
  });

  return updated;
}

// ============================================================
// MODULE PROGRESS LIST (for /gamification/modules/:userId)
// ============================================================

export async function getModuleProgressList(userId: string) {
  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    include: { lessons: { orderBy: { sequenceOrder: "asc" } } },
    orderBy: { sequenceOrder: "asc" },
  });

  const moduleIds = courses.map((c) => getModuleIdFromCourse(c));
  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: moduleIds } },
  });
  const mpMap = new Map(moduleProgresses.map((mp) => [mp.moduleId, mp]));

  const allLessonIds = courses.flatMap((c) => c.lessons.map((l) => l.id));
  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: allLessonIds } },
  });
  const lpMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

  return courses.map((course) => {
    const moduleId = getModuleIdFromCourse(course);
    const mp = mpMap.get(moduleId);

    const completedCount = course.lessons.filter(
      (l) => lpMap.get(l.id)?.status === "completed"
    ).length;

    const scores = course.lessons
      .map((l) => lpMap.get(l.id)?.score)
      .filter((s): s is number => s !== undefined && s !== null);

    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const progressPercentage = course.lessons.length > 0 ? Math.round((completedCount / course.lessons.length) * 100) : 0;

    let status = mp?.status;
    if (!status) {
      const rule = MODULE_UNLOCK_RULES.find((r) => r.moduleId === moduleId);
      if (!rule || rule.unlockCondition === "free") status = "available";
      else status = "locked";
    }

    return {
      moduleId,
      title: course.title,
      status,
      progressPercentage,
      lessonsCompleted: completedCount,
      totalLessons: course.lessons.length,
      averageScore,
    };
  });
}
