import { Router } from "express";
import * as path from "path";
import { prisma } from "../../../config/database";
import { logger } from "../../../config/logger";
import {
  publishContentUpdated,
  publishContentDeleted,
} from "../../../events/publisher";
import { adminAuthMiddleware, AdminRequest } from "../middlewares/admin-auth.middleware";

function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const router = Router();

import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

// POST /api/v1/learn/admin/import/curriculum
// Triggered by GitHub webhook when curriculum repository is updated
router.post("/import/curriculum", async (req, res) => {
  try {
    logger.info("Admin: received GitHub webhook for curriculum update");
    
    // 1. Pull latest changes
    const curriculumPath = "/app/curriculum";
    try {
      await execAsync("git pull", { cwd: curriculumPath, timeout: 60000 });
      logger.info("Admin: successfully pulled curriculum updates");
    } catch (gitErr) {
      logger.error({ err: gitErr }, "Admin: failed to git pull curriculum");
      // If it fails, maybe the folder doesn't exist. We could try cloning but the startup script handles that.
    }

    // 2. Run seed script asynchronously with timeout
    const serviceDir = path.resolve(__dirname, "..", "..", "..", "..");
    
    // We now have tsx installed globally in the production container
    const seedCmd = "npx tsx prisma/seed.ts";

    const { stdout, stderr } = await execAsync(seedCmd, {
      cwd: serviceDir,
      encoding: "utf-8",
      timeout: 120_000, // 2 minutes max
    });
    
    if (stderr) logger.warn({ stderr }, "Admin: seed script stderr");
    logger.info({ stdout }, "Admin: curriculum seed completed");

    // 3. Trigger Frontend Deployment in Coolify (Zero-Downtime)
    const coolifyToken = process.env.COOLIFY_API_TOKEN;
    if (coolifyToken) {
      try {
        const coolifyUrl = process.env.COOLIFY_API_URL || "http://147.93.30.201:8000";
        const frontendUuid = process.env.FRONTEND_COOLIFY_UUID || "lk0cksw804s4oc4c4o88ws48";
        
        logger.info("Admin: triggering frontend deployment in Coolify...");
        
        // Coolify v4 deploy endpoint
        const deployResponse = await fetch(`${coolifyUrl}/api/v1/deploy?uuid=${frontendUuid}&force=false`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${coolifyToken}`,
            "Content-Type": "application/json"
          }
        });

        if (!deployResponse.ok) {
          const errText = await deployResponse.text();
          logger.error({ errText, status: deployResponse.status }, "Admin: failed to trigger Coolify frontend deployment");
        } else {
          logger.info("Admin: successfully triggered frontend deployment in Coolify");
        }
      } catch (deployErr) {
        logger.error({ err: deployErr }, "Admin: error contacting Coolify API");
      }
    } else {
      logger.warn("Admin: COOLIFY_API_TOKEN is not set, skipping automatic frontend deployment");
    }

    res.json({ success: true, message: "Curriculum pulled, seeded, and frontend deployment triggered successfully" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to process curriculum webhook");
    res.status(500).json({ success: false, error: "Failed to process curriculum webhook" });
  }
});

router.use(adminAuthMiddleware);

// ===================== CURRICULUM HIERARCHY =====================

// GET /api/v1/learn/admin/tiers
router.get("/tiers", async (req: AdminRequest, res) => {
  try {
    const tiers = await prisma.tier.findMany({ take: 250, 
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

    const modules = await prisma.module.findMany({ take: 250, 
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
    const chapters = await prisma.chapter.findMany({ take: 250, 
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

// GET /api/v1/learn/admin/chapters/:id
router.get("/chapters/:id", async (req: AdminRequest, res) => {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.id },
      include: {
        module: true,
        lessons: { orderBy: { sequence: "asc" } },
      },
    });
    if (!chapter) return res.status(404).json({ success: false, error: "Chapter not found" });
    res.json({ success: true, data: chapter });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch chapter");
    res.status(500).json({ success: false, error: "Failed to fetch chapter" });
  }
});

// POST /api/v1/learn/admin/chapters
router.post("/chapters", async (req: AdminRequest, res) => {
  try {
    const { moduleId, number, slug, title, description, overviewMarkdown, learningObjectives, status, sequenceOrder } = req.body;
    if (!moduleId || !number || !slug || !title) {
      return res.status(400).json({ success: false, error: "moduleId, number, slug, title are required" });
    }
    const chapter = await prisma.chapter.create({
      data: {
        moduleId,
        number: Number(number),
        slug,
        title,
        description: description || null,
        overviewMarkdown: overviewMarkdown || null,
        learningObjectives: learningObjectives || [],
        status: status || "DRAFT",
        sequenceOrder: sequenceOrder ?? number,
      },
    });
    res.status(201).json({ success: true, data: chapter });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Chapter slug already exists in this module" });
    }
    logger.error({ err }, "Admin: failed to create chapter");
    res.status(500).json({ success: false, error: "Failed to create chapter" });
  }
});

// PATCH /api/v1/learn/admin/chapters/:id
router.patch("/chapters/:id", async (req: AdminRequest, res) => {
  try {
    const { title, description, status, sequenceOrder, overviewMarkdown, learningObjectives } = req.body;
    const chapter = await prisma.chapter.update({
      where: { id: req.params.id },
      data: { title, description, status, sequenceOrder, overviewMarkdown, learningObjectives },
    });
    res.json({ success: true, data: chapter });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update chapter");
    res.status(500).json({ success: false, error: "Failed to update chapter" });
  }
});

// DELETE /api/v1/learn/admin/chapters/:id
router.delete("/chapters/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.chapter.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Chapter deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete chapter");
    res.status(500).json({ success: false, error: "Failed to delete chapter" });
  }
});

// ===================== TIER CRUD =====================

// POST /api/v1/learn/admin/tiers
router.post("/tiers", async (req: AdminRequest, res) => {
  try {
    const { number, title, description, status } = req.body;
    if (!number || !title) {
      return res.status(400).json({ success: false, error: "number and title are required" });
    }
    const tier = await prisma.tier.create({
      data: {
        number: Number(number),
        title,
        description: description || null,
        status: status || "ACTIVE",
      },
    });
    res.status(201).json({ success: true, data: tier });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Tier number already exists" });
    }
    logger.error({ err }, "Admin: failed to create tier");
    res.status(500).json({ success: false, error: "Failed to create tier" });
  }
});

// PATCH /api/v1/learn/admin/tiers/:id
router.patch("/tiers/:id", async (req: AdminRequest, res) => {
  try {
    const { number, title, description, status } = req.body;
    const tier = await prisma.tier.update({
      where: { id: req.params.id },
      data: { number: number !== undefined ? Number(number) : undefined, title, description, status },
    });
    res.json({ success: true, data: tier });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Tier number already exists" });
    }
    logger.error({ err }, "Admin: failed to update tier");
    res.status(500).json({ success: false, error: "Failed to update tier" });
  }
});

// DELETE /api/v1/learn/admin/tiers/:id
router.delete("/tiers/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.tier.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Tier deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete tier");
    res.status(500).json({ success: false, error: "Failed to delete tier" });
  }
});

// ===================== MODULE FULL CRUD =====================

// POST /api/v1/learn/admin/modules
router.post("/modules", async (req: AdminRequest, res) => {
  try {
    const { tierId, number, slug, title, description, overviewMarkdown, learningObjectives, status, sequenceOrder } = req.body;
    if (!tierId || !number || !slug || !title) {
      return res.status(400).json({ success: false, error: "tierId, number, slug, title are required" });
    }
    const module = await prisma.module.create({
      data: {
        tierId,
        number: Number(number),
        slug,
        title,
        description: description || null,
        overviewMarkdown: overviewMarkdown || null,
        learningObjectives: learningObjectives || [],
        status: status || "DRAFT",
        sequenceOrder: sequenceOrder ?? number,
      },
    });
    res.status(201).json({ success: true, data: module });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Module slug already exists" });
    }
    logger.error({ err }, "Admin: failed to create module");
    res.status(500).json({ success: false, error: "Failed to create module" });
  }
});

// DELETE /api/v1/learn/admin/modules/:id
router.delete("/modules/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.module.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Module deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete module");
    res.status(500).json({ success: false, error: "Failed to delete module" });
  }
});

// ===================== COURSE ALIASES (frontend compatibility) =====================

function mapModuleToCourse(m: any) {
  return {
    ...m,
    level: `LEVEL_${m.tier?.number ?? 1}`,
    category: "FOUNDATIONS",
    isPublished: m.status === "PUBLISHED",
  };
}

// GET /api/v1/learn/admin/courses
router.get("/courses", async (req: AdminRequest, res) => {
  try {
    const { search, tierId, status, level, category, published } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }
    // Support both tierId (native) and level (frontend alias)
    if (tierId) {
      where.tierId = tierId;
    } else if (level) {
      const tierNumber = parseInt((level as string).replace("LEVEL_", ""), 10);
      const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
      if (tier) where.tierId = tier.id;
    }
    // Support both status (native) and published (frontend alias)
    if (status) {
      where.status = status;
    } else if (published === "true") {
      where.status = "PUBLISHED";
    } else if (published === "false") {
      where.status = "DRAFT";
    }
    // category is not stored on Module; ignore filter silently

    const modules = await prisma.module.findMany({ take: 250, 
      where,
      include: {
        tier: true,
        chapters: { select: { lessons: { select: { id: true } } } },
      },
      orderBy: { sequenceOrder: "asc" },
    });
    const mapped = modules.map((m) => {
      const lessonCount = m.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
      return {
        ...mapModuleToCourse(m),
        _count: { lessons: lessonCount },
      };
    });
    res.json({ success: true, data: mapped });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch courses");
    res.status(500).json({ success: false, error: "Failed to fetch courses" });
  }
});

// GET /api/v1/learn/admin/courses/:id
router.get("/courses/:id", async (req: AdminRequest, res) => {
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
    if (!module) return res.status(404).json({ success: false, error: "Course not found" });
    res.json({ success: true, data: mapModuleToCourse(module) });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch course");
    res.status(500).json({ success: false, error: "Failed to fetch course" });
  }
});

// POST /api/v1/learn/admin/courses
router.post("/courses", async (req: AdminRequest, res) => {
  try {
    const { title, description, tierId, level, sequenceOrder, isPublished, status } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: "title is required" });
    }
    // Derive tierId from tierId directly, or from level fallback
    let resolvedTierId = tierId;
    if (!resolvedTierId && level) {
      const tierNumber = parseInt((level as string).replace("LEVEL_", ""), 10);
      const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
      resolvedTierId = tier?.id;
    }
    if (!resolvedTierId) {
      const firstTier = await prisma.tier.findFirst({ orderBy: { number: "asc" } });
      resolvedTierId = firstTier?.id;
    }
    if (!resolvedTierId) {
      return res.status(400).json({ success: false, error: "No tier exists. Create a tier first." });
    }
    const slug = (req.body.slug || title).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const nextNumber = await prisma.module.count({ where: { tierId: resolvedTierId } }) + 1;
    const module = await prisma.module.create({
      data: {
        tierId: resolvedTierId,
        number: nextNumber,
        slug,
        title,
        description: description || null,
        status: status || (isPublished ? "PUBLISHED" : "DRAFT"),
        sequenceOrder: sequenceOrder ?? nextNumber,
      },
    });
    res.status(201).json({ success: true, data: mapModuleToCourse(module) });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Course slug already exists" });
    }
    logger.error({ err }, "Admin: failed to create course");
    res.status(500).json({ success: false, error: "Failed to create course" });
  }
});

// PATCH /api/v1/learn/admin/courses/:id
router.patch("/courses/:id", async (req: AdminRequest, res) => {
  try {
    const { title, description, tierId, level, sequenceOrder, isPublished, status } = req.body;
    const data: any = { title, description, sequenceOrder };
    if (status) {
      data.status = status;
    } else if (isPublished !== undefined) {
      data.status = isPublished ? "PUBLISHED" : "DRAFT";
    }
    if (tierId) {
      data.tierId = tierId;
    } else if (level) {
      const tierNumber = parseInt((level as string).replace("LEVEL_", ""), 10);
      const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
      if (tier) data.tierId = tier.id;
    }
    const module = await prisma.module.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, data: mapModuleToCourse(module) });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update course");
    res.status(500).json({ success: false, error: "Failed to update course" });
  }
});

// DELETE /api/v1/learn/admin/courses/:id
router.delete("/courses/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.module.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete course");
    res.status(500).json({ success: false, error: "Failed to delete course" });
  }
});

// GET /api/v1/learn/admin/courses/:id/lessons
router.get("/courses/:id/lessons", async (req: AdminRequest, res) => {
  try {
    const moduleId = req.params.id;
    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        chapters: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            lessons: { orderBy: { sequence: "asc" } },
          },
        },
      },
    });
    if (!module) return res.status(404).json({ success: false, error: "Course not found" });
    const lessons = module.chapters.flatMap((ch) => ch.lessons.map((l) => ({
      ...l,
      sequenceOrder: l.sequence,
      isPublished: l.authoringStatus === "PUBLISHED",
      chapterId: ch.id,
      chapterName: ch.title,
      chapterNumber: ch.number,
    })));
    res.json({ success: true, data: lessons });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch course lessons");
    res.status(500).json({ success: false, error: "Failed to fetch course lessons" });
  }
});

// GET /api/v1/learn/admin/stats/courses/:id
router.get("/stats/courses/:id", async (req: AdminRequest, res) => {
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
    if (!module) return res.status(404).json({ success: false, error: "Course not found" });

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
    logger.error({ err }, "Admin: failed to fetch course stats");
    res.status(500).json({ success: false, error: "Failed to fetch course stats" });
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

    const lessons = await prisma.lesson.findMany({ take: 250, 
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
    let {
      chapterId, courseId, moduleId, slug, title, titleDevanagari, subtitle,
      lessonType, bloomLevels, targetMinutesReading, targetMinutesTotal,
      streams, streamNeutrality, prerequisites, learningOutcomes,
      primarySources, modernSources, interactiveEnabled, interactiveType,
      interactiveSpecFile, interactiveFallback, interactiveEndpoints, mcqCount,
      bodyMarkdown, authoringStatus, version, authors,
      hasDevanagari, hasDiagrams, hasAudio, lastUpdated,
    } = req.body;

    // Frontend compatibility: courseId/moduleId can be used instead of chapterId
    if (!chapterId && (courseId || moduleId)) {
      const modId = (courseId || moduleId) as string;
      const firstChapter = await prisma.chapter.findFirst({
        where: { moduleId: modId },
        orderBy: { sequenceOrder: "asc" },
      });
      if (firstChapter) {
        chapterId = firstChapter.id;
      } else {
        // Auto-create a default chapter for this module
        const module = await prisma.module.findUnique({ where: { id: modId } });
        if (!module) return res.status(404).json({ success: false, error: "Module not found" });
        const nextChNum = await prisma.chapter.count({ where: { moduleId: modId } }) + 1;
        const newChapter = await prisma.chapter.create({
          data: {
            moduleId: modId,
            number: nextChNum,
            slug: `chapter-${nextChNum}`,
            title: `Chapter ${nextChNum}`,
            sequenceOrder: nextChNum,
          },
        });
        chapterId = newChapter.id;
      }
    }

    if (!chapterId || !slug || !title || !lessonType) {
      return res.status(400).json({ success: false, error: "chapterId (or courseId/moduleId), slug, title, lessonType are required" });
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
        interactiveFallback: interactiveFallback || null,
        interactiveEndpoints: interactiveEndpoints || [],
        mcqCount: mcqCount || 0,
        bodyMarkdown: bodyMarkdown || "",
        authoringStatus: authoringStatus || "DRAFT",
        version: version || "1.0",
        authors: authors || [],
        hasDevanagari: hasDevanagari ?? false,
        hasDiagrams: hasDiagrams ?? false,
        hasAudio: hasAudio ?? false,
        lastUpdated: lastUpdated ? new Date(lastUpdated) : null,
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
    res.json({
      success: true,
      data: {
        ...lesson,
        sequenceOrder: lesson.sequence,
        isPublished: lesson.authoringStatus === "PUBLISHED",
      },
    });
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

    // Map frontend field names to schema field names
    const mapped: any = { ...data };
    if ("sequenceOrder" in data) {
      mapped.sequence = Number(data.sequenceOrder);
      delete mapped.sequenceOrder;
    }
    if ("isPublished" in data) {
      mapped.authoringStatus = data.isPublished ? "PUBLISHED" : "DRAFT";
      delete mapped.isPublished;
    }
    // Map legacy lessonType values to schema enum values
    if ("lessonType" in data) {
      const typeMap: Record<string, string> = {
        THEORY: "CONCEPTUAL",
        PRACTICE: "CALCULATIVE",
        QUIZ: "CONCEPTUAL",
        CASE_STUDY: "CASE_STUDY",
      };
      if (typeMap[data.lessonType]) {
        mapped.lessonType = typeMap[data.lessonType];
      }
    }
    // Handle contentJson by storing as bodyMarkdown if no bodyMarkdown provided
    if ("contentJson" in data && !mapped.bodyMarkdown) {
      mapped.bodyMarkdown = JSON.stringify(data.contentJson);
      delete mapped.contentJson;
    }

    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: mapped,
    });
    void publishContentUpdated({
      contentType: "lesson",
      contentId: lesson.id,
      lessonSlug: lesson.slug,
      correlationId: req.requestId,
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
    const deletedLessonId = req.params.id;
    await prisma.lesson.delete({ where: { id: deletedLessonId } });
    void publishContentDeleted({
      contentType: "lesson",
      contentId: deletedLessonId,
      correlationId: req.requestId,
    });
    res.json({ success: true, message: "Lesson deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete lesson");
    res.status(500).json({ success: false, error: "Failed to delete lesson" });
  }
});

// ===================== LESSON SECTIONS =====================

// GET /api/v1/learn/admin/lessons/:id/sections
router.get("/lessons/:id/sections", async (req: AdminRequest, res) => {
  try {
    const sections = await prisma.lessonSection.findMany({ take: 250, 
      where: { lessonId: req.params.id },
      orderBy: { sectionNumber: "asc" },
    });
    res.json({ success: true, data: sections });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch lesson sections");
    res.status(500).json({ success: false, error: "Failed to fetch lesson sections" });
  }
});

// POST /api/v1/learn/admin/lessons/:id/sections
router.post("/lessons/:id/sections", async (req: AdminRequest, res) => {
  try {
    const { sectionNumber, sectionTitle, sectionType, content } = req.body;
    if (!sectionNumber || !sectionTitle || !sectionType) {
      return res.status(400).json({ success: false, error: "sectionNumber, sectionTitle, sectionType are required" });
    }
    const section = await prisma.lessonSection.create({
      data: {
        lessonId: req.params.id,
        sectionNumber: Number(sectionNumber),
        sectionTitle,
        sectionType,
        content: content || "",
      },
    });
    res.status(201).json({ success: true, data: section });
  } catch (err) {
    logger.error({ err }, "Admin: failed to create lesson section");
    res.status(500).json({ success: false, error: "Failed to create lesson section" });
  }
});

// PATCH /api/v1/learn/admin/sections/:id
router.patch("/sections/:id", async (req: AdminRequest, res) => {
  try {
    const { sectionNumber, sectionTitle, sectionType, content } = req.body;
    const section = await prisma.lessonSection.update({
      where: { id: req.params.id },
      data: { sectionNumber: sectionNumber !== undefined ? Number(sectionNumber) : undefined, sectionTitle, sectionType, content },
    });
    void publishContentUpdated({
      contentType: "section",
      contentId: section.id,
      correlationId: req.requestId,
    });
    res.json({ success: true, data: section });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update lesson section");
    res.status(500).json({ success: false, error: "Failed to update lesson section" });
  }
});

// DELETE /api/v1/learn/admin/sections/:id
router.delete("/sections/:id", async (req: AdminRequest, res) => {
  try {
    const deletedSectionId = req.params.id;
    await prisma.lessonSection.delete({ where: { id: deletedSectionId } });
    void publishContentDeleted({
      contentType: "section",
      contentId: deletedSectionId,
      correlationId: req.requestId,
    });
    res.json({ success: true, message: "Section deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete lesson section");
    res.status(500).json({ success: false, error: "Failed to delete lesson section" });
  }
});

// ===================== QUIZ / MCQ BANK =====================

// GET /api/v1/learn/admin/lessons/:id/quiz
router.get("/lessons/:id/quiz", async (req: AdminRequest, res) => {
  try {
    const bank = await prisma.mcqBank.findUnique({ where: { lessonId: req.params.id } });
    if (!bank) return res.json({ success: true, data: { lessonId: req.params.id, questions: [], schemaVersion: "1.0" } });
    res.json({ success: true, data: bank });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch quiz");
    res.status(500).json({ success: false, error: "Failed to fetch quiz" });
  }
});

// PUT /api/v1/learn/admin/lessons/:id/quiz
router.put("/lessons/:id/quiz", async (req: AdminRequest, res) => {
  try {
    const { quiz } = req.body;
    const lessonId = req.params.id;
    const bank = await prisma.mcqBank.upsert({
      where: { lessonId },
      create: { lessonId, questions: quiz || [], schemaVersion: "1.0" },
      update: { questions: quiz || [] },
    });
    // Update lesson mcqCount
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { mcqCount: (quiz || []).length },
    });
    res.json({ success: true, data: bank });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update quiz");
    res.status(500).json({ success: false, error: "Failed to update quiz" });
  }
});

// POST /api/v1/learn/admin/lessons/:id/quiz/questions
router.post("/lessons/:id/quiz/questions", async (req: AdminRequest, res) => {
  try {
    const lessonId = req.params.id;
    const question = req.body;
    const bank = await prisma.mcqBank.findUnique({ where: { lessonId } });
    const questions = (bank?.questions as any[]) || [];
    question.id = question.id || generateId();
    questions.push(question);
    const updated = await prisma.mcqBank.upsert({
      where: { lessonId },
      create: { lessonId, questions, schemaVersion: "1.0" },
      update: { questions },
    });
    await prisma.lesson.update({ where: { id: lessonId }, data: { mcqCount: questions.length } });
    res.status(201).json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to add quiz question");
    res.status(500).json({ success: false, error: "Failed to add quiz question" });
  }
});

// PATCH /api/v1/learn/admin/lessons/:id/quiz/questions/:qid
router.patch("/lessons/:id/quiz/questions/:qid", async (req: AdminRequest, res) => {
  try {
    const lessonId = req.params.id;
    const qid = req.params.qid;
    const bank = await prisma.mcqBank.findUnique({ where: { lessonId } });
    if (!bank) return res.status(404).json({ success: false, error: "Quiz not found" });
    const questions = (bank.questions as any[]).map((q: any) => (q.id === qid ? { ...q, ...req.body } : q));
    const updated = await prisma.mcqBank.update({
      where: { lessonId },
      data: { questions },
    });
    void publishContentUpdated({
      contentType: "mcq",
      contentId: qid,
      correlationId: req.requestId,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update quiz question");
    res.status(500).json({ success: false, error: "Failed to update quiz question" });
  }
});

// DELETE /api/v1/learn/admin/lessons/:id/quiz/questions/:qid
router.delete("/lessons/:id/quiz/questions/:qid", async (req: AdminRequest, res) => {
  try {
    const lessonId = req.params.id;
    const qid = req.params.qid;
    const bank = await prisma.mcqBank.findUnique({ where: { lessonId } });
    if (!bank) return res.status(404).json({ success: false, error: "Quiz not found" });
    const questions = (bank.questions as any[]).filter((q: any) => q.id !== qid);
    const updated = await prisma.mcqBank.update({
      where: { lessonId },
      data: { questions },
    });
    await prisma.lesson.update({ where: { id: lessonId }, data: { mcqCount: questions.length } });
    void publishContentDeleted({
      contentType: "mcq",
      contentId: qid,
      correlationId: req.requestId,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete quiz question");
    res.status(500).json({ success: false, error: "Failed to delete quiz question" });
  }
});

// ===================== BADGES =====================

// GET /api/v1/learn/admin/badges
router.get("/badges", async (req: AdminRequest, res) => {
  try {
    const badges = await prisma.badgeDefinition.findMany({ take: 250,  orderBy: { createdAt: "desc" } });
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
      prisma.lesson.findMany({ take: 250,  select: { id: true, title: true } }),
      prisma.module.findMany({ take: 250,  select: { id: true, title: true } }),
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
      prisma.lessonProgress.findMany({ take: 250,  where: { userId }, orderBy: { lastAttemptedAt: "desc" } }),
      prisma.moduleProgress.findMany({ take: 250,  where: { userId }, orderBy: { completedAt: "desc" } }),
      prisma.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.userBadge.findMany({ take: 250,  where: { userId }, include: { badge: true } }),
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

// Old import endpoint removed as it's replaced by /webhook/github/curriculum at the top

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

// GET /api/v1/learn/admin/bibliography/:id
router.get("/bibliography/:id", async (req: AdminRequest, res) => {
  try {
    const entry = await prisma.bibliographyEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ success: false, error: "Entry not found" });
    res.json({ success: true, data: entry });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch bibliography entry");
    res.status(500).json({ success: false, error: "Failed to fetch bibliography entry" });
  }
});

// DELETE /api/v1/learn/admin/bibliography/:id
router.delete("/bibliography/:id", async (req: AdminRequest, res) => {
  try {
    await prisma.bibliographyEntry.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Bibliography entry deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete bibliography entry");
    res.status(500).json({ success: false, error: "Failed to delete bibliography entry" });
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

// ===================== INTERACTIVE COMPONENTS =====================

// GET /api/v1/learn/admin/interactive-components
router.get("/interactive-components", async (req: AdminRequest, res) => {
  try {
    const { family, status } = req.query;
    const where: any = {};
    if (family) where.family = family;
    if (status) where.status = status;
    const components = await prisma.interactiveComponent.findMany({ take: 250, 
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: components });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch interactive components");
    res.status(500).json({ success: false, error: "Failed to fetch interactive components" });
  }
});

// POST /api/v1/learn/admin/interactive-components
router.post("/interactive-components", async (req: AdminRequest, res) => {
  try {
    const { slug, title, family, tierCompatibility, status, specFile, astroEngineEndpoints } = req.body;
    if (!slug || !title || !family) {
      return res.status(400).json({ success: false, error: "slug, title, family are required" });
    }
    const component = await prisma.interactiveComponent.create({
      data: {
        slug,
        title,
        family,
        tierCompatibility: tierCompatibility || "Both",
        status: status || "SPEC_ONLY",
        specFile: specFile || null,
        astroEngineEndpoints: astroEngineEndpoints || [],
      },
    });
    res.status(201).json({ success: true, data: component });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return res.status(409).json({ success: false, error: "Component slug already exists" });
    }
    logger.error({ err }, "Admin: failed to create interactive component");
    res.status(500).json({ success: false, error: "Failed to create interactive component" });
  }
});

// GET /api/v1/learn/admin/interactive-components/:id
router.get("/interactive-components/:id", async (req: AdminRequest, res) => {
  try {
    const component = await prisma.interactiveComponent.findUnique({
      where: { id: req.params.id },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!component) return res.status(404).json({ success: false, error: "Component not found" });
    res.json({ success: true, data: component });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch interactive component");
    res.status(500).json({ success: false, error: "Failed to fetch interactive component" });
  }
});

// PATCH /api/v1/learn/admin/interactive-components/:id
router.patch("/interactive-components/:id", async (req: AdminRequest, res) => {
  try {
    const { title, family, tierCompatibility, status, specFile, astroEngineEndpoints } = req.body;
    const component = await prisma.interactiveComponent.update({
      where: { id: req.params.id },
      data: { title, family, tierCompatibility, status, specFile, astroEngineEndpoints },
    });
    void publishContentUpdated({
      contentType: "interactive",
      contentId: component.id,
      correlationId: req.requestId,
    });
    res.json({ success: true, data: component });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update interactive component");
    res.status(500).json({ success: false, error: "Failed to update interactive component" });
  }
});

// DELETE /api/v1/learn/admin/interactive-components/:id
router.delete("/interactive-components/:id", async (req: AdminRequest, res) => {
  try {
    const deletedComponentId = req.params.id;
    await prisma.interactiveComponent.delete({ where: { id: deletedComponentId } });
    void publishContentDeleted({
      contentType: "interactive",
      contentId: deletedComponentId,
      correlationId: req.requestId,
    });
    res.json({ success: true, message: "Interactive component deleted" });
  } catch (err) {
    logger.error({ err }, "Admin: failed to delete interactive component");
    res.status(500).json({ success: false, error: "Failed to delete interactive component" });
  }
});

// ===================== IMPORT PREVIEW =====================

// GET /api/v1/learn/admin/import/preview
router.get("/import/preview", async (req: AdminRequest, res) => {
  try {
    const stats = {
      tiers: await prisma.tier.count(),
      modules: await prisma.module.count(),
      chapters: await prisma.chapter.count(),
      lessons: await prisma.lesson.count(),
      mcqBanks: await prisma.mcqBank.count(),
      lessonSections: await prisma.lessonSection.count(),
      bibliographyEntries: await prisma.bibliographyEntry.count(),
      interactiveComponents: await prisma.interactiveComponent.count(),
      badgeDefinitions: await prisma.badgeDefinition.count(),
    };
    res.json({ success: true, data: { status: "ready", stats } });
  } catch (err) {
    logger.error({ err }, "Admin: failed to fetch import preview");
    res.status(500).json({ success: false, error: "Failed to fetch import preview" });
  }
});

export { router as adminRoutes };
