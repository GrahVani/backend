import { Router } from "express";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

// GET /api/v1/learn/courses
router.get("/courses", async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { isPublished: true },
      include: {
        lessons: {
          select: { id: true, title: true, sequenceOrder: true, lessonType: true },
          orderBy: { sequenceOrder: "asc" }
        }
      }
    });
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
          orderBy: { sequenceOrder: "asc" }
        }
      }
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
      where: { id: req.params.id }
    });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true, data: lesson });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson");
    res.status(500).json({ success: false, error: "Failed to fetch lesson" });
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

    // Calculate score with support for all question types
    let correct = 0;
    let totalAnswerable = 0;

    answers.forEach((ans: any) => {
      const q = quiz.find((q: any) => q.questionId === ans.questionId);
      if (!q) return;

      if (q.type === "case_study") {
        // Case study: each sub-question counts separately
        // ans.answer should be a JSON string of sub-answers or we score from frontend
        // For simplicity, trust frontend's answers array for sub-questions
        // Actually, case_study answers from frontend will be per sub-question
        // Let's handle case_study where the answer might be a JSON object
        totalAnswerable += q.subQuestions?.length || 1;
        try {
          const subAnswers = typeof ans.answer === "string" ? JSON.parse(ans.answer) : ans.answer;
          if (Array.isArray(subAnswers)) {
            subAnswers.forEach((subAns: any, idx: number) => {
              const subQ = q.subQuestions?.[idx];
              if (subQ && subAns === subQ.correctAnswer) correct++;
            });
          }
        } catch {
          // Fallback: treat as single answer
          totalAnswerable -= (q.subQuestions?.length || 1) - 1;
          if (q.subQuestions?.[0]?.correctAnswer === ans.answer) correct++;
        }
      } else {
        totalAnswerable++;
        if (q.type === "matching") {
          // Check if all pairs match
          try {
            const matched = typeof ans.answer === "string" ? JSON.parse(ans.answer) : ans.answer;
            let allCorrect = true;
            for (const pair of q.pairs || []) {
              if (matched[pair.left] !== pair.right) {
                allCorrect = false;
                break;
              }
            }
            if (allCorrect && Object.keys(matched || {}).length === (q.pairs || []).length) correct++;
          } catch {
            // Invalid matching answer
          }
        } else if (q.type === "fill_blank") {
          const userAns = String(ans.answer).trim().toLowerCase();
          const correctAns = String(q.correctAnswer).trim().toLowerCase();
          const acceptable = (q.acceptableAnswers || []).map((a: string) => a.trim().toLowerCase());
          if (userAns === correctAns || acceptable.includes(userAns)) correct++;
        } else {
          // multiple_choice, true_false
          if (q.correctAnswer === ans.answer) correct++;
        }
      }
    });

    const score = totalAnswerable > 0 ? Math.round((correct / totalAnswerable) * 100) : 0;

    // Save progress
    const progress = await prisma.userProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: {
        status: "COMPLETED",
        score,
        answersJson: answers,
        completedAt: new Date()
      },
      create: {
        userId,
        lessonId,
        status: "COMPLETED",
        score,
        answersJson: answers,
        completedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        score,
        totalQuestions: totalAnswerable || quiz.length,
        correctAnswers: correct,
        status: "COMPLETED"
      }
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

    const progress = await prisma.userProgress.findMany({
      where: { userId },
      include: { lesson: { select: { title: true, courseId: true } } }
    });

    res.json({
      success: true,
      data: {
        lessonsCompleted: progress.filter(p => p.status === "COMPLETED").length,
        averageScore: progress.length > 0
          ? Math.round(progress.reduce((sum, p) => sum + (p.score || 0), 0) / progress.length)
          : 0,
        progress
      }
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch dashboard");
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

export { router as learnRoutes };
