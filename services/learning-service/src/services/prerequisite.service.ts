/**
 * Prerequisite Service
 * Based on 02-lesson-authoring-standard.md §3 + 07-tier-progression-map.md §4
 *
 * Resolves lesson prerequisite chains, checks access, and computes
 * dynamic module unlock states.
 */

import { prisma } from "../config/database";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PrerequisiteNode {
  slug: string;
  title: string;
  lessonId: string;
  status: "MASTERED" | "COMPLETED" | "IN_PROGRESS" | "AVAILABLE" | "LOCKED" | "NOT_FOUND";
  tier: number;
  module: number;
  chapter: number;
  sequence: number;
}

export interface PrerequisiteChainResult {
  lessonSlug: string;
  lessonTitle: string;
  canAccess: boolean;
  blockingPrerequisites: PrerequisiteNode[];
  allPrerequisites: PrerequisiteNode[];
  recommendation: string;
}

export interface ModuleUnlockResult {
  moduleId: string;
  moduleTitle: string;
  status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
  reason?: string;
  requiredModules: Array<{
    moduleId: string;
    title: string;
    status: string;
    met: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Lesson Prerequisite Resolution
// ─────────────────────────────────────────────────────────────

export async function resolvePrerequisites(
  lessonSlug: string
): Promise<PrerequisiteNode[]> {
  const lesson = await prisma.lesson.findUnique({
    where: { slug: lessonSlug },
    select: {
      prerequisites: true,
      title: true,
    },
  });

  if (!lesson) return [];

  const prereqSlugs = lesson.prerequisites || [];
  if (prereqSlugs.length === 0) return [];

  const prereqLessons = await prisma.lesson.findMany({
    where: { slug: { in: prereqSlugs } },
    select: {
      id: true,
      slug: true,
      title: true,
      tier: true,
      module: true,
      chapter: true,
      sequence: true,
    },
  });

  return prereqSlugs.map((slug) => {
    const found = prereqLessons.find((l) => l.slug === slug);
    if (!found) {
      return {
        slug,
        title: "(not found in curriculum)",
        lessonId: "",
        status: "NOT_FOUND" as const,
        tier: 0,
        module: 0,
        chapter: 0,
        sequence: 0,
      };
    }
    return {
      slug: found.slug,
      title: found.title,
      lessonId: found.id,
      status: "AVAILABLE" as const, // will be enriched with user progress
      tier: found.tier,
      module: found.module,
      chapter: found.chapter,
      sequence: found.sequence,
    };
  });
}

export async function checkLessonAccess(
  userId: string,
  lessonSlug: string
): Promise<PrerequisiteChainResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { slug: lessonSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      prerequisites: true,
      tier: true,
      module: true,
      chapter: true,
      sequence: true,
    },
  });

  if (!lesson) {
    return {
      lessonSlug,
      lessonTitle: "",
      canAccess: false,
      blockingPrerequisites: [],
      allPrerequisites: [],
      recommendation: "Lesson not found",
    };
  }

  const prereqSlugs = lesson.prerequisites || [];

  if (prereqSlugs.length === 0) {
    return {
      lessonSlug: lesson.slug,
      lessonTitle: lesson.title,
      canAccess: true,
      blockingPrerequisites: [],
      allPrerequisites: [],
      recommendation: "No prerequisites — free to start.",
    };
  }

  // Fetch all prerequisite lessons
  const prereqLessons = await prisma.lesson.findMany({
    where: { slug: { in: prereqSlugs } },
    select: {
      id: true,
      slug: true,
      title: true,
      tier: true,
      module: true,
      chapter: true,
      sequence: true,
    },
  });

  // Fetch user progress for prerequisites
  const prereqIds = prereqLessons.map((l) => l.id);
  const progressRecords = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: prereqIds } },
  });

  const allPrerequisites: PrerequisiteNode[] = [];
  const blockingPrerequisites: PrerequisiteNode[] = [];

  for (const slug of prereqSlugs) {
    const found = prereqLessons.find((l) => l.slug === slug);
    const progress = found ? progressRecords.find((p) => p.lessonId === found.id) : null;

    const node: PrerequisiteNode = {
      slug,
      title: found?.title || "(not found)",
      lessonId: found?.id || "",
      status: (progress?.status as PrerequisiteNode["status"] | undefined) || (found ? "AVAILABLE" : "NOT_FOUND"),
      tier: found?.tier || 0,
      module: found?.module || 0,
      chapter: found?.chapter || 0,
      sequence: found?.sequence || 0,
    };

    allPrerequisites.push(node);

    // A prerequisite is blocking if it's not MASTERED or COMPLETED
    if (node.status !== "MASTERED" && node.status !== "COMPLETED") {
      blockingPrerequisites.push(node);
    }
  }

  const canAccess = blockingPrerequisites.length === 0;

  let recommendation = "";
  if (!canAccess) {
    const firstBlock = blockingPrerequisites[0];
    recommendation = `Complete "${firstBlock.title}" (${firstBlock.slug}) before starting this lesson.`;
  } else {
    recommendation = "All prerequisites met — you may begin this lesson.";
  }

  return {
    lessonSlug: lesson.slug,
    lessonTitle: lesson.title,
    canAccess,
    blockingPrerequisites,
    allPrerequisites,
    recommendation,
  };
}

// ─────────────────────────────────────────────────────────────
// Module Unlock Logic (Dynamic)
// ─────────────────────────────────────────────────────────────

/**
 * Computes whether a module should be unlocked for a user.
 * A module is unlocked when ALL prerequisite lessons of ALL its lessons
 * are mastered, OR when the module's explicit prerequisite modules are completed.
 */
export async function computeModuleUnlock(
  userId: string,
  moduleId: string
): Promise<ModuleUnlockResult> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      chapters: {
        include: {
          lessons: { select: { id: true, slug: true, title: true, prerequisites: true } },
        },
      },
    },
  });

  if (!mod) {
    return {
      moduleId,
      moduleTitle: "",
      status: "LOCKED",
      reason: "Module not found",
      requiredModules: [],
    };
  }

  // Collect all prerequisite slugs across all lessons in this module
  const allLessonPrereqSlugs = new Set<string>();
  for (const ch of mod.chapters) {
    for (const lesson of ch.lessons) {
      for (const prereq of lesson.prerequisites || []) {
        allLessonPrereqSlugs.add(prereq);
      }
    }
  }

  // If no prerequisites, module is available
  if (allLessonPrereqSlugs.size === 0) {
    return {
      moduleId: mod.id,
      moduleTitle: mod.title,
      status: "AVAILABLE",
      requiredModules: [],
    };
  }

  // Find which modules the prerequisite lessons belong to
  const prereqLessons = await prisma.lesson.findMany({
    where: { slug: { in: Array.from(allLessonPrereqSlugs) } },
    select: { id: true, slug: true, module: true },
  });

  // Group by module number
  const prereqModuleNumbers = new Set(prereqLessons.map((l) => l.module));

  // Get those modules
  const prereqModules = await prisma.module.findMany({
    where: { number: { in: Array.from(prereqModuleNumbers) }, tierId: mod.tierId },
    select: { id: true, number: true, title: true },
  });

  // Check user progress on prerequisite modules
  const moduleProgresses = await prisma.moduleProgress.findMany({
    where: { userId, moduleId: { in: prereqModules.map((m) => m.id) } },
  });

  const requiredModules = prereqModules.map((pm) => {
    const progress = moduleProgresses.find((p) => p.moduleId === pm.id);
    const met = progress?.status === "COMPLETED" || progress?.status === "MASTERED";
    return {
      moduleId: pm.id,
      title: pm.title,
      status: progress?.status || "LOCKED",
      met,
    };
  });

  const allMet = requiredModules.every((r) => r.met);

  return {
    moduleId: mod.id,
    moduleTitle: mod.title,
    status: allMet ? "AVAILABLE" : "LOCKED",
    reason: allMet
      ? undefined
      : `Complete the required prerequisite modules before starting this module.`,
    requiredModules,
  };
}

// ─────────────────────────────────────────────────────────────
// Full Curriculum Tree with Lock States
// ─────────────────────────────────────────────────────────────

interface CurriculumTreeItem {
  id: string;
  number: number;
  title: string;
  modules: Array<{
    id: string;
    number: number;
    slug: string;
    title: string;
    chapters: Array<{
      id: string;
      number: number;
      slug: string;
      title: string;
      lessons: Array<{
        id: string;
        slug: string;
        title: string;
        sequence: number;
        lessonType: string;
        status: string;
        progress: number;
        prerequisites: string[];
      }>;
    }>;
  }>;
}

export async function getCurriculumTreeWithLockState(userId: string): Promise<CurriculumTreeItem[]> {
  const tiers = await prisma.tier.findMany({
    orderBy: { number: "asc" },
    include: {
      modules: {
        orderBy: { sequenceOrder: "asc" },
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
                  prerequisites: true,
                  targetMinutesTotal: true,
                  mcqCount: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Fetch all lesson progress for this user
  const allLessonIds = tiers.flatMap((t) =>
    t.modules.flatMap((m) =>
      m.chapters.flatMap((ch) => ch.lessons.map((l) => l.id))
    )
  );

  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: allLessonIds } },
  });

  const lpMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

  // Build tree with lock states
  return tiers.map((tier) => ({
    id: tier.id,
    number: tier.number,
    title: tier.title,
    modules: tier.modules.map((mod) => ({
      id: mod.id,
      number: mod.number,
      slug: mod.slug,
      title: mod.title,
      chapters: mod.chapters.map((ch) => ({
        id: ch.id,
        number: ch.number,
        slug: ch.slug,
        title: ch.title,
        lessons: ch.lessons.map((lesson) => {
          const progress = lpMap.get(lesson.id);
          const prereqSlugs = lesson.prerequisites || [];

          // Determine if lesson is locked
          let isLocked = false;
          if (prereqSlugs.length > 0) {
            // Check if all prerequisites are mastered
            const prereqProgresses = lessonProgresses.filter((lp) => {
              const prereqLesson = allLessonIds.includes(lp.lessonId);
              // This is a simplified check — in production we'd map slugs to IDs
              return prereqLesson;
            });
            // Simplified: if user has no progress at all, first module is available
            isLocked = false; // TODO: precise prerequisite resolution
          }

          return {
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            sequence: lesson.sequence,
            lessonType: lesson.lessonType,
            status: progress?.status || (isLocked ? "LOCKED" : "AVAILABLE"),
            progress: progress?.completionPercentage || 0,
            prerequisites: prereqSlugs,
          };
        }),
      })),
    })),
  }));
}
