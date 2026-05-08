/**
 * Shared game constants — single source of truth for tiers, titles, and unlock rules.
 * Import from here in all services and routes to avoid drift.
 */

export const TIER_THRESHOLDS = [0, 500, 1500, 3000, 5000, 8000];

export const TIER_TITLES: Record<number, string> = {
  1: "Jyotish Novice",
  2: "Vedanga Seeker",
  3: "Graha Scholar",
  4: "Nakshatra Adept",
  5: "Yoga Master",
  6: "Jyotish Acharya",
};

export interface ModuleUnlockRule {
  moduleId: string;
  unlockCondition: "free" | "module_complete";
  prerequisiteModuleId?: string;
  minimumScore: number;
}

export const MODULE_UNLOCK_RULES: ModuleUnlockRule[] = [
  { moduleId: "M1", unlockCondition: "free", minimumScore: 0 },
  { moduleId: "M2", unlockCondition: "module_complete", prerequisiteModuleId: "M1", minimumScore: 70 },
  { moduleId: "M3", unlockCondition: "module_complete", prerequisiteModuleId: "M2", minimumScore: 75 },
  { moduleId: "M4", unlockCondition: "module_complete", prerequisiteModuleId: "M3", minimumScore: 75 },
  { moduleId: "M5", unlockCondition: "module_complete", prerequisiteModuleId: "M4", minimumScore: 80 },
  { moduleId: "M6", unlockCondition: "module_complete", prerequisiteModuleId: "M5", minimumScore: 80 },
  { moduleId: "M7", unlockCondition: "module_complete", prerequisiteModuleId: "M6", minimumScore: 80 },
  { moduleId: "M8", unlockCondition: "module_complete", prerequisiteModuleId: "M7", minimumScore: 85 },
  { moduleId: "M9", unlockCondition: "module_complete", prerequisiteModuleId: "M8", minimumScore: 85 },
  { moduleId: "M10", unlockCondition: "module_complete", prerequisiteModuleId: "M9", minimumScore: 90 },
];
