import { Router } from "express";
import * as path from "path";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { adminAuthMiddleware, AdminRequest } from "../middlewares/admin-auth.middleware";

const router = Router();
router.use(adminAuthMiddleware);

// ===================== CURRICULUM HIERARCHY =====================

// GET /api/v1/learn/admin/tiers
router.get("/tiers", async (req: AdminRequest, res) => {
  try {
    const tiers = await prisma.tier.findMany({
      orderBy: { number: "asc" },
      include: {
        modules: {
          orderBy: { sequenceOrder: "asc" },
          include: { _count: { select: { chapters: true } } },
        },
      },
    });
    res.json({ success: true, data: tiers });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch tiers");
    res.status(500).json({ success: false, error: "Failed to fetch tiers" });
  }
});

// GET /api/v1/learn/admin/modules
router.get("/modules", async (req: AdminRequest, res) => {
  try {
    const { search, tierId, status } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }
    if (tierId) where.tierId = tierId;
    if (status) where.status = status;

    const modules = await prisma.module.findMany({
      where,
      include: {
        tier: true,
        _count: { select: { chapters: true } },
      },
      orderBy: { sequenceOrder: "asc" },
    });
    res.json({ success: true, data: modules });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch modules");
    res.status(500).json({ success: false, error: "Failed to fetch modules" });
  }
});

// GET /api/v1/learn/admin/modules/:id
router.get("/modules/:id", async (req: AdminRequest, res) => {
  try {
    const module = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: {
        tier: true,
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            lessons: { orderBy: { sequence: "asc" } },
          },
        },
      },
    });
    if (!module) return res.status(404).json({ success: false, error: "Module not found" });
    res.json({ success: true, data: module });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch module");
    res.status(500).json({ success: false, error: "Failed to fetch module" });
  }
});

// PATCH /api/v1/learn/admin/modules/:id
router.patch("/modules/:id", async (req: AdminRequest, res) => {
  try {
    const { title, description, status, sequenceOrder } = req.body;
    const module = await prisma.module.update({
      where: { id: req.params.id },
      data: { title, description, status, sequenceOrder },
    });
    res.json({ success: true, data: module });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update module");
    res.status(500).json({ success: false, error: "Failed to update module" });
  }
});

// GET /api/v1/learn/admin/chapters
router.get("/chapters", async (req: AdminRequest, res) => {
  try {
    const { moduleId } = req.query;
    const where: any = moduleId ? { moduleId: moduleId as string } : {};
    const chapters = await prisma.chapter.findMany({
      where,
      include: {
        module: true,
        _count: { select: { lessons: true } },
      },
      orderBy: { sequenceOrder: "asc" },
    });
    res.json({ success: true, data: chapters });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch chapters");
    res.status(500).json({ success: false, error: "Failed to fetch chapters" });
  }
});

// ===================== LESSONS =====================

// GET /api/v1/learn/admin/lessons
router.get("/lessons", async (req: AdminRequest, res) => {
  try {
    const { chapterId, status, search } = req.query;
    const where: any = {};
    if (chapterId) where.chapterId = chapterId as string;
    if (status) where.authoringStatus = status;
    if (search) where.title = { contains: search as string, mode: "insensitive" };

    const lessons = await prisma.lesson.findMany({
      where,
      orderBy: [{ tier: "asc" }, { module: "asc" }, { chapter: "asc" }, { sequence: "asc" }],
      include: {
        chapterRef: { include: { module: { include: { tier: true } } } },
      },
    });
    res.json({ success: true, data: lessons });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch lessons");
    res.status(500).json({ success: false, error: "Failed to fetch lessons" });
  }
});

// POST /api/v1/learn/admin/lessons
router.post("/lessons", async (req: AdminRequest, res) => {
  try {
    const {
      chapterId, slug, title, titleDevanagari, subtitle,
      lessonType, bloomLevels, targetMinutesReading, targetMinutesTotal,
      streams, streamNeutrality, prerequisites, learningOutcomes,
      primarySources, modernSources, interactiveEnabled, interactiveType,
      interactiveSpecFile, interactiveEndpoints, mcqCount, mcqBankFile,
      bodyMarkdown, authoringStatus, version, authors,
      hasDevanagari, hasDiagrams, hasAudio,
    } = req.body;

    if (!chapterId || !slug || !title || !lessonType) {
      return res.status(400).json({ success: false, error: "chapterId, slug, title, lessonType are required" });
    }

    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return res.status(404).json({ success: false, error: "Chapter not found" });

    const lesson = await prisma.lesson.create({
      data: {
        chapterId,
        slug,
        title,
        titleDevanagari: titleDevanagari || null,
        subtitle: subtitle || null,
        tier: chapter.number, // will be overridden by caller if needed
        module: 0,
        chapter: chapter.number,
        sequence: 1,
        lessonType,
        bloomLevels: bloomLevels || [],
        targetMinutesReading: targetMinutesReading || 15,
        targetMinutesTotal: targetMinutesTotal || 30,
        streams: streams || [],
        streamNeutrality: streamNeutrality ?? true,
        prerequisites: prerequisites || [],
        postrequisites: [],
        learningOutcomes: learningOutcomes || [],
        primarySources: primarySources || null,
        modernSources: modernSources || null,
        interactiveEnabled: interactiveEnabled ?? false,
        interactiveType: interactiveType || null,
        interactiveSpecFile: interactiveSpecFile || null,
        interactiveEndpoints: interactiveEndpoints || [],
        mcqCount: mcqCount || 0,
        mcqBankFile: mcqBankFile || null,
        bodyMarkdown: bodyMarkdown || "",
        authoringStatus: authoringStatus || "DRAFT",
        version: version || "1.0",
        authors: authors || [],
        hasDevanagari: hasDevanagari ?? false,
        hasDiagrams: hasDiagrams ?? false,
        hasAudio: hasAudio ?? false,
      },
    });
    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Lesson slug already exists" });
    }
    logger.error({ err }, "Admin: failed to create lesson");
    res.status(500).json({ success: false, error: "Failed to create lesson" });
  }
});

// GET /api/v1/learn/admin/lessons/:id
router.get("/lessons/:id", async (req: AdminRequest, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        chapterRef: { include: { module: { include: { tier: true } } } },
      },
    });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true, data: lesson });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch lesson");
    res.status(500).json({ success: false, error: "Failed to fetch lesson" });
  }
});

// PATCH /api/v1/learn/admin/lessons/:id
router.patch("/lessons/:id", async (req: AdminRequest, res) => {
  try {
    const data = req.body;
    // Prevent changing immutable IDs
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, data: lesson });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Lesson slug already exists" });
    }
    logger.error({ err }, "Admin: failed to update lesson");
    res.status(500).json({ success: false, error: "Failed to update lesson" });
  }
});

// DELETE /api/v1/learn/admin/lessons/:id
router.delete("/lessons/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.lesson.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Lesson deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete lesson");
    res.status(500).json({ success: false, error: "Failed to delete lesson" });
  }
});

// ===================== BADGES =====================

// GET /api/v1/learn/admin/badges
router.get("/badges", async (req: AdminRequest, res) => {
  try {
    const badges = await prisma.badgeDefinition.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: badges });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch badges");
    res.status(500).json({ success: false, error: "Failed to fetch badges" });
  }
});

// POST /api/v1/learn/admin/badges
router.post("/badges", async (req: AdminRequest, res) => {
  try {
    const { badgeCode, name, description, iconUrl, rarity, unlockConditions, pointsReward } = req.body;
    if (!badgeCode || !name) {
      return res.status(400).json({ success: false, error: "badgeCode and name are required" });
    }
    const badge = await prisma.badgeDefinition.create({
      data: { badgeCode, name, description, iconUrl, rarity, unlockConditions: unlockConditions || {}, pointsReward: pointsReward ?? 0 },
    });
    res.status(201).json({ success: true, data: badge });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Badge code already exists" });
    }
    logger.error({ err }, "Admin: failed to create badge");
    res.status(500).json({ success: false, error: "Failed to create badge" });
  }
});

// PATCH /api/v1/learn/admin/badges/:id
router.patch("/badges/:id", async (req: AdminRequest, res) => {
  try {
    const { name, description, iconUrl, rarity, unlockConditions, pointsReward } = req.body;
    const badge = await prisma.badgeDefinition.update({
      where: { id: req.params.id },
      data: { name, description, iconUrl, rarity, unlockConditions, pointsReward },
    });
    res.json({ success: true, data: badge });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update badge");
    res.status(500).json({ success: false, error: "Failed to update badge" });
  }
});

// DELETE /api/v1/learn/admin/badges/:id
router.delete("/badges/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.badgeDefinition.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Badge deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete badge");
    res.status(500).json({ success: false, error: "Failed to delete badge" });
  }
});

// ===================== STATS =====================

// GET /api/v1/learn/admin/stats/dashboard
router.get("/stats/dashboard", async (req: AdminRequest, res) => {
  try {
    const [
      totalModules,
      totalLessons,
      totalLearners,
      totalQuizAttempts,
      totalBadges,
      avgScore,
      completionStats,
      publishedModules,
      draftModules,
      recentQuizAttempts,
      allLessons,
      allModules,
      recentLearners,
      topStreaks,
      totalPointsSum,
    ] = await Promise.all([
      prisma.module.count(),
      prisma.lesson.count(),
      prisma.userLearningProfile.count(),
      prisma.quizAttempt.count(),
      prisma.badgeDefinition.count(),
      prisma.quizAttempt.aggregate({ _avg: { score: true } }),
      prisma.lessonProgress.aggregate({ _count: { id: true }, where: { status: { in: ["MASTERED", "COMPLETED"] } } }),
      prisma.module.count({ where: { status: "PUBLISHED" } }),
      prisma.module.count({ where: { status: "DRAFT" } }),
      prisma.quizAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.lesson.findMany({ select: { id: true, title: true } }),
      prisma.module.findMany({ select: { id: true, title: true } }),
      prisma.userLearningProfile.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
      prisma.userLearningProfile.findMany({ orderBy: { currentStreak: "desc" }, take: 5 }),
      prisma.userLearningProfile.aggregate({ _sum: { totalPoints: true } }),
    ]);

    res.json({
      success: true,
      data: {
        totalCourses: totalModules, // transitional field name
        totalLessons,
        totalLearners,
        totalQuizAttempts,
        totalBadges,
        averageQuizScore: Math.round(avgScore._avg.score || 0),
        totalCompletions: completionStats._count.id,
        publishedCourses: publishedModules, // transitional
        draftCourses: draftModules, // transitional
        totalPointsDistributed: totalPointsSum._sum.totalPoints || 0,
        recentQuizAttempts: recentQuizAttempts.map((a) => {
          const lesson = allLessons.find((l) => l.id === a.lessonId);
          return {
            id: a.id,
            userId: a.userId,
            lessonTitle: lesson?.title || "Unknown Lesson",
            score: a.score,
            correctAnswers: a.correctAnswers,
            totalQuestions: a.totalQuestions,
            createdAt: a.createdAt,
          };
        }),
        recentLearners: recentLearners.map((l) => ({
          userId: l.userId,
          totalPoints: l.totalPoints,
          currentStreak: l.currentStreak,
          totalLessonsCompleted: l.totalLessonsCompleted,
          updatedAt: l.updatedAt,
        })),
        topStreaks: topStreaks.map((l) => ({
          userId: l.userId,
          currentStreak: l.currentStreak,
          totalPoints: l.totalPoints,
        })),
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch dashboard stats");
    res.status(500).json({ success: false, error: "Failed to fetch dashboard stats" });
  }
});

// GET /api/v1/learn/admin/stats/overview
router.get("/stats/overview", async (req: AdminRequest, res) => {
  try {
    const [totalModules, totalLessons, totalLearners, totalQuizAttempts, totalBadges] = await Promise.all([
      prisma.module.count(),
      prisma.lesson.count(),
      prisma.userLearningProfile.count(),
      prisma.quizAttempt.count(),
      prisma.badgeDefinition.count(),
    ]);
    const avgScore = await prisma.quizAttempt.aggregate({ _avg: { score: true } });
    const completionStats = await prisma.lessonProgress.aggregate({
      _count: { id: true },
      where: { status: { in: ["MASTERED", "COMPLETED"] } },
    });
    res.json({
      success: true,
      data: {
        totalCourses: totalModules,
        totalLessons,
        totalLearners,
        totalQuizAttempts,
        totalBadges,
        averageQuizScore: Math.round(avgScore._avg.score || 0),
        totalCompletions: completionStats._count.id,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch overview stats");
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

// GET /api/v1/learn/admin/stats/modules/:id
router.get("/stats/modules/:id", async (req: AdminRequest, res) => {
  try {
    const moduleId = req.params.id;
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
    if (!module) return res.status(404).json({ success: false, error: "Module not found" });

    const lessonIds = module.chapters.flatMap((ch) => ch.lessons.map((l) => l.id));
    const [lessonProgressCount, quizAttempts, avgScore] = await Promise.all([
      prisma.lessonProgress.count({ where: { lessonId: { in: lessonIds } } }),
      prisma.quizAttempt.count({ where: { lessonId: { in: lessonIds } } }),
      prisma.quizAttempt.aggregate({ where: { lessonId: { in: lessonIds } }, _avg: { score: true } }),
    ]);
    res.json({
      success: true,
      data: {
        lessonCount: lessonIds.length,
        totalProgressRecords: lessonProgressCount,
        totalQuizAttempts: quizAttempts,
        averageScore: Math.round(avgScore._avg.score || 0),
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch module stats");
    res.status(500).json({ success: false, error: "Failed to fetch module stats" });
  }
});

// GET /api/v1/learn/admin/stats/users/:id/progress
router.get("/stats/users/:id/progress", async (req: AdminRequest, res) => {
  try {
    const userId = req.params.id;
    const [profile, lessonProgress, moduleProgress, quizAttempts, userBadges] = await Promise.all([
      prisma.userLearningProfile.findUnique({ where: { userId } }),
      prisma.lessonProgress.findMany({ where: { userId }, orderBy: { lastAttemptedAt: "desc" } }),
      prisma.moduleProgress.findMany({ where: { userId }, orderBy: { completedAt: "desc" } }),
      prisma.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
    ]);
    res.json({
      success: true,
      data: { profile, lessonProgress, moduleProgress, quizAttempts, badges: userBadges },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch user progress");
    res.status(500).json({ success: false, error: "Failed to fetch user progress" });
  }
});

// GET /api/v1/learn/admin/quiz-attempts
router.get("/quiz-attempts", async (req: AdminRequest, res) => {
  try {
    const { page = "1", limit = "20", userId, lessonId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (userId) where.userId = userId;
    if (lessonId) where.lessonId = lessonId;
    const [items, total] = await Promise.all([
      prisma.quizAttempt.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: Number(limit) }),
      prisma.quizAttempt.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch quiz attempts");
    res.status(500).json({ success: false, error: "Failed to fetch quiz attempts" });
  }
});

// GET /api/v1/learn/admin/learners
router.get("/learners", async (req: AdminRequest, res) => {
  try {
    const { search, page = "1", limit = "20" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (search) {
      where.userId = { contains: search as string, mode: "insensitive" };
    }
    const [items, total] = await Promise.all([
      prisma.userLearningProfile.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: Number(limit) }),
      prisma.userLearningProfile.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch learners");
    res.status(500).json({ success: false, error: "Failed to fetch learners" });
  }
});

// ===================== IMPORT =====================

// POST /api/v1/learn/admin/import/curriculum
// Re-seeds from the curriculum markdown files
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

router.post("/import/curriculum", async (req: AdminRequest, res) => {
  try {
    // Run seed script asynchronously with timeout to avoid blocking the event loop
    const serviceDir = path.resolve(__dirname, "..", "..", "..", "..");
    const { stdout, stderr } = await execAsync("npx tsx prisma/seed.ts", {
      cwd: serviceDir,
      encoding: "utf-8",
      timeout: 120_000, // 2 minutes max
    });
    if (stderr) logger.warn({ stderr }, "Admin: seed script stderr");
    logger.info({ stdout }, "Admin: curriculum seed completed");

    const stats = {
      tiers: await prisma.tier.count(),
      modules: await prisma.module.count(),
      chapters: await prisma.chapter.count(),
      lessons: await prisma.lesson.count(),
    };

    res.json({
      success: true,
      data: {
        message: "Curriculum re-imported from markdown files",
        ...stats,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to import curriculum");
    res.status(500).json({ success: false, error: "Failed to import curriculum" });
  }
});

// ===================== USER MANAGEMENT =====================

// POST /api/v1/learn/admin/users/:id/reset-progress
router.post("/users/:id/reset-progress", async (req: AdminRequest, res) => {
  try {
    const userId = req.params.id;
    await prisma.$transaction([
      prisma.lessonProgress.deleteMany({ where: { userId } }),
      prisma.moduleProgress.deleteMany({ where: { userId } }),
      prisma.quizAttempt.deleteMany({ where: { userId } }),
      prisma.userBadge.deleteMany({ where: { userId } }),
      prisma.pointsTransaction.deleteMany({ where: { userId } }),
      prisma.dailyActivity.deleteMany({ where: { userId } }),
      prisma.userLearningProfile.deleteMany({ where: { userId } }),
    ]);
    res.json({ success: true, message: "User learning progress reset" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to reset user progress");
    res.status(500).json({ success: false, error: "Failed to reset progress" });
  }
});

// POST /api/v1/learn/admin/users/:id/award-badge
router.post("/users/:id/award-badge", async (req: AdminRequest, res) => {
  try {
    const userId = req.params.id;
    const { badgeId } = req.body;
    if (!badgeId) return res.status(400).json({ success: false, error: "badgeId is required" });
    const existing = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } },
    });
    if (existing) return res.status(409).json({ success: false, error: "User already has this badge" });
    const userBadge = await prisma.userBadge.create({
      data: { userId, badgeId },
    });
    res.status(201).json({ success: true, data: userBadge });
  } catch (err) {
    logger.error({ err }, "Admin: failed to award badge");
    res.status(500).json({ success: false, error: "Failed to award badge" });
  }
});

// ===================== POINTS & LEADERBOARD =====================

// GET /api/v1/learn/admin/points-transactions
router.get("/points-transactions", async (req: AdminRequest, res) => {
  try {
    const { page = "1", limit = "20", userId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (userId) where.userId = userId;
    const [items, total] = await Promise.all([
      prisma.pointsTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: Number(limit) }),
      prisma.pointsTransaction.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch points transactions");
    res.status(500).json({ success: false, error: "Failed to fetch points transactions" });
  }
});

// GET /api/v1/learn/admin/leaderboard
router.get("/leaderboard", async (req: AdminRequest, res) => {
  try {
    const { periodType = "all_time", page = "1", limit = "20" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { periodType };
    const [items, total] = await Promise.all([
      prisma.leaderboardSnapshot.findMany({ where, orderBy: { rankPosition: "asc" }, skip, take: Number(limit) }),
      prisma.leaderboardSnapshot.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch leaderboard");
    res.status(500).json({ success: false, error: "Failed to fetch leaderboard" });
  }
});

// GET /api/v1/learn/admin/daily-activity
router.get("/daily-activity", async (req: AdminRequest, res) => {
  try {
    const { page = "1", limit = "20", userId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (userId) where.userId = userId;
    const [items, total] = await Promise.all([
      prisma.dailyActivity.findMany({ where, orderBy: { activityDate: "desc" }, skip, take: Number(limit) }),
      prisma.dailyActivity.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch daily activity");
    res.status(500).json({ success: false, error: "Failed to fetch daily activity" });
  }
});

// ===================== BIBLIOGRAPHY MANAGEMENT =====================

import {
  getBibliography,
  upsertBibliographyEntry,
} from "../../../services/bibliography.service";

// GET /api/v1/learn/admin/bibliography
router.get("/bibliography", async (req: AdminRequest, res) => {
  try {
    const { entryType, stream } = req.query;
    const entries = await getBibliography({
      entryType: entryType as "PRIMARY" | "MODERN" | undefined,
      stream: stream as string,
    });
    res.json({ success: true, data: entries });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch bibliography");
    res.status(500).json({ success: false, error: "Failed to fetch bibliography" });
  }
});

// POST /api/v1/learn/admin/bibliography
router.post("/bibliography", async (req: AdminRequest, res) => {
  try {
    const entry = await upsertBibliographyEntry(req.body);
    res.json({ success: true, data: entry });
  } catch (err) {
    logger.error({ err }, "Admin: failed to upsert bibliography entry");
    const message = err instanceof Error ? err.message : "Failed to upsert entry";
    res.status(500).json({ success: false, error: message });
  }
});

export { router as adminRoutes };
