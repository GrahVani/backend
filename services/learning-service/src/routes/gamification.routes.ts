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
import { getModuleProgressList } from "../services/progress.service";
import { getMilestones } from "../services/milestone.service";
import { TIER_THRESHOLDS, TIER_TITLES } from "../config/game.constants";

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
      include: { chapterRef: { include: { module: true } } },
    });

    if (!lesson) {
      return res.status(404).json({ success: false, error: "Lesson not found" });
    }

    const moduleId = lesson.chapterRef?.module?.id || lesson.chapterId;
    const result = await processQuizSubmission(userId, lessonId, moduleId, answers);
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

    const nextTierThreshold = TIER_THRESHOLDS[profile.currentTier] || 8000;
    const prevTierThreshold = TIER_THRESHOLDS[profile.currentTier - 1] || 0;
    const tierProgress = Math.min(
      100,
      Math.round(((profile.totalPoints - prevTierThreshold) / (nextTierThreshold - prevTierThreshold)) * 100)
    );

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
        title: TIER_TITLES[profile.currentTier] || "Jyotish Novice",
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

      const userIds = leaderboard.map((r) => r.userId);
      const users = await prisma.$queryRawUnsafe<{ id: string; name: string | null }[]>(
      `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
      userIds
    );

      const userMap = new Map(users.map((u) => [u.id, u.name || "Anonymous"]));

      leaderboard = leaderboard.map((r, index: number) => ({
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
      myRank = leaderboard.findIndex((r) => r.userId === userId) + 1;
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
    const milestones = await getMilestones(userId);

    res.json({
      success: true,
      data: {
        earned: milestones.earned.map((m) => ({
          badgeCode: m.badgeCode,
          name: m.name,
          description: m.description,
          rarity: m.rarity,
          iconUrl: m.iconUrl,
          earnedAt: m.earnedAt,
          pointsReward: m.pointsReward,
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

    const newBalance = await addPoints(userId, 10, "daily_login", {
      description: "Daily login bonus",
    });

    res.json({
      success: true,
      data: {
        pointsEarned: 10,
        newBalance,
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
    const modules = await getModuleProgressList(userId);

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
