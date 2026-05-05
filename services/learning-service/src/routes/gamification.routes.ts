/**
 * Gamification API Routes
 * Exposes points, streaks, badges, leaderboard, and quiz submission endpoints
 */

import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../interfaces/http/middlewares/auth.middleware";
import {
  processQuizSubmission,
  updateStreak,
  evaluateBadges,
  computeLeaderboard,
  recalculateSkillScore,
  checkAndUnlockModules,
  addPoints,
} from "../services/gamification.service";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ============================================================
// QUIZ SUBMISSION
// ============================================================

router.post("/lessons/:lessonId/submit", async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { userId, answers } = req.body;

    if (!userId || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: "userId and answers array required" });
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });

    if (!lesson) {
      return res.status(404).json({ success: false, error: "Lesson not found" });
    }

    const result = await processQuizSubmission(userId, lessonId, lesson.courseId, answers);
    const unlockedModules = await checkAndUnlockModules(userId);

    res.json({
      success: true,
      data: {
        ...result,
        unlockedModules: unlockedModules.filter(m => m.unlocked),
      },
    });
  } catch (error) {
    console.error("Quiz submission error:", error);
    res.status(500).json({ success: false, error: "Failed to process quiz submission" });
  }
});

// ============================================================
// USER PROFILE
// ============================================================

router.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await prisma.userLearningProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return res.json({
        success: true,
        data: {
          skillScore: 0,
          currentTier: 1,
          currentLevel: "LEVEL_1",
          currentStreak: 0,
          longestStreak: 0,
          totalPoints: 0,
          totalLessonsCompleted: 0,
          totalModulesCompleted: 0,
          title: "Jyotish Novice",
        },
      });
    }

    const tierThresholds = [0, 500, 1500, 3000, 5000, 8000];
    const nextTierThreshold = tierThresholds[profile.currentTier] || 8000;
    const prevTierThreshold = tierThresholds[profile.currentTier - 1] || 0;
    const tierProgress = Math.min(
      100,
      Math.round(((profile.totalPoints - prevTierThreshold) / (nextTierThreshold - prevTierThreshold)) * 100)
    );

    const titles: Record<number, string> = {
      1: "Jyotish Novice",
      2: "Vedanga Seeker",
      3: "Graha Scholar",
      4: "Nakshatra Adept",
      5: "Yoga Master",
      6: "Jyotish Acharya",
    };

    res.json({
      success: true,
      data: {
        skillScore: profile.skillScore,
        currentTier: profile.currentTier,
        currentLevel: profile.currentLevel,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        totalPoints: profile.totalPoints,
        totalLessonsCompleted: profile.totalLessonsCompleted,
        totalModulesCompleted: profile.totalModulesCompleted,
        title: titles[profile.currentTier] || "Jyotish Novice",
        nextTierProgress: tierProgress,
        weakAreas: [],
        strongAreas: [],
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
});

// ============================================================
// LEADERBOARD
// ============================================================

router.get("/leaderboard", async (req, res) => {
  try {
    const period = (req.query.period as "all_time" | "weekly" | "monthly") || "weekly";
    const moduleId = req.query.moduleId as string | undefined;

    let leaderboard;

    if (moduleId) {
      leaderboard = await prisma.quizAttempt.groupBy({
        by: ["userId"],
        where: { moduleId },
        _avg: { score: true },
        _sum: { pointsEarned: true },
        orderBy: { _avg: { score: "desc" } },
        take: 50,
      });

      const userIds = leaderboard.map((r: any) => r.userId);
      const users = await prisma.$queryRawUnsafe(
      `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
      userIds
    ) as any[];

      const userMap = new Map(users.map((u: any) => [u.id, u.name || "Anonymous"]));

      leaderboard = leaderboard.map((r: any, index: number) => ({
        rank: index + 1,
        userId: r.userId,
        displayName: userMap.get(r.userId) || "Anonymous",
        score: Math.round(r._avg.score || 0),
        points: r._sum.pointsEarned || 0,
      }));
    } else {
      leaderboard = await computeLeaderboard(period);
    }

    const userId = req.query.userId as string;
    let myRank = null;
    if (userId) {
      myRank = leaderboard.findIndex((r: any) => r.userId === userId) + 1;
      if (myRank === 0) myRank = null;
    }

    res.json({
      success: true,
      data: {
        period,
        myRank,
        totalParticipants: leaderboard.length,
        topUsers: leaderboard.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch leaderboard" });
  }
});

// ============================================================
// BADGES
// ============================================================

router.get("/badges/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [earnedBadges, allDefinitions] = await Promise.all([
      prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
      }),
      prisma.badgeDefinition.findMany(),
    ]);

    const earnedCodes = new Set(earnedBadges.map((eb: any) => eb.badge.badgeCode));

    res.json({
      success: true,
      data: {
        earned: earnedBadges.map((eb: any) => ({
          badgeCode: eb.badge.badgeCode,
          name: eb.badge.name,
          description: eb.badge.description,
          rarity: eb.badge.rarity,
          iconUrl: eb.badge.iconUrl,
          earnedAt: eb.earnedAt,
        })),
        available: allDefinitions
          .filter((d: any) => !earnedCodes.has(d.badgeCode))
          .map((d: any) => ({
            badgeCode: d.badgeCode,
            name: d.name,
            description: d.description,
            rarity: d.rarity,
            iconUrl: d.iconUrl,
            pointsReward: d.pointsReward,
          })),
      },
    });
  } catch (error) {
    console.error("Badges error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch badges" });
  }
});

// ============================================================
// STREAK
// ============================================================

router.get("/streak/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await prisma.userLearningProfile.findUnique({
      where: { userId },
    });

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const todayActivity = await prisma.dailyActivity.findUnique({
      where: {
        userId_activityDate: {
          userId,
          activityDate: new Date(todayStr),
        },
      },
    });

    res.json({
      success: true,
      data: {
        currentStreak: profile?.currentStreak || 0,
        longestStreak: profile?.longestStreak || 0,
        lastActivityDate: profile?.lastActivityDate,
        todayActivity: {
          hadLogin: todayActivity?.hadLogin || false,
          hadLessonActivity: todayActivity?.hadLessonActivity || false,
          hadPanchangaCheck: todayActivity?.hadPanchangaCheck || false,
          pointsEarnedToday: todayActivity?.pointsEarnedToday || 0,
        },
      },
    });
  } catch (error) {
    console.error("Streak error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch streak" });
  }
});

router.post("/daily/login/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const streakResult = await updateStreak(userId);

    await prisma.dailyActivity.upsert({
      where: {
        userId_activityDate: {
          userId,
          activityDate: new Date(todayStr),
        },
      },
      create: {
        userId,
        activityDate: new Date(todayStr),
        hadLogin: true,
        pointsEarnedToday: 10,
      },
      update: {
        hadLogin: true,
        pointsEarnedToday: { increment: 10 },
      },
    });

    await addPoints(userId, 10, "daily_login", {
      description: "Daily login bonus",
    });

    res.json({
      success: true,
      data: {
        pointsEarned: 10,
        streakUpdated: true,
        newStreak: streakResult.newStreak,
        streakContinued: streakResult.streakContinued,
      },
    });
  } catch (error) {
    console.error("Daily login error:", error);
    res.status(500).json({ success: false, error: "Failed to process daily login" });
  }
});

// ============================================================
// POINTS HISTORY
// ============================================================

router.get("/points/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total, profile] = await Promise.all([
      prisma.pointsTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.pointsTransaction.count({ where: { userId } }),
      prisma.userLearningProfile.findUnique({
        where: { userId },
        select: { totalPoints: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        balance: profile?.totalPoints || 0,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Points history error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch points history" });
  }
});

// ============================================================
// MODULE PROGRESS
// ============================================================

router.get("/modules/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [courses, moduleProgress] = await Promise.all([
      prisma.course.findMany({
        include: { lessons: { orderBy: { sequenceOrder: "asc" } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.moduleProgress.findMany({
        where: { userId },
      }),
    ]);

    const progressMap = new Map(moduleProgress.map((p: any) => [p.moduleId, p]));

    const modules = courses.map((course: any, index: number) => {
      const progress = progressMap.get(course.id) as any;
      const lessonsCompleted = progress
        ? Math.round((progress.averageLessonScore / 100) * course.lessons.length)
        : 0;

      return {
        moduleId: course.id,
        title: course.title,
        status: (progress as any)?.status || (index === 0 ? "available" : "locked"),
        progressPercentage: (progress as any)?.averageLessonScore || 0,
        lessonsCompleted,
        totalLessons: course.lessons.length,
        averageScore: (progress as any)?.averageLessonScore || 0,
      };
    });

    res.json({
      success: true,
      data: { modules },
    });
  } catch (error) {
    console.error("Modules error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch modules" });
  }
});

export default router;
