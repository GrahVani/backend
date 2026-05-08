import { Router } from "express";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { authenticate } from "../middlewares/auth.middleware";
import {
  computeDashboardData,
  getCoursesWithProgress,
  getLessonProgress,
  trackSectionView,
  recalculateModuleProgress,
  recalculateUserLearningProfile,
} from "../../../services/progress.service";
import {
  calculateQuestionPoints,
  calculateLessonCompletionBonus,
  updateStreak,
  evaluateBadges,
  addPoints,
  recalculateSkillScore,
} from "../../../services/gamification.service";

const router = Router();

router.use(authenticate);

// GET /api/v1/learn/courses
router.get("/courses", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.user as any)?.sub;
    const courses = await getCoursesWithProgress(userId);
    res.json({ success: true, data: courses });
  } catch (err) {
    logger.error({ err }, "Failed to fetch courses");
    res.status(500).json({ success: false, error: "Failed to fetch courses" });
  }
});

// GET /api/v1/learn/courses/:id
router.get("/courses/:id", async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        lessons: {
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });
    res.json({ success: true, data: course });
  } catch (err) {
    logger.error({ err }, "Failed to fetch course");
    res.status(500).json({ success: false, error: "Failed to fetch course" });
  }
});

// GET /api/v1/learn/lessons/:id
router.get("/lessons/:id", async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
    });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true, data: lesson });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson");
    res.status(500).json({ success: false, error: "Failed to fetch lesson" });
  }
});

// GET /api/v1/learn/lessons/:id/progress
router.get("/lessons/:id/progress", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const lessonId = req.params.id;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    const progress = await getLessonProgress(userId, lessonId);
    if (!progress) return res.status(404).json({ success: false, error: "Lesson not found" });

    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson progress");
    res.status(500).json({ success: false, error: "Failed to fetch lesson progress" });
  }
});

// POST /api/v1/learn/lessons/:id/section-view
router.post("/lessons/:id/section-view", async (req, res) => {
  try {
    const { userId, sectionId } = req.body;
    const lessonId = req.params.id;

    if (!userId || sectionId === undefined) {
      return res.status(400).json({ success: false, error: "userId and sectionId required" });
    }

    const updated = await trackSectionView(userId, lessonId, Number(sectionId));
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Failed to track section view");
    res.status(500).json({ success: false, error: "Failed to track section view" });
  }
});

// POST /api/v1/learn/lessons/:id/submit
router.post("/lessons/:id/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;
    const lessonId = req.params.id;

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    const content = lesson.contentJson as any;
    const quiz = content.quiz || [];

    // Calculate per-question correctness and aggregate score
    let correct = 0;
    let totalAnswerable = 0;
    const questionResults: Array<{ questionId: string | number; isCorrect: boolean }> = [];

    answers.forEach((ans: any) => {
      const q = quiz.find((q: any) => q.questionId === ans.questionId);
      if (!q) return;

      let qCorrect = false;

      if (q.type === "case_study") {
        totalAnswerable += q.subQuestions?.length || 1;
        try {
          const subAnswers = typeof ans.answer === "string" ? JSON.parse(ans.answer) : ans.answer;
          let subCorrect = 0;
          let subTotal = 0;
          if (Array.isArray(subAnswers)) {
            subAnswers.forEach((subAns: any, idx: number) => {
              const subQ = q.subQuestions?.[idx];
              if (subQ) {
                subTotal++;
                if (subAns === subQ.correctAnswer) subCorrect++;
              }
            });
          }
          correct += subCorrect;
          qCorrect = subTotal > 0 && subCorrect === subTotal;
        } catch {
          totalAnswerable -= (q.subQuestions?.length || 1) - 1;
          if (q.subQuestions?.[0]?.correctAnswer === ans.answer) {
            correct++;
            qCorrect = true;
          }
        }
      } else {
        totalAnswerable++;
        if (q.type === "matching") {
          try {
            const matched = typeof ans.answer === "string" ? JSON.parse(ans.answer) : ans.answer;
            let allCorrect = true;
            for (const pair of q.pairs || []) {
              if (matched[pair.left] !== pair.right) {
                allCorrect = false;
                break;
              }
            }
            if (allCorrect && Object.keys(matched || {}).length === (q.pairs || []).length) {
              correct++;
              qCorrect = true;
            }
          } catch {
            // Invalid matching answer
          }
        } else if (q.type === "fill_blank") {
          const userAns = String(ans.answer).trim().toLowerCase();
          const correctAns = String(q.correctAnswer).trim().toLowerCase();
          const acceptable = (q.acceptableAnswers || []).map((a: string) => a.trim().toLowerCase());
          if (userAns === correctAns || acceptable.includes(userAns)) {
            correct++;
            qCorrect = true;
          }
        } else {
          // multiple_choice, true_false
          if (q.correctAnswer === ans.answer) {
            correct++;
            qCorrect = true;
          }
        }
      }

      questionResults.push({ questionId: ans.questionId, isCorrect: qCorrect });
    });

    const score = totalAnswerable > 0 ? Math.round((correct / totalAnswerable) * 100) : 0;

    // Update streak
    const streakResult = await updateStreak(userId);

    // Check if this lesson was already completed — prevents XP farming by re-attempting
    const existingProgress = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const wasAlreadyCompleted = existingProgress?.status === "completed";

    let totalPoints = 0;

    if (!wasAlreadyCompleted) {
      // Determine if this is the first attempt at this lesson
      const priorAttempts = await prisma.quizAttempt.count({ where: { userId, lessonId } });
      const isFirstTry = priorAttempts === 0;

      // Calculate points per question using actual timing data
      let runningStreak = 0;
      for (let i = 0; i < questionResults.length; i++) {
        const qr = questionResults[i];
        const ans = answers[i];
        if (qr.isCorrect) {
          runningStreak++;
          const timeSpent = typeof ans?.timeSpentSeconds === "number" ? ans.timeSpentSeconds : 0;
          const pts = calculateQuestionPoints(true, timeSpent, runningStreak, isFirstTry);
          totalPoints += pts.total;
        } else {
          runningStreak = 0;
        }
      }

      // Add lesson completion bonus (only on first completion)
      const isFirstCompletion = !existingProgress || existingProgress.status !== "completed";
      const attemptsCount = priorAttempts;
      const lessonBonus = calculateLessonCompletionBonus(score, isFirstCompletion, attemptsCount + 1);
      totalPoints += lessonBonus;

      // Award points
      if (totalPoints > 0) {
        await addPoints(userId, totalPoints, "lesson_completion", {
          referenceType: "lesson",
          referenceId: lessonId,
          description: `Completed lesson ${lessonId} with ${score}%`,
        });
      }
    }

    // Record quiz attempt
    await prisma.quizAttempt.create({
      data: {
        userId,
        lessonId,
        moduleId: lesson.courseId,
        score,
        totalQuestions: totalAnswerable || quiz.length,
        correctAnswers: correct,
        answersJson: answers as any,
        startedAt: new Date(),
        completedAt: new Date(),
        pointsEarned: totalPoints,
      },
    });

    // Save legacy progress (backward compatibility)
    await prisma.userProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: {
        status: "COMPLETED",
        score,
        answersJson: answers,
        completedAt: new Date(),
      },
      create: {
        userId,
        lessonId,
        status: "COMPLETED",
        score,
        answersJson: answers,
        completedAt: new Date(),
      },
    });

    // Also save to LessonProgress (gamification table) for dynamic tracking
    const shouldSetCompletedAt = score >= 70 && !existingProgress?.completedAt;
    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        moduleId: lesson.courseId,
        status: score >= 70 ? "completed" : "in_progress",
        completionPercentage: score,
        score,
        questionsAttempted: totalAnswerable || quiz.length,
        questionsCorrect: correct,
        pointsEarned: totalPoints,
        completedAt: shouldSetCompletedAt ? new Date() : undefined,
      },
      update: {
        status: score >= 70 ? "completed" : "in_progress",
        completionPercentage: Math.max(existingProgress?.completionPercentage || 0, score),
        score: Math.max(existingProgress?.score || 0, score),
        questionsAttempted: { increment: totalAnswerable || quiz.length },
        questionsCorrect: { increment: correct },
        pointsEarned: { increment: totalPoints },
        completedAt: shouldSetCompletedAt ? new Date() : undefined,
      },
    });

    // Evaluate badges
    const newBadges = await evaluateBadges(userId, {
      type: "lesson_complete",
      metadata: { lessonId, score },
    });

    // Dynamically recalculate module & profile progress
    await recalculateModuleProgress(userId, lesson.courseId);
    await recalculateUserLearningProfile(userId);

    res.json({
      success: true,
      data: {
        score,
        totalQuestions: totalAnswerable || quiz.length,
        correctAnswers: correct,
        pointsEarned: totalPoints,
        newStreak: streakResult.newStreak,
        newBadges: newBadges.map((b) => ({ badgeCode: b.badgeCode, name: b.name })),
        status: "COMPLETED",
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to submit lesson");
    res.status(500).json({ success: false, error: "Failed to submit lesson" });
  }
});

// GET /api/v1/learn/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    const data = await computeDashboardData(userId);
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, "Failed to fetch dashboard");
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

export { router as learnRoutes };
