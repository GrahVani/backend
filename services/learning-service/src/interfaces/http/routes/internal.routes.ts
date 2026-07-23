import { Router } from "express";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { createInternalAuthMiddleware } from "@grahvani/contracts";
import { config } from "../../../config";

const router = Router();

const verifyInternalKey = createInternalAuthMiddleware({
  getServiceKey: () => config.internalServiceKey,
});

router.use(verifyInternalKey);

/**
 * GET /internal/tutor/context/:lessonSlug
 * Retrieves structured lesson context for tutor-service context builder.
 */
router.get("/tutor/context/:lessonSlug", async (req, res) => {
  try {
    const { lessonSlug } = req.params;

    const lesson = await prisma.lesson.findUnique({
      where: { slug: lessonSlug },
      include: {
        lessonSections: {
          orderBy: { sectionNumber: "asc" },
        },
        mcqBank: true,
      },
    });

    if (!lesson) {
      return res.status(404).json({
        error: {
          code: "LESSON_NOT_FOUND",
          message: `Lesson with slug '${lessonSlug}' not found`,
        },
      });
    }

    const sections = lesson.lessonSections.map((s) => ({
      sectionNumber: s.sectionNumber,
      sectionTitle: s.sectionTitle,
      sectionType: s.sectionType,
      content: s.content,
    }));

    const interactiveSummary = lesson.interactiveEnabled
      ? {
          type: lesson.interactiveType,
          spec: lesson.interactiveSpec,
          fallback: lesson.interactiveFallback,
        }
      : null;

    res.json({
      success: true,
      data: {
        lesson: {
          id: lesson.id,
          slug: lesson.slug,
          title: lesson.title,
          subtitle: lesson.subtitle,
          learningOutcomes: lesson.learningOutcomes,
          prerequisites: lesson.prerequisites,
        },
        sections,
        mcqs: lesson.mcqBank ? (lesson.mcqBank.questions as any[]) : [],
        knowledge: [],
        interactiveSummary,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch tutor lesson context");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch tutor lesson context",
      },
    });
  }
});

/**
 * GET /internal/tutor/progress/:userId/:lessonSlug
 * Retrieves the user's overall learning profile and specific lesson progress.
 */
router.get("/tutor/progress/:userId/:lessonSlug", async (req, res) => {
  try {
    const { userId, lessonSlug } = req.params;

    const profile = await prisma.userLearningProfile.findUnique({
      where: { userId },
    });

    const lesson = await prisma.lesson.findUnique({
      where: { slug: lessonSlug },
      select: { id: true }
    });

    let lessonProgress = null;
    if (lesson) {
      lessonProgress = await prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
      });
    }

    res.json({
      success: true,
      data: {
        level: profile?.currentLevel || "LEVEL_1",
        tier: profile?.currentTier || 1,
        xp: profile?.totalPoints || 0,
        currentStreak: profile?.currentStreak || 0,
        lessonStatus: lessonProgress?.status || "NOT_STARTED",
        completionPercentage: lessonProgress?.completionPercentage || 0,
        quizScore: lessonProgress?.score || 0,
        quizAttempts: lessonProgress?.questionsAttempted || 0,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch tutor progress context");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch tutor progress context",
      },
    });
  }
});

export { router as internalRoutes };
