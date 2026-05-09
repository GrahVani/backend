import { Router } from "express";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { adminAuthMiddleware, AdminRequest } from "../middlewares/admin-auth.middleware";
import fs from "fs";
import path from "path";

const router = Router();
router.use(adminAuthMiddleware);

// ===================== COURSES =====================

// GET /api/v1/learn/admin/courses
router.get("/courses", async (req: AdminRequest, res) => {
  try {
    const { search, level, category, published } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }
    if (level) where.level = level;
    if (category) where.category = category;
    if (published === "true") where.isPublished = true;
    if (published === "false") where.isPublished = false;

    const courses = await prisma.course.findMany({
      where,
      include: { _count: { select: { lessons: true } } },
      orderBy: { sequenceOrder: "asc" },
    });
    res.json({ success: true, data: courses });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch courses");
    res.status(500).json({ success: false, error: "Failed to fetch courses" });
  }
});

// POST /api/v1/learn/admin/courses
router.post("/courses", async (req: AdminRequest, res) => {
  try {
    const { title, description, level, category, sequenceOrder, thumbnailUrl, isPublished } = req.body;
    if (!title || !level || !category) {
      return res.status(400).json({ success: false, error: "title, level, category are required" });
    }
    const course = await prisma.course.create({
      data: { title, description: description || "", level, category, sequenceOrder: sequenceOrder ?? 0, thumbnailUrl, isPublished: isPublished ?? true },
    });
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    logger.error({ err }, "Admin: failed to create course");
    res.status(500).json({ success: false, error: "Failed to create course" });
  }
});

// GET /api/v1/learn/admin/courses/:id
router.get("/courses/:id", async (req: AdminRequest, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { lessons: { orderBy: { sequenceOrder: "asc" } } },
    });
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });
    res.json({ success: true, data: course });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch course");
    res.status(500).json({ success: false, error: "Failed to fetch course" });
  }
});

// PATCH /api/v1/learn/admin/courses/:id
router.patch("/courses/:id", async (req: AdminRequest, res) => {
  try {
    const { title, description, level, category, sequenceOrder, thumbnailUrl, isPublished } = req.body;
    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: { title, description, level, category, sequenceOrder, thumbnailUrl, isPublished },
    });
    res.json({ success: true, data: course });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update course");
    res.status(500).json({ success: false, error: "Failed to update course" });
  }
});

// DELETE /api/v1/learn/admin/courses/:id
router.delete("/courses/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.course.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete course");
    res.status(500).json({ success: false, error: "Failed to delete course" });
  }
});

// ===================== LESSONS =====================

// GET /api/v1/learn/admin/courses/:id/lessons
router.get("/courses/:id/lessons", async (req: AdminRequest, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { courseId: req.params.id },
      orderBy: { sequenceOrder: "asc" },
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
    const { courseId, title, sequenceOrder, lessonType, contentJson, isPublished } = req.body;
    if (!courseId || !title || !lessonType) {
      return res.status(400).json({ success: false, error: "courseId, title, lessonType are required" });
    }
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        title,
        sequenceOrder: sequenceOrder ?? 0,
        lessonType,
        contentJson: contentJson || {},
        isPublished: isPublished ?? true,
      },
    });
    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    logger.error({ err }, "Admin: failed to create lesson");
    res.status(500).json({ success: false, error: "Failed to create lesson" });
  }
});

// GET /api/v1/learn/admin/lessons/:id
router.get("/lessons/:id", async (req: AdminRequest, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
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
    const { title, sequenceOrder, lessonType, contentJson, isPublished } = req.body;
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { title, sequenceOrder, lessonType, contentJson, isPublished },
    });
    res.json({ success: true, data: lesson });
  } catch (err) {
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

// ===================== QUIZ =====================

// GET /api/v1/learn/admin/lessons/:id/quiz
router.get("/lessons/:id/quiz", async (req: AdminRequest, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    const content = (lesson.contentJson as any) || {};
    res.json({ success: true, data: content.quiz || [] });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch quiz");
    res.status(500).json({ success: false, error: "Failed to fetch quiz" });
  }
});

// PUT /api/v1/learn/admin/lessons/:id/quiz
router.put("/lessons/:id/quiz", async (req: AdminRequest, res) => {
  try {
    const { quiz } = req.body;
    if (!Array.isArray(quiz)) {
      return res.status(400).json({ success: false, error: "quiz must be an array" });
    }
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    const content = { ...(lesson.contentJson as any), quiz };
    const updated = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { contentJson: content },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update quiz");
    res.status(500).json({ success: false, error: "Failed to update quiz" });
  }
});

// POST /api/v1/learn/admin/lessons/:id/quiz/questions
router.post("/lessons/:id/quiz/questions", async (req: AdminRequest, res) => {
  try {
    const question = req.body;
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    const content = { ...(lesson.contentJson as any) };
    const quiz = content.quiz || [];
    quiz.push(question);
    content.quiz = quiz;
    const updated = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { contentJson: content },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to add question");
    res.status(500).json({ success: false, error: "Failed to add question" });
  }
});

// Helper to find question index by qid (supports questionId, id, or numeric index)
function findQuestionIndex(quiz: any[], qid: string): number {
  const idx = quiz.findIndex((q: any) =>
    String(q.questionId || q.id) === String(qid)
  );
  if (idx !== -1) return idx;
  const num = Number(qid);
  if (!isNaN(num) && num >= 0 && num < quiz.length) return num;
  return -1;
}

// PATCH /api/v1/learn/admin/lessons/:id/quiz/questions/:qid
router.patch("/lessons/:id/quiz/questions/:qid", async (req: AdminRequest, res) => {
  try {
    const { qid } = req.params;
    const question = req.body;
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    const content = { ...(lesson.contentJson as any) };
    const quiz = (content.quiz || []) as any[];
    const idx = findQuestionIndex(quiz, qid);
    if (idx === -1) return res.status(404).json({ success: false, error: "Question not found" });
    quiz[idx] = { ...quiz[idx], ...question };
    content.quiz = quiz;
    const updated = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { contentJson: content },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update question");
    res.status(500).json({ success: false, error: "Failed to update question" });
  }
});

// DELETE /api/v1/learn/admin/lessons/:id/quiz/questions/:qid
router.delete("/lessons/:id/quiz/questions/:qid", async (req: AdminRequest, res) => {
  try {
    const { qid } = req.params;
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    const content = { ...(lesson.contentJson as any) };
    const quiz = (content.quiz || []) as any[];
    const idx = findQuestionIndex(quiz, qid);
    if (idx === -1) return res.status(404).json({ success: false, error: "Question not found" });
    quiz.splice(idx, 1);
    content.quiz = quiz;
    const updated = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { contentJson: content },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete question");
    res.status(500).json({ success: false, error: "Failed to delete question" });
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
  } catch (err: any) {
    if (err.code === "P2002") {
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
      totalCourses,
      totalLessons,
      totalLearners,
      totalQuizAttempts,
      totalBadges,
      avgScore,
      completionStats,
      publishedCourses,
      draftCourses,
      recentQuizAttempts,
      allLessons,
      allCourses,
      recentLearners,
      topStreaks,
      totalPointsSum,
    ] = await Promise.all([
      prisma.course.count(),
      prisma.lesson.count(),
      prisma.userLearningProfile.count(),
      prisma.quizAttempt.count(),
      prisma.badgeDefinition.count(),
      prisma.quizAttempt.aggregate({ _avg: { score: true } }),
      prisma.lessonProgress.aggregate({ _count: { id: true }, where: { status: "completed" } }),
      prisma.course.count({ where: { isPublished: true } }),
      prisma.course.count({ where: { isPublished: false } }),
      prisma.quizAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.lesson.findMany({ select: { id: true, title: true } }),
      prisma.course.findMany({ select: { id: true, title: true } }),
      prisma.userLearningProfile.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
      prisma.userLearningProfile.findMany({ orderBy: { currentStreak: "desc" }, take: 5 }),
      prisma.userLearningProfile.aggregate({ _sum: { totalPoints: true } }),
    ]);

    res.json({
      success: true,
      data: {
        totalCourses,
        totalLessons,
        totalLearners,
        totalQuizAttempts,
        totalBadges,
        averageQuizScore: Math.round(avgScore._avg.score || 0),
        totalCompletions: completionStats._count.id,
        publishedCourses,
        draftCourses,
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
    const [totalCourses, totalLessons, totalLearners, totalQuizAttempts, totalBadges] = await Promise.all([
      prisma.course.count(),
      prisma.lesson.count(),
      prisma.userLearningProfile.count(),
      prisma.quizAttempt.count(),
      prisma.badgeDefinition.count(),
    ]);
    const avgScore = await prisma.quizAttempt.aggregate({ _avg: { score: true } });
    const completionStats = await prisma.lessonProgress.aggregate({
      _count: { id: true },
      where: { status: "completed" },
    });
    res.json({
      success: true,
      data: {
        totalCourses,
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

// GET /api/v1/learn/admin/stats/courses/:id
router.get("/stats/courses/:id", async (req: AdminRequest, res) => {
  try {
    const courseId = req.params.id;
    const lessons = await prisma.lesson.findMany({ where: { courseId }, select: { id: true } });
    const lessonIds = lessons.map((l) => l.id);
    const [lessonProgressCount, quizAttempts, avgScore] = await Promise.all([
      prisma.lessonProgress.count({ where: { lessonId: { in: lessonIds } } }),
      prisma.quizAttempt.count({ where: { lessonId: { in: lessonIds } } }),
      prisma.quizAttempt.aggregate({ where: { lessonId: { in: lessonIds } }, _avg: { score: true } }),
    ]);
    res.json({
      success: true,
      data: {
        lessonCount: lessons.length,
        totalProgressRecords: lessonProgressCount,
        totalQuizAttempts: quizAttempts,
        averageScore: Math.round(avgScore._avg.score || 0),
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch course stats");
    res.status(500).json({ success: false, error: "Failed to fetch course stats" });
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

// GET /api/v1/learn/admin/import/preview
router.get("/import/preview", async (req: AdminRequest, res) => {
  try {
    const seedPath = path.resolve(process.cwd(), "../../../Learning_modules/seed_data.json");
    if (!fs.existsSync(seedPath)) {
      return res.status(404).json({ success: false, error: "seed_data.json not found" });
    }
    const raw = fs.readFileSync(seedPath, "utf-8");
    const data = JSON.parse(raw);
    const modules = data.modules || [];

    const preview = modules.map((mod: any) => ({
      sequenceOrder: mod.sequenceOrder,
      title: mod.title || `Module ${mod.sequenceOrder}`,
      level: mod.level || "LEVEL_1",
      category: mod.category || "FOUNDATIONS",
      lessonCount: (mod.lessons || []).length,
      totalQuestions: (mod.lessons || []).reduce((sum: number, ls: any) => {
        const quiz = (ls.contentJson?.quiz) || [];
        return sum + quiz.length;
      }, 0),
      lessons: (mod.lessons || []).map((ls: any) => ({
        title: ls.title || "Untitled Lesson",
        lessonType: ls.lessonType || "THEORY",
        sequenceOrder: ls.sequenceOrder ?? 0,
        questionCount: (ls.contentJson?.quiz || []).length,
      })),
    }));

    const dbCourses = await prisma.course.count();
    const dbLessons = await prisma.lesson.count();

    res.json({
      success: true,
      data: {
        sourceFile: "Learning_modules/seed_data.json",
        totalModules: modules.length,
        sourceLessons: modules.reduce((sum: number, m: any) => sum + (m.lessons || []).length, 0),
        sourceQuestions: preview.reduce((sum: number, m: any) => sum + m.totalQuestions, 0),
        dbCourses,
        dbLessons,
        modules: preview,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to preview curriculum");
    res.status(500).json({ success: false, error: "Failed to preview curriculum" });
  }
});

// POST /api/v1/learn/admin/import/curriculum
router.post("/import/curriculum", async (req: AdminRequest, res) => {
  try {
    const seedPath = path.resolve(process.cwd(), "../../../Learning_modules/seed_data.json");
    if (!fs.existsSync(seedPath)) {
      return res.status(404).json({ success: false, error: "seed_data.json not found at " + seedPath });
    }
    const raw = fs.readFileSync(seedPath, "utf-8");
    const data = JSON.parse(raw);
    const modules = data.modules || [];

    let coursesCreated = 0;
    let lessonsCreated = 0;
    let coursesUpdated = 0;
    let lessonsUpdated = 0;

    for (const mod of modules) {
      const courseData = {
        title: mod.title || `Module ${mod.sequenceOrder}`,
        description: mod.description || "",
        level: mod.level || "LEVEL_1",
        category: mod.category || "FOUNDATIONS",
        sequenceOrder: mod.sequenceOrder ?? 0,
        isPublished: true,
      };

      const existingCourse = await prisma.course.findFirst({
        where: { title: courseData.title },
      });

      let course;
      if (existingCourse) {
        course = await prisma.course.update({ where: { id: existingCourse.id }, data: courseData });
        coursesUpdated++;
      } else {
        course = await prisma.course.create({ data: courseData });
        coursesCreated++;
      }

      const lessons = mod.lessons || [];
      for (const ls of lessons) {
        const lessonData = {
          courseId: course.id,
          title: ls.title || "Untitled Lesson",
          sequenceOrder: ls.sequenceOrder ?? 0,
          lessonType: ls.lessonType || "THEORY",
          contentJson: ls.contentJson || {},
          isPublished: true,
        };

        const existingLesson = await prisma.lesson.findFirst({
          where: { courseId: course.id, title: lessonData.title },
        });

        if (existingLesson) {
          await prisma.lesson.update({ where: { id: existingLesson.id }, data: lessonData });
          lessonsUpdated++;
        } else {
          await prisma.lesson.create({ data: lessonData });
          lessonsCreated++;
        }
      }
    }

    res.json({
      success: true,
      data: { coursesCreated, coursesUpdated, lessonsCreated, lessonsUpdated, totalModules: modules.length },
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
      prisma.userProgress.deleteMany({ where: { userId } }),
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

export { router as adminRoutes };
