/**
 * Gamification Service
 * Handles points calculation, streak tracking, badge evaluation, and leaderboard management
 */

import { PrismaClient } from "@prisma/client";
import { recalculateModuleProgress, recalculateUserLearningProfile } from "./progress.service";
import { MODULE_UNLOCK_RULES, TIER_THRESHOLDS } from "../config/game.constants";
// Date utilities (native implementation to avoid extra dependency)
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const prisma = new PrismaClient();

// ============================================================
// TYPES
// ============================================================

interface AnswerSubmission {
  questionId: string;
  selectedOptionIndex: number;
  timeSpentSeconds: number;
  isCorrect: boolean;
}

interface PointsBreakdown {
  basePoints: number;
  firstTryBonus: number;
  speedBonus: number;
  streakBonus: number;
  total: number;
}

interface QuizSubmissionResult {
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  pointsEarned: number;
  breakdown: PointsBreakdown;
  newStreak: number;
  streakContinued: boolean;
  newBadges: BadgeAward[];
}

interface BadgeAward {
  badgeCode: string;
  name: string;
  description: string;
  rarity: string;
  pointsReward: number;
}

// ============================================================
// POINTS CALCULATOR
// ============================================================

export function calculateQuestionPoints(
  isCorrect: boolean,
  timeSpentSeconds: number,
  currentStreak: number,
  isFirstTry: boolean
): PointsBreakdown {
  if (!isCorrect) {
    return { basePoints: 0, firstTryBonus: 0, speedBonus: 0, streakBonus: 0, total: 0 };
  }

  let basePoints = 10;
  let firstTryBonus = isFirstTry ? 3 : 0;
  let speedBonus = 0;
  let streakBonus = 0;

  if (timeSpentSeconds < 30) {
    speedBonus = 5;
  } else if (timeSpentSeconds < 60) {
    speedBonus = 2;
  }

  if (currentStreak >= 10) {
    streakBonus = 20;
  } else if (currentStreak >= 5) {
    streakBonus = 10;
  } else if (currentStreak >= 3) {
    streakBonus = 5;
  }

  return {
    basePoints,
    firstTryBonus,
    speedBonus,
    streakBonus,
    total: basePoints + firstTryBonus + speedBonus + streakBonus,
  };
}

export function calculateLessonCompletionBonus(
  score: number,
  isFirstCompletion: boolean,
  attemptsCount: number
): number {
  let bonus = 0;
  if (score >= 70) bonus += 50;
  if (score >= 90) bonus += 50;
  if (score === 100) bonus += 50;
  if (isFirstCompletion) bonus += 20;
  if (attemptsCount <= 2 && score >= 80) bonus += 25;
  return bonus;
}

// ============================================================
// STREAK SERVICE
// ============================================================

export async function updateStreak(userId: string): Promise<{
  newStreak: number;
  longestStreak: number;
  streakContinued: boolean;
  streakBroken: boolean;
}> {
  const today = new Date();
  const yesterday = subDays(today, 1);

  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    // Create profile if missing
    await prisma.userLearningProfile.create({
      data: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
      },
    });
    return { newStreak: 1, longestStreak: 1, streakContinued: false, streakBroken: false };
  }

  const lastActivity = profile.lastActivityDate;
  let newStreak = profile.currentStreak;
  let streakContinued = false;
  let streakBroken = false;

  if (lastActivity && isSameDay(lastActivity, yesterday)) {
    newStreak += 1;
    streakContinued = true;
  } else if (lastActivity && isSameDay(lastActivity, today)) {
    streakContinued = true;
  } else {
    streakBroken = newStreak > 0;
    newStreak = 1;
  }

  const longestStreak = Math.max(profile.longestStreak, newStreak);

  await prisma.userLearningProfile.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      longestStreak,
      lastActivityDate: today,
    },
  });

  return { newStreak, longestStreak, streakContinued, streakBroken };
}

export async function isStreakAtRisk(userId: string): Promise<boolean> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
  });

  if (!profile || !profile.lastActivityDate) return false;

  const today = new Date();
  const yesterday = subDays(today, 1);
  const lastActivity = profile.lastActivityDate;

  if (isSameDay(lastActivity, yesterday) && profile.currentStreak > 0) {
    const hour = today.getHours();
    return hour >= 20; // 8 PM
  }

  return false;
}

// ============================================================
// BADGE EVALUATION
// ============================================================

export async function evaluateBadges(
  userId: string,
  triggerEvent: { type: string; metadata?: Record<string, any> }
): Promise<BadgeAward[]> {
  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
  });

  const earnedBadgeIds = new Set(userBadges.map((ub: any) => ub.badgeId));

  const availableBadges = await prisma.badgeDefinition.findMany({
    where: { id: { notIn: Array.from(earnedBadgeIds) } },
  });

  const newBadges: BadgeAward[] = [];

  for (const badge of availableBadges) {
    const conditions = badge.unlockConditions as any;
    const met = await checkBadgeCondition(userId, conditions, triggerEvent);

    if (met) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId: badge.id,
        },
      });

      // Award points for badge
      await addPoints(userId, badge.pointsReward, "badge_earned", {
        referenceId: badge.id,
        referenceType: "badge",
        description: `Earned badge: ${badge.name}`,
      });

      newBadges.push({
        badgeCode: badge.badgeCode,
        name: badge.name,
        description: badge.description,
        rarity: badge.rarity || "common",
        pointsReward: badge.pointsReward,
      });
    }
  }

  return newBadges;
}

async function checkBadgeCondition(
  userId: string,
  conditions: any,
  triggerEvent: { type: string; metadata?: Record<string, any> }
): Promise<boolean> {
  switch (conditions.type) {
    case "lesson_complete": {
      const count = await prisma.lessonProgress.count({
        where: { userId, status: "completed" },
      });
      return count >= conditions.count;
    }

    case "streak": {
      const profile = await prisma.userLearningProfile.findUnique({ where: { userId } });
      return (profile?.currentStreak || 0) >= conditions.length;
    }

    case "perfect_lesson": {
      const perfectLessons = await prisma.lessonProgress.count({
        where: { userId, score: 100 },
      });
      return perfectLessons >= conditions.count;
    }

    case "module_score": {
      if (conditions.moduleId) {
        const progress = await prisma.moduleProgress.findFirst({
      where: { userId, moduleId: conditions.moduleId },
    });
        return (progress?.averageLessonScore || 0) >= conditions.minScore;
      }
      // Any module
      const modules = await prisma.moduleProgress.findMany({
        where: { userId, status: "completed" },
      });
      return modules.some((m: any) => (m.averageLessonScore || 0) >= conditions.minScore);
    }

    case "all_modules": {
      const allModules = await prisma.moduleProgress.findMany({ where: { userId } });
      const totalModules: number = await prisma.course.count();
      if (allModules.length < totalModules) return false;
      return allModules.every((m: any) =>
        m.status === "completed" && (m.averageLessonScore || 0) >= conditions.minScore
      );
    }

    case "concept_mastery": {
      // Check quiz attempts for specific concept tags
      const attempts = await prisma.quizAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      let correctCount = 0;
      let totalCount = 0;

      for (const attempt of attempts) {
        const answers = attempt.answersJson as any[];
        for (const ans of answers) {
          // This is simplified — in production, you'd query questions by concept tag
          if (ans.conceptTags?.includes(conditions.concept)) {
            totalCount++;
            if (ans.isCorrect) correctCount++;
          }
        }
      }

      if (conditions.accuracy) {
        return totalCount > 0 && (correctCount / totalCount) * 100 >= conditions.accuracy;
      }
      return correctCount >= conditions.count;
    }

    default:
      return false;
  }
}

// ============================================================
// POINTS MANAGEMENT
// ============================================================

export async function addPoints(
  userId: string,
  amount: number,
  transactionType: string,
  meta: {
    referenceId?: string;
    referenceType?: string;
    description?: string;
  } = {}
): Promise<number> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
  });

  const currentBalance = profile?.totalPoints || 0;
  const newBalance = currentBalance + amount;

  await prisma.$transaction([
    prisma.pointsTransaction.create({
      data: {
        userId,
        amount,
        transactionType,
        referenceId: meta.referenceId,
        referenceType: meta.referenceType,
        balanceAfter: newBalance,
        description: meta.description,
      },
    }),
    prisma.userLearningProfile.update({
      where: { userId },
      data: {
        totalPoints: newBalance,
        updatedAt: new Date(),
      },
    }),
  ]);

  // Keep tier, skillScore, and all derived fields in sync after every point change
  await recalculateUserLearningProfile(userId);

  return newBalance;
}

// ============================================================
// LEADERBOARD
// ============================================================

export async function computeLeaderboard(
  periodType: "all_time" | "weekly" | "monthly"
): Promise<Array<{ userId: string; displayName: string; points: number; rank: number }>> {
  let startDate: Date;
  const now = new Date();

  switch (periodType) {
    case "weekly":
      startDate = subDays(now, 7);
      break;
    case "monthly":
      startDate = subDays(now, 30);
      break;
    default:
      startDate = new Date(0); // All time
  }

  const results = await prisma.pointsTransaction.groupBy({
    by: ["userId"],
    where: {
      createdAt: { gte: startDate },
      amount: { gt: 0 },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 100,
  });

  // Get user names
  const userIds = results.map((r: any) => r.userId);
  const users = await prisma.$queryRawUnsafe(
      `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
      userIds
    ) as any[];

  const userMap = new Map(users.map((u: any) => [u.id, u.name || "Anonymous"]));

  return results.map((r: any, index: number) => ({
    userId: r.userId,
    displayName: userMap.get(r.userId) || "Anonymous",
    points: r._sum.amount || 0,
    rank: index + 1,
  }));
}

// ============================================================
// SKILL SCORE
// ============================================================

export function calculateSkillScore(
  totalPoints: number,
  modulesCompleted: number,
  averageAccuracy: number,
  streakLength: number,
  badgesEarned: number
): number {
  const pointsComponent = Math.min(totalPoints / 10, 400);
  const moduleComponent = modulesCompleted * 40;
  const accuracyComponent = averageAccuracy * 1.5;
  const streakComponent = Math.min(streakLength * 2, 30);
  const badgeComponent = Math.min(badgesEarned * 2, 20);

  return Math.min(
    pointsComponent + moduleComponent + accuracyComponent + streakComponent + badgeComponent,
    1000
  );
}

export async function recalculateSkillScore(userId: string): Promise<number> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
  });

  if (!profile) return 0;

  const modulesCompleted = await prisma.moduleProgress.count({
    where: { userId, status: "completed" },
  });

  const quizAttempts = await prisma.quizAttempt.findMany({
    where: { userId },
  });

  const totalQuestions = quizAttempts.reduce((sum: number, a: any) => sum + a.totalQuestions, 0);
  const totalCorrect = quizAttempts.reduce((sum: number, a: any) => sum + a.correctAnswers, 0);
  const averageAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

  const badgesEarned = await prisma.userBadge.count({
    where: { userId },
  });

  const newScore = calculateSkillScore(
    profile.totalPoints,
    modulesCompleted,
    averageAccuracy,
    profile.currentStreak,
    badgesEarned
  );

  await prisma.userLearningProfile.update({
    where: { userId },
    data: { skillScore: newScore },
  });

  return newScore;
}

// ============================================================
// MODULE UNLOCKING
// ============================================================



export async function checkAndUnlockModules(userId: string): Promise<
  Array<{ moduleId: string; unlocked: boolean; reason: string }>
> {
  const userProgress = await prisma.moduleProgress.findMany({
    where: { userId },
  });

  const results: Array<{ moduleId: string; unlocked: boolean; reason: string }> = [];

  for (const rule of MODULE_UNLOCK_RULES) {
    if (rule.unlockCondition === "free") continue;

    const moduleProgress = userProgress.find((p: any) => p.moduleId === rule.moduleId);
    if (moduleProgress?.status === "locked") {
      const prereqProgress = userProgress.find(
        (p: any) => p.moduleId === rule.prerequisiteModuleId
      );

      if (
        prereqProgress?.status === "completed" &&
        (prereqProgress.averageLessonScore || 0) >= rule.minimumScore
      ) {
        await prisma.moduleProgress.update({
          where: { id: moduleProgress.id },
          data: {
            status: "available",
            prerequisiteMet: true,
          },
        });

        results.push({
          moduleId: rule.moduleId,
          unlocked: true,
          reason: `Completed ${rule.prerequisiteModuleId} with ${prereqProgress.averageLessonScore}%`,
        });
      }
    }
  }

  return results;
}

// ============================================================
// QUIZ SUBMISSION
// ============================================================

export async function processQuizSubmission(
  userId: string,
  lessonId: string,
  moduleId: string,
  answers: AnswerSubmission[]
): Promise<QuizSubmissionResult> {
  const correctAnswers = answers.filter(a => a.isCorrect).length;
  const totalQuestions = answers.length;
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  // Update streak
  const streakResult = await updateStreak(userId);

  // Check if lesson was already completed — prevents XP farming
  const existingLessonProgress = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  const wasAlreadyCompleted = existingLessonProgress?.status === "completed";

  let totalPoints = 0;
  const breakdown: PointsBreakdown = {
    basePoints: 0,
    firstTryBonus: 0,
    speedBonus: 0,
    streakBonus: 0,
    total: 0,
  };

  if (!wasAlreadyCompleted) {
    // Determine first-try status and prior attempts for bonuses
    const priorAttempts = await prisma.quizAttempt.count({ where: { userId, lessonId } });
    const isFirstTry = priorAttempts === 0;
    const isFirstCompletion = !existingLessonProgress || existingLessonProgress.status !== "completed";

    // Calculate points
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const runningStreak = answers.slice(0, i).reduce((streak, a, idx) => {
        if (idx === 0) return a.isCorrect ? 1 : 0;
        return a.isCorrect ? streak + 1 : 0;
      }, 0);

      const pts = calculateQuestionPoints(
        answer.isCorrect,
        answer.timeSpentSeconds,
        runningStreak,
        isFirstTry
      );

      totalPoints += pts.total;
      breakdown.basePoints += pts.basePoints;
      breakdown.firstTryBonus += pts.firstTryBonus;
      breakdown.speedBonus += pts.speedBonus;
      breakdown.streakBonus += pts.streakBonus;
    }

    breakdown.total = totalPoints;

    // Add completion bonus (only on first completion)
    const lessonBonus = calculateLessonCompletionBonus(score, isFirstCompletion, priorAttempts + 1);
    totalPoints += lessonBonus;

    // Record points
    await addPoints(userId, totalPoints, "lesson_completion", {
      referenceType: "lesson",
      description: `Completed lesson ${lessonId} with ${score}%`,
    });
  }

  // Save quiz attempt
  await prisma.quizAttempt.create({
    data: {
      userId,
      lessonId,
      moduleId,
      score,
      totalQuestions,
      correctAnswers,
      answersJson: answers as any,
      startedAt: new Date(),
      completedAt: new Date(),
      pointsEarned: totalPoints,
    },
  });

  // Update lesson progress
  const shouldSetCompletedAt = score >= 70 && !existingLessonProgress?.completedAt;
  await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      moduleId,
      status: score >= 70 ? "completed" : "in_progress",
      completionPercentage: score,
      score,
      questionsAttempted: totalQuestions,
      questionsCorrect: correctAnswers,
      pointsEarned: totalPoints,
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
    update: {
      status: score >= 70 ? "completed" : "in_progress",
      completionPercentage: Math.max(existingLessonProgress?.completionPercentage || 0, score),
      score: Math.max(existingLessonProgress?.score || 0, score),
      questionsAttempted: { increment: totalQuestions },
      questionsCorrect: { increment: correctAnswers },
      pointsEarned: { increment: totalPoints },
      completedAt: shouldSetCompletedAt ? new Date() : undefined,
    },
  });

  // Check badges
  const newBadges = await evaluateBadges(userId, {
    type: "lesson_complete",
    metadata: { lessonId, score },
  });

  // Recalculate skill score
  await recalculateSkillScore(userId);

  // Dynamically recalculate module progress based on actual lesson completions
  await recalculateModuleProgress(userId, moduleId);

  // Dynamically recalculate user profile totals from actual data
  await recalculateUserLearningProfile(userId);

  return {
    score,
    correctAnswers,
    totalQuestions,
    pointsEarned: totalPoints,
    breakdown,
    newStreak: streakResult.newStreak,
    streakContinued: streakResult.streakContinued,
    newBadges,
  };
}
