import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import { authenticate } from "../middlewares/auth.middleware";
import {
  computeDashboardData,
  getCoursesWithProgress,
  getLessonProgress,
  trackSectionView,
  recalculateModuleProgress,
  recalculateChapterProgress,
  recalculateUserLearningProfile,
} from "../../../services/progress.service";
import {
  calculateQuestionPoints,
  calculateLessonCompletionBonus,
  updateStreak,
  evaluateBadges,
  addPoints,
} from "../../../services/gamification.service";
import {
  loadMcqBankFromDb,
  loadChapterMcqBank,
  buildDeliverableQuiz,
  buildFrontendQuiz,
  submitQuiz,
  checkCooldown,
  checkLessonMasteryRequirements,
} from "../../../services/quiz.service";
import {
  resolvePrerequisites,
  checkLessonAccess,
  computeModuleUnlock,
  getCurriculumTreeWithLockState,
} from "../../../services/prerequisite.service";
import {
  getDueCards,
  submitCardReview,
  getSRStats,
  generateCardsForLesson,
} from "../../../services/spaced-repetition.service";
import {
  trackInteractiveEvent,
  getComponentAnalytics,
  getUserInteractiveStats,
} from "../../../services/interactive.service";

const router = Router();
router.use(authenticate);

// ============================================================
// CURRICULUM DISCOVERY
// ============================================================

// GET /api/v1/learn/tiers
router.get("/tiers", async (req, res) => {
  try {
    const tiers = await prisma.tier.findMany({
      orderBy: { number: "asc" },
      include: {
        modules: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            _count: { select: { chapters: true } },
          },
        },
      },
    });
    res.json({ success: true, data: tiers });
  } catch (err) {
    logger.error({ err }, "Failed to fetch tiers");
    res.status(500).json({ success: false, error: "Failed to fetch tiers" });
  }
});

// GET /api/v1/learn/tiers/:id/modules
router.get("/tiers/:id/modules", async (req, res) => {
  try {
    const modules = await prisma.module.findMany({
      where: { tierId: req.params.id },
      orderBy: { sequenceOrder: "asc" },
      include: {
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            _count: { select: { lessons: true } },
          },
        },
        _count: { select: { chapters: true } },
      },
    });
    res.json({ success: true, data: modules });
  } catch (err) {
    logger.error({ err }, "Failed to fetch modules");
    res.status(500).json({ success: false, error: "Failed to fetch modules" });
  }
});

// GET /api/v1/learn/modules/:id
router.get("/modules/:id", async (req, res) => {
  try {
    const module = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: {
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            lessons: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                sequence: true,
                lessonType: true,
                authoringStatus: true,
                targetMinutesTotal: true,
                mcqCount: true,
              },
            },
          },
        },
      },
    });
    if (!module) return res.status(404).json({ success: false, error: "Module not found" });
    res.json({ success: true, data: module });
  } catch (err) {
    logger.error({ err }, "Failed to fetch module");
    res.status(500).json({ success: false, error: "Failed to fetch module" });
  }
});

// GET /api/v1/learn/chapters/:id
router.get("/chapters/:id", async (req, res) => {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.id },
      include: {
        lessons: {
          orderBy: { sequence: "asc" },
        },
      },
    });
    if (!chapter) return res.status(404).json({ success: false, error: "Chapter not found" });
    res.json({ success: true, data: chapter });
  } catch (err) {
    logger.error({ err }, "Failed to fetch chapter");
    res.status(500).json({ success: false, error: "Failed to fetch chapter" });
  }
});

// ============================================================
// BACKWARD-COMPATIBLE COURSES ENDPOINT
// Maps modules to the old Course shape so frontend doesn't break immediately
// ============================================================

// GET /api/v1/learn/courses
router.get("/courses", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.user as { sub?: string } | undefined)?.sub;

    const modules = await prisma.module.findMany({
      orderBy: [{ tier: { number: "asc" } }, { sequenceOrder: "asc" }],
      include: {
        tier: true,
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            lessons: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                sequence: true,
                lessonType: true,
                targetMinutesTotal: true,
                mcqCount: true,
                bloomLevels: true,
                authoringStatus: true,
                prerequisites: true,
              },
            },
          },
        },
      },
    });

    // Build structured response with chapters + enriched lesson metadata
    const courses = modules.map((mod) => {
      const allLessons = mod.chapters.flatMap((ch) => ch.lessons);
      const totalMinutes = allLessons.reduce((sum, l) => sum + (l.targetMinutesTotal || 30), 0);
      const totalMcqs = allLessons.reduce((sum, l) => sum + (l.mcqCount || 0), 0);

      return {
        id: mod.id,
        title: mod.title.replace(/^(T\d+\s+)?Module\s+\d+\s*[:\-–—]+\s*/i, "").trim(),
        description: mod.description || `${mod.tier.title} · ${allLessons.length} lessons`,
        level: mod.tier.number === 1 ? "LEVEL_1" : "LEVEL_2",
        category: mod.slug.toUpperCase().replace(/-/g, "_"),
        thumbnailUrl: null,
        isPublished: mod.status === "PUBLISHED",
        sequenceOrder: mod.sequenceOrder,
        moduleNumber: mod.number,
        tierNumber: mod.tier.number,
        tierTitle: mod.tier.title,
        totalLessons: allLessons.length,
        totalMinutes,
        totalMcqs,
        completedLessons: 0,
        progressPercentage: 0,
        averageScore: 0,
        status: allLessons.length === 0 ? "coming_soon" : "available",
        // Legacy flat lessons array (backward compat)
        lessons: allLessons.map((l) => ({
          id: l.id,
          title: l.title,
          sequenceOrder: l.sequence,
          lessonType: l.lessonType,
          targetMinutes: l.targetMinutesTotal,
          mcqCount: l.mcqCount,
          bloomLevels: l.bloomLevels,
          hasPrerequisites: (l.prerequisites || []).length > 0,
        })),
        // New structured chapters array
        chapters: mod.chapters.map((ch) => ({
          id: ch.id,
          number: ch.number,
          slug: ch.slug,
          title: ch.title,
          sequenceOrder: ch.sequenceOrder,
          lessonCount: ch.lessons.length,
          lessons: ch.lessons.map((l) => ({
            id: l.id,
            slug: l.slug,
            title: l.title,
            sequence: l.sequence,
            lessonType: l.lessonType,
            targetMinutes: l.targetMinutesTotal,
            mcqCount: l.mcqCount,
            bloomLevels: l.bloomLevels,
            hasPrerequisites: (l.prerequisites || []).length > 0,
          })),
        })),
      };
    });

    // Enrich with progress if userId provided
    if (userId) {
      const progress = await prisma.lessonProgress.findMany({
        where: { userId },
      });
      const moduleProgress = await prisma.moduleProgress.findMany({
        where: { userId },
      });

      for (const course of courses) {
        if (course.totalLessons === 0) continue; // skip coming-soon modules
        const modProg = moduleProgress.find((p) => p.moduleId === course.id);
        if (modProg) {
          course.progressPercentage = modProg.progressPercentage;
          course.status = modProg.status.toLowerCase();
        }
        const completedCount = progress.filter(
          (p) =>
            (p.status === "MASTERED" || p.status === "COMPLETED") &&
            course.lessons.some((l: { id: string }) => l.id === p.lessonId)
        ).length;
        course.completedLessons = completedCount;
      }
    }

    res.json({ success: true, data: courses });
  } catch (err) {
    logger.error({ err }, "Failed to fetch courses");
    res.status(500).json({ success: false, error: "Failed to fetch courses" });
  }
});

// GET /api/v1/learn/courses/:id
router.get("/courses/:id", async (req, res) => {
  try {
    const mod = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: {
        tier: true,
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            lessons: {
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    if (!mod) return res.status(404).json({ success: false, error: "Course not found" });

    const allLessons = mod.chapters.flatMap((ch) => ch.lessons);
    const course = {
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
    };

    res.json({ success: true, data: course });
  } catch (err) {
    logger.error({ err }, "Failed to fetch course");
    res.status(500).json({ success: false, error: "Failed to fetch course" });
  }
});

// ============================================================
// LESSON ENDPOINTS
// ============================================================

// ─────────────────────────────────────────────────────────────
// QUIZ DELIVERY & SUBMISSION (06-assessment-design-standard.md §8)
// ─────────────────────────────────────────────────────────────

// GET /api/v1/learn/lessons/:slugOrId/quiz
router.get("/lessons/:slugOrId/quiz", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const { slugOrId } = req.params;

    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    const rawQuestions = await loadMcqBankFromDb(lesson.id);
    if (rawQuestions.length === 0) {
      return res.status(404).json({ success: false, error: "No quiz available for this lesson" });
    }

    // Check cooldown
    let cooldownInfo = null;
    if (userId) {
      const cooldown = await checkCooldown(userId, lesson.id);
      if (cooldown.cooldownActive) {
        cooldownInfo = {
          active: true,
          nextAttemptAt: cooldown.nextAttemptAt,
          hoursRemaining: Math.ceil((cooldown.nextAttemptAt!.getTime() - Date.now()) / (1000 * 60 * 60)),
        };
      }
    }

    // Build deliverable quiz (randomised, stripped of answers)
    const deliverable = buildDeliverableQuiz(rawQuestions);

    res.json({
      success: true,
      data: {
        lessonId: lesson.id,
        lessonSlug: lesson.slug,
        totalQuestions: deliverable.length,
        questions: deliverable,
        passingThresholdPercent: 80,
        cooldownHoursAfterFailure: 24,
        cooldown: cooldownInfo,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch quiz");
    res.status(500).json({ success: false, error: "Failed to fetch quiz" });
  }
});

// GET /api/v1/learn/lessons/:slugOrId
router.get("/lessons/:slugOrId", async (req, res) => {
  try {
    const { slugOrId } = req.params;

    // Try slug first, then id
    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) {
      lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    }

    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    // Load stripped quiz from MCQ bank (no correct answers exposed)
    const rawQuestions = await loadMcqBankFromDb(lesson.id);
    const quiz = rawQuestions.length > 0 ? buildFrontendQuiz(rawQuestions) : [];

    // Build transitional contentJson for frontend compatibility
    // Parse bodyMarkdown to extract intro and sections
    const lines = lesson.bodyMarkdown.split("\n");
    let intro = "";
    interface ParsedSection { id: number; type: string; title: string; content: string; }
    const sections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;
    let inIntro = true;
    let sectionId = 1;

    for (const line of lines) {
      const sectionMatch = line.match(/^#\s+§(\d+)\s+(.+)$/);
      if (sectionMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          id: sectionId++,
          type: "section",
          title: sectionMatch[2].trim(),
          content: "",
        };
        inIntro = false;
      } else if (inIntro && line.trim()) {
        intro += line + "\n";
      } else if (currentSection) {
        currentSection.content += line + "\n";
      }
    }
    if (currentSection) sections.push(currentSection);

    // ── Extract concepts from multiple sources ──
    const concepts: Array<{ id: number; title: string; description: string }> = [];
    let conceptId = 1;

    // 1. Learning outcomes → concepts (pedagogical anchor)
    if (lesson.learningOutcomes && lesson.learningOutcomes.length > 0) {
      for (const outcome of lesson.learningOutcomes) {
        // Extract a short title from the first clause of the outcome
        const titleMatch = outcome.match(/^([^—:]+?)(?:\s*—\s*|\s*[:;]\s*|\s+in order[:;]?|$)/i);
        const title = titleMatch ? titleMatch[1].trim().replace(/\.$/, "") : `Concept ${conceptId}`;
        // Clean markdown bold markers from title
        const cleanTitle = title.replace(/\*\*/g, "").trim();
        concepts.push({
          id: conceptId++,
          title: cleanTitle,
          description: outcome.replace(/\*\*/g, "").trim(),
        });
      }
    }

    // 2. Extract bold Sanskrit / technical terms from body as supplementary concepts
    const bodySection = sections.find((s) => s.title.toLowerCase().includes("body"));
    if (bodySection) {
      // Find bold terms that look like proper nouns / Sanskrit terms (capitalised or Devanagari)
      const termMatches = bodySection.content.matchAll(/\*\*([A-Z][A-Za-zṣṭṇḍḥṃāīūēōṅñḷṛṝḻ]+(?:\s+[A-Z][A-Za-zṣṭṇḍḥṃāīūēōṅñḷṛṝḻ]+)*)\*\*/g);
      const seenTerms = new Set(concepts.map((c) => c.title.toLowerCase()));
      for (const match of termMatches) {
        const term = match[1].trim();
        const key = term.toLowerCase();
        if (!seenTerms.has(key) && term.length > 2 && !term.match(/^(The|This|That|These|Those|What|Why|How|When|Where|Who|Which|Without|With|Each|Every|All|Both|Either|Neither|Not|And|Or|But|Because|Therefore|However|Moreover|Furthermore|Nevertheless|Meanwhile|Afterward|Before|During|While|Since|Until|Unless|Although|Though|Even|If|Then|Thus|Hence|So|Yet|Still|Also|Too|Very|Just|Only|Even|Quite|Rather|Such|More|Most|Less|Least|Many|Much|Few|Several|Some|Any|No|None|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i)) {
          // Find surrounding sentence for description
          const idx = bodySection.content.indexOf(match[0]);
          const surrounding = bodySection.content.slice(Math.max(0, idx - 80), idx + 200);
          const sentenceMatch = surrounding.match(/[^.!?]*\*\*[^*]+\*\*[^.!?]*[.!?]/);
          const description = sentenceMatch
            ? sentenceMatch[0].replace(/\*\*/g, "").trim()
            : `Key term: ${term}`;
          concepts.push({ id: conceptId++, title: term, description });
          seenTerms.add(key);
        }
      }
    }

    // 3. If still empty, fall back to lesson title
    if (concepts.length === 0) {
      concepts.push({
        id: 1,
        title: lesson.title,
        description: lesson.learningOutcomes?.[0] || "Core concept from this lesson",
      });
    }

    const contentJson = {
      intro: intro.trim() || lesson.learningOutcomes.join(". ") || "Welcome to this lesson.",
      sections: sections.length > 0 ? sections : undefined,
      concepts: concepts.length > 0 ? concepts : [{ id: 1, title: lesson.title, description: "Core concept" }],
      quiz,
    };

    res.json({
      success: true,
      data: {
        id: lesson.id,
        slug: lesson.slug,
        courseId: lesson.chapterId, // transitional; frontend expects courseId
        title: lesson.title,
        titleDevanagari: lesson.titleDevanagari,
        subtitle: lesson.subtitle,
        sequenceOrder: lesson.sequence,
        lessonType: lesson.lessonType,
        contentJson,
        bodyMarkdown: lesson.bodyMarkdown,
        isPublished: lesson.authoringStatus === "PUBLISHED",
        tier: lesson.tier,
        module: lesson.module,
        chapter: lesson.chapter,
        prerequisites: lesson.prerequisites,
        postrequisites: lesson.postrequisites,
        bloomLevels: lesson.bloomLevels,
        streams: lesson.streams,
        streamNeutrality: lesson.streamNeutrality,
        learningOutcomes: lesson.learningOutcomes,
        primarySources: lesson.primarySources as Array<{ref: string; note?: string}> || [],
        modernSources: lesson.modernSources as Array<{ref: string; note?: string}> || [],
        targetMinutesTotal: lesson.targetMinutesTotal,
        targetMinutesReading: lesson.targetMinutesReading,
        interactiveEnabled: lesson.interactiveEnabled,
        interactiveType: lesson.interactiveType,
        interactiveFallback: lesson.interactiveFallback,
        mcqCount: lesson.mcqCount,
        hasDevanagari: lesson.hasDevanagari,
        hasDiagrams: lesson.hasDiagrams,
        hasAudio: lesson.hasAudio,
        estimatedReadingGrade: lesson.estimatedReadingGrade,
        version: lesson.version,
        authors: lesson.authors,
        technicalReviewer: lesson.technicalReviewer,
        pedagogicalReviewer: lesson.pedagogicalReviewer,
        lastUpdated: lesson.lastUpdated,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson");
    res.status(500).json({ success: false, error: "Failed to fetch lesson" });
  }
});

// GET /api/v1/learn/lessons/:slugOrId/progress
router.get("/lessons/:slugOrId/progress", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const { slugOrId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    const progress = await getLessonProgress(userId, lesson.id);
    if (!progress) return res.status(404).json({ success: false, error: "Progress not found" });

    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson progress");
    res.status(500).json({ success: false, error: "Failed to fetch lesson progress" });
  }
});

// POST /api/v1/learn/lessons/:slugOrId/section-view
router.post("/lessons/:slugOrId/section-view", async (req, res) => {
  try {
    const { userId, sectionId } = req.body;
    const { slugOrId } = req.params;

    if (!userId || sectionId === undefined) {
      return res.status(400).json({ success: false, error: "userId and sectionId required" });
    }

    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    const updated = await trackSectionView(userId, lesson.id, Number(sectionId));
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Failed to track section view");
    res.status(500).json({ success: false, error: "Failed to track section view" });
  }
});

// POST /api/v1/learn/lessons/:slugOrId/submit
router.post("/lessons/:slugOrId/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;
    const { slugOrId } = req.params;

    if (!userId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: "userId and answers[] required" });
    }

    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    // Load quiz from MCQ bank
    const rawQuestions = await loadMcqBankFromDb(lesson.id);
    if (rawQuestions.length === 0) {
      return res.status(404).json({ success: false, error: "No quiz available for this lesson" });
    }

    // Submit through quiz service (handles cooldown, scoring, mastery gates)
    const result = await submitQuiz(userId, lesson.id, rawQuestions, answers);

    if (result.cooldownActive) {
      return res.status(429).json({
        success: false,
        error: "24-hour cooldown active between failed attempts",
        data: {
          nextAttemptAt: result.nextAttemptAt,
          hoursRemaining: Math.ceil((result.nextAttemptAt!.getTime() - Date.now()) / (1000 * 60 * 60)),
        },
      });
    }

    // Update streak
    const streakResult = await updateStreak(userId);

    // Check if already mastered to prevent XP farming
    const existingProgress = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
    });
    const wasAlreadyMastered = existingProgress?.status === "MASTERED";

    let totalPoints = 0;
    if (!wasAlreadyMastered && result.mastered) {
      const priorAttempts = await prisma.quizAttempt.count({ where: { userId, lessonId: lesson.id } });
      const isFirstTry = priorAttempts === 0;

      let runningStreak = 0;
      for (let i = 0; i < result.questionResults.length; i++) {
        const qr = result.questionResults[i];
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

      const isFirstCompletion = !existingProgress || existingProgress.status !== "MASTERED";
      const lessonBonus = calculateLessonCompletionBonus(result.score, isFirstCompletion, priorAttempts + 1);
      totalPoints += lessonBonus;

      if (totalPoints > 0) {
        await addPoints(userId, totalPoints, "lesson_completion", {
          referenceType: "lesson",
          referenceId: lesson.id,
          description: `Mastered lesson ${lesson.slug} with ${result.score}%`,
        });
      }
    }

    // Record quiz attempt
    await prisma.quizAttempt.create({
      data: {
        userId,
        lessonId: lesson.id,
        moduleId: lesson.chapterId,
        score: result.score,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        answersJson: answers as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
        completedAt: new Date(),
        pointsEarned: totalPoints,
      },
    });

    // Determine status: MASTERED requires ≥80% AND all other mastery checks
    const masteryCheck = await checkLessonMasteryRequirements(userId, lesson.id);
    const canMaster = result.mastered && masteryCheck.allSectionsViewed && masteryCheck.interactiveInteracted;

    const newStatus = canMaster
      ? "MASTERED"
      : result.score >= 70
      ? "COMPLETED"
      : "IN_PROGRESS";

    const shouldSetCompletedAt = (result.score >= 70) && !existingProgress?.completedAt;

    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      create: {
        userId,
        lessonId: lesson.id,
        moduleId: lesson.chapterId,
        status: newStatus,
        completionPercentage: result.score,
        score: Math.max(result.score, existingProgress?.score || 0),
        questionsAttempted: result.totalQuestions,
        questionsCorrect: result.correctAnswers,
        pointsEarned: totalPoints,
        completedAt: shouldSetCompletedAt ? new Date() : undefined,
      },
      update: {
        status: newStatus,
        completionPercentage: Math.max(existingProgress?.completionPercentage || 0, result.score),
        score: Math.max(existingProgress?.score || 0, result.score),
        questionsAttempted: { increment: result.totalQuestions },
        questionsCorrect: { increment: result.correctAnswers },
        pointsEarned: { increment: totalPoints },
        completedAt: shouldSetCompletedAt ? new Date() : undefined,
      },
    });

    // Evaluate badges
    const newBadges = await evaluateBadges(userId, {
      type: "lesson_complete",
      metadata: { lessonId: lesson.id, score: result.score },
    });

    // Recalculate chapter, module & profile progress
    await recalculateChapterProgress(userId, lesson.chapterId);
    const chapter = await prisma.chapter.findUnique({
      where: { id: lesson.chapterId },
      include: { module: true },
    });
    if (chapter) {
      await recalculateModuleProgress(userId, chapter.module.id);
    }
    await recalculateUserLearningProfile(userId);

    res.json({
      success: true,
      data: {
        score: result.score,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        passed: result.passed,
        mastered: result.mastered,
        canMaster,
        masteryRequirements: {
          quizMastered: result.mastered,
          allSectionsViewed: masteryCheck.allSectionsViewed,
          interactiveInteracted: masteryCheck.interactiveInteracted,
        },
        pointsEarned: totalPoints,
        newStreak: streakResult.newStreak,
        newBadges: newBadges.map((b) => ({ badgeCode: b.badgeCode, name: b.name })),
        status: newStatus,
        questionResults: result.questionResults,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to submit lesson");
    res.status(500).json({ success: false, error: "Failed to submit lesson" });
  }
});

// GET /api/v1/learn/chapters/:id/quiz
router.get("/chapters/:id/quiz", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: { module: true },
    });
    if (!chapter) return res.status(404).json({ success: false, error: "Chapter not found" });

    const rawQuestions = loadChapterMcqBank(
      chapter.slug,
      chapter.module.slug,
      chapter.module.number <= 24 ? 1 : 2
    );

    if (rawQuestions.length === 0) {
      return res.status(404).json({ success: false, error: "No chapter-check quiz available" });
    }

    const deliverable = buildDeliverableQuiz(rawQuestions);

    res.json({
      success: true,
      data: {
        chapterId: chapter.id,
        totalQuestions: deliverable.length,
        questions: deliverable,
        passingThresholdPercent: 80,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch chapter quiz");
    res.status(500).json({ success: false, error: "Failed to fetch chapter quiz" });
  }
});

// POST /api/v1/learn/chapters/:id/submit
router.post("/chapters/:id/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;
    const { id } = req.params;

    if (!userId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: "userId and answers[] required" });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: { module: true },
    });
    if (!chapter) return res.status(404).json({ success: false, error: "Chapter not found" });

    const rawQuestions = loadChapterMcqBank(
      chapter.slug,
      chapter.module.slug,
      chapter.module.number <= 24 ? 1 : 2
    );

    if (rawQuestions.length === 0) {
      return res.status(404).json({ success: false, error: "No chapter-check quiz available" });
    }

    // Use a synthetic lessonId for chapter quiz attempts
    const syntheticLessonId = `chapter-${chapter.id}`;
    const result = await submitQuiz(userId, syntheticLessonId, rawQuestions, answers);

    if (result.cooldownActive) {
      return res.status(429).json({
        success: false,
        error: "24-hour cooldown active between failed attempts",
        data: { nextAttemptAt: result.nextAttemptAt },
      });
    }

    res.json({
      success: true,
      data: {
        score: result.score,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        passed: result.passed,
        mastered: result.mastered,
        questionResults: result.questionResults,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to submit chapter quiz");
    res.status(500).json({ success: false, error: "Failed to submit chapter quiz" });
  }
});

// ============================================================
// DASHBOARD & GAMIFICATION
// ============================================================

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

// GET /api/v1/learn/lessons/:slug/prerequisites
router.get("/lessons/:slug/prerequisites", async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.query.userId as string;

    const prerequisites = await resolvePrerequisites(slug);

    if (userId) {
      // Enrich with user progress
      const lessonIds = prerequisites.filter((p) => p.lessonId).map((p) => p.lessonId);
      const progress = await prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds } },
      });
      const progressMap = new Map(progress.map((p) => [p.lessonId, p.status]));

      for (const prereq of prerequisites) {
        if (prereq.lessonId) {
          prereq.status = (progressMap.get(prereq.lessonId) as typeof prereq.status | undefined) || "AVAILABLE";
        }
      }
    }

    res.json({ success: true, data: prerequisites });
  } catch (err) {
    logger.error({ err }, "Failed to fetch prerequisites");
    res.status(500).json({ success: false, error: "Failed to fetch prerequisites" });
  }
});

// POST /api/v1/learn/lessons/:slug/access-check
router.post("/lessons/:slug/access-check", async (req, res) => {
  try {
    const { slug } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
    }

    const result = await checkLessonAccess(userId, slug);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, "Failed to check lesson access");
    res.status(500).json({ success: false, error: "Failed to check lesson access" });
  }
});

// GET /api/v1/learn/modules/:id/unlock-status
router.get("/modules/:id/unlock-status", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const { id } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
    }

    const result = await computeModuleUnlock(userId, id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, "Failed to compute module unlock status");
    res.status(500).json({ success: false, error: "Failed to compute module unlock status" });
  }
});

// GET /api/v1/learn/curriculum-tree
router.get("/curriculum-tree", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const tree = await getCurriculumTreeWithLockState(userId || "");
    res.json({ success: true, data: tree });
  } catch (err) {
    logger.error({ err }, "Failed to fetch curriculum tree");
    res.status(500).json({ success: false, error: "Failed to fetch curriculum tree" });
  }
});

// ─────────────────────────────────────────────────────────────
// SPACED REPETITION ENDPOINTS
// ─────────────────────────────────────────────────────────────

// GET /api/v1/learn/sr/today
router.get("/sr/today", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    const [cards, stats] = await Promise.all([
      getDueCards(userId, 50),
      getSRStats(userId),
    ]);

    res.json({
      success: true,
      data: { cards, stats },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch SR cards");
    res.status(500).json({ success: false, error: "Failed to fetch SR cards" });
  }
});

// POST /api/v1/learn/sr/:cardId/review
router.post("/sr/:cardId/review", async (req, res) => {
  try {
    const { userId, quality } = req.body;
    const { cardId } = req.params;

    if (!userId || quality === undefined) {
      return res.status(400).json({ success: false, error: "userId and quality required" });
    }

    if (quality < 0 || quality > 5 || !Number.isInteger(quality)) {
      return res.status(400).json({ success: false, error: "quality must be an integer 0-5" });
    }

    const updated = await submitCardReview(userId, cardId, quality as 0 | 1 | 2 | 3 | 4 | 5);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Failed to submit SR review");
    const message = err instanceof Error ? err.message : "Failed to submit SR review";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/v1/learn/lessons/:slugOrId/generate-sr-cards
router.post("/lessons/:slugOrId/generate-sr-cards", async (req, res) => {
  try {
    const { userId } = req.body;
    const { slugOrId } = req.params;

    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    let lesson = await prisma.lesson.findUnique({ where: { slug: slugOrId } });
    if (!lesson) lesson = await prisma.lesson.findUnique({ where: { id: slugOrId } });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

    const created = await generateCardsForLesson(userId, lesson.id);
    res.json({ success: true, data: { created } });
  } catch (err) {
    logger.error({ err }, "Failed to generate SR cards");
    res.status(500).json({ success: false, error: "Failed to generate SR cards" });
  }
});

// ─────────────────────────────────────────────────────────────
// INTERACTIVE COMPONENT ANALYTICS
// ─────────────────────────────────────────────────────────────

// POST /api/v1/learn/interactive-events
router.post("/interactive-events", async (req, res) => {
  try {
    const { userId, componentSlug, lessonId, eventType, eventData } = req.body;

    if (!userId || !componentSlug || !eventType) {
      return res.status(400).json({ success: false, error: "userId, componentSlug, eventType required" });
    }

    const event = await trackInteractiveEvent({
      userId,
      componentSlug,
      lessonId,
      eventType,
      eventData,
    });

    res.json({ success: true, data: event });
  } catch (err) {
    logger.error({ err }, "Failed to track interactive event");
    const message = err instanceof Error ? err.message : "Failed to track interactive event";
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/v1/learn/interactive-components/:slug/analytics
router.get("/interactive-components/:slug/analytics", async (req, res) => {
  try {
    const analytics = await getComponentAnalytics(req.params.slug);
    if (!analytics) return res.status(404).json({ success: false, error: "Component not found" });
    res.json({ success: true, data: analytics });
  } catch (err) {
    logger.error({ err }, "Failed to fetch component analytics");
    res.status(500).json({ success: false, error: "Failed to fetch component analytics" });
  }
});

// GET /api/v1/learn/users/:userId/interactive-stats
router.get("/users/:userId/interactive-stats", async (req, res) => {
  try {
    const { userId } = req.params;
    const lessonId = req.query.lessonId as string | undefined;
    const stats = await getUserInteractiveStats(userId, lessonId);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error({ err }, "Failed to fetch user interactive stats");
    res.status(500).json({ success: false, error: "Failed to fetch user interactive stats" });
  }
});

// GET /api/v1/learn/lessons/by-slug/:slug
router.get("/lessons/by-slug/:slug", async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { slug: req.params.slug },
    });
    if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true, data: lesson });
  } catch (err) {
    logger.error({ err }, "Failed to fetch lesson by slug");
    res.status(500).json({ success: false, error: "Failed to fetch lesson by slug" });
  }
});

export { router as learnRoutes };
