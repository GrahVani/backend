/**
 * Milestone Service
 * Transforms badges into useful progress milestones.
 * Each milestone shows: current progress / target, and % complete.
 * Removes decorative fluff — only keeps achievable, meaningful goals.
 */

import { prisma } from "../config/database";

export interface Milestone {
  badgeCode: string;
  name: string;
  description: string;
  rarity: string;
  iconUrl: string | null;
  pointsReward: number;
  earned: boolean;
  earnedAt?: Date;
  progress: { current: number; target: number; percent: number };
}

export async function getMilestones(userId: string): Promise<{ earned: Milestone[]; upcoming: Milestone[] }> {
  const [earnedBadges, allDefinitions, profile] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    }),
    prisma.badgeDefinition.findMany(),
    prisma.userLearningProfile.findUnique({ where: { userId } }),
  ]);

  const earnedMap = new Map(earnedBadges.map((eb) => [eb.badge.badgeCode, eb]));

  // Fetch aggregates once for efficiency
  const [completedLessons, perfectLessons, allModuleProgress, totalModules] = await Promise.all([
    prisma.lessonProgress.count({ where: { userId, status: "completed" } }),
    prisma.lessonProgress.count({ where: { userId, score: 100 } }),
    prisma.moduleProgress.findMany({ where: { userId } }),
    prisma.course.count({ where: { isPublished: true } }),
  ]);

  const streak = profile?.currentStreak || 0;

  const milestones: Milestone[] = [];

  for (const def of allDefinitions) {
    const conditions = def.unlockConditions as any;
    let progress: { current: number; target: number; percent: number } = { current: 0, target: 1, percent: 0 };
    let earned = earnedMap.has(def.badgeCode);

    switch (conditions?.type) {
      case "lesson_complete": {
        progress = { current: completedLessons, target: conditions.count || 1, percent: 0 };
        break;
      }
      case "streak": {
        progress = { current: streak, target: conditions.length || 5, percent: 0 };
        break;
      }
      case "perfect_lesson": {
        progress = { current: perfectLessons, target: conditions.count || 1, percent: 0 };
        break;
      }
      case "module_score": {
        if (conditions.moduleId) {
          const mp = allModuleProgress.find((m) => m.moduleId === conditions.moduleId);
          const score = mp?.averageLessonScore || 0;
          progress = { current: score, target: conditions.minScore || 90, percent: 0 };
        } else {
          const best = allModuleProgress
            .filter((m) => m.status === "completed")
            .map((m) => m.averageLessonScore || 0);
          const maxScore = best.length > 0 ? Math.max(...best) : 0;
          progress = { current: maxScore, target: conditions.minScore || 90, percent: 0 };
        }
        break;
      }
      case "all_modules": {
        const completed = allModuleProgress.filter((m) => m.status === "completed" && (m.averageLessonScore || 0) >= (conditions.minScore || 90)).length;
        progress = { current: completed, target: totalModules, percent: 0 };
        break;
      }
      default: {
        // For uncheckable types, mark as decorative and skip progress
        progress = { current: earned ? 1 : 0, target: 1, percent: earned ? 100 : 0 };
      }
    }

    progress.percent = progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

    milestones.push({
      badgeCode: def.badgeCode,
      name: def.name,
      description: def.description,
      rarity: def.rarity || "COMMON",
      iconUrl: def.iconUrl,
      pointsReward: def.pointsReward,
      earned,
      earnedAt: earnedMap.get(def.badgeCode)?.earnedAt,
      progress,
    });
  }

  // Sort: earned first, then by progress % desc, then by rarity
  const earned = milestones.filter((m) => m.earned);
  const upcoming = milestones
    .filter((m) => !m.earned)
    .sort((a, b) => b.progress.percent - a.progress.percent);

  return { earned, upcoming };
}
