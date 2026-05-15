/**
 * Typed JSON field shapes for Prisma models.
 * These replace unsafe `as any` casts throughout the codebase.
 */

// ─────────────────────────────────────────────────────────────
// Quiz / MCQ
// ─────────────────────────────────────────────────────────────

export interface QuizAnswerRecord {
  questionId: string;
  selectedOptionIndex?: number;
  userAnswer: string | string[];
  isCorrect: boolean;
  timeSpentSeconds?: number;
  conceptTags?: string[];
}

export type QuizAnswersJson = QuizAnswerRecord[];

// ─────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────

export type SectionsViewedJson = number[];

// ─────────────────────────────────────────────────────────────
// Interactive Components
// ─────────────────────────────────────────────────────────────

export interface InteractiveEventData {
  inputName?: string;
  inputValue?: string | number | boolean;
  durationSeconds?: number;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────
// Gamification — Badges & Milestones
// ─────────────────────────────────────────────────────────────

export interface UnlockConditionJson {
  type: string;
  count?: number;
  length?: number;
  moduleId?: string;
  minScore?: number;
  concept?: string;
  accuracy?: number;
}

// ─────────────────────────────────────────────────────────────
// Leaderboard raw query result shape
// ─────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  user_id: string;
  total_points: number;
  rank: number;
}
