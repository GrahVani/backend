/**
 * MCQ Bank JSON Validator
 * Based on 06-assessment-design-standard.md §2.1 MCQ schema
 *
 * Validates every question in an assessment-bank JSON file.
 */

import { z } from "zod";

export const QuestionTypeEnum = z.enum([
  "single-best",
  "multi-select",
  "true-false-with-reason",
  "match",
  "order",
  "fill-blank",
]);

export const DifficultyEnum = z.enum(["easy", "medium", "hard"]);

export const BloomLevelEnum = z.enum([
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
]);

const SourceRefSchema = z.object({
  ref: z.string().min(1),
  note: z.string().optional(),
});

const OptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Option text must not be empty (06 §2.1)"),
  is_correct: z.boolean(),
  explanation: z
    .string()
    .min(10, "Every option explanation must be ≥ 10 chars (06 §5)"),
});

const SpacedRepetitionSchema = z.object({
  include_in_sr_deck: z.boolean().default(false),
  sr_card_front: z.string().optional(),
  sr_card_back: z.string().optional(),
});

const AuthoringSchema = z.object({
  version: z.string().default("1.0"),
  author: z.string().min(1),
  reviewer: z.string().optional(),
  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1, "Question id is required (06 §2.1)"),
  // These fields may be present at bank-level instead of per-question
  lesson_slug: z.string().min(1).optional(),
  module_slug: z.string().min(1).optional(),
  tier: z.number().int().refine((v) => v === 1 || v === 2).optional(),

  question_type: QuestionTypeEnum,

  stem: z.string().min(5, "Stem must be substantive (06 §3.1)"),
  stem_devanagari: z.string().nullable().optional(),

  bloom_level: BloomLevelEnum,
  difficulty: DifficultyEnum,

  options: z.array(OptionSchema).min(2, "At least 2 options required (06 §4.3)"),

  primary_sources: z.array(SourceRefSchema).default([]),
  modern_sources: z.array(SourceRefSchema).default([]),

  tags: z.array(z.string()).default([]),

  spaced_repetition: SpacedRepetitionSchema.optional(),

  authoring: AuthoringSchema.optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

export const McqBankSchema = z.object({
  lesson_slug: z.string().min(1),
  lesson_canonical_path: z.string().optional(),
  module_slug: z.string().min(1),
  tier: z.number().int(),
  schema_version: z.string().default("1.0"),
  authoring: z.object({
    version: z.string(),
    author: z.string(),
    reviewer: z.string().optional(),
    last_updated: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  questions: z.array(QuestionSchema),
});

export type McqBank = z.infer<typeof McqBankSchema>;

// ─────────────────────────────────────────────────────────────
// Business-rule validations beyond schema
// ─────────────────────────────────────────────────────────────

export interface McqValidationResult {
  valid: boolean;
  schemaErrors: z.ZodError | null;
  businessRuleErrors: string[];
  warnings: string[];
  stats: {
    totalQuestions: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    bloomDistribution: Record<string, number>;
    correctAnswerPositions: Record<string, number>;
    averageOptionLength: number;
  };
}

export function validateMcqBank(data: unknown): McqValidationResult {
  const parseResult = McqBankSchema.safeParse(data);

  if (!parseResult.success) {
    return {
      valid: false,
      schemaErrors: parseResult.error,
      businessRuleErrors: [],
      warnings: [],
      stats: {
        totalQuestions: 0,
        easyCount: 0,
        mediumCount: 0,
        hardCount: 0,
        bloomDistribution: {},
        correctAnswerPositions: {},
        averageOptionLength: 0,
      },
    };
  }

  const bank = parseResult.data;
  const businessRuleErrors: string[] = [];
  const warnings: string[] = [];

  const easyCount = bank.questions.filter((q) => q.difficulty === "easy").length;
  const mediumCount = bank.questions.filter((q) => q.difficulty === "medium").length;
  const hardCount = bank.questions.filter((q) => q.difficulty === "hard").length;

  // Difficulty distribution check (06 §2.3)
  const total = bank.questions.length;
  const easyPct = total > 0 ? (easyCount / total) * 100 : 0;
  const mediumPct = total > 0 ? (mediumCount / total) * 100 : 0;
  const hardPct = total > 0 ? (hardCount / total) * 100 : 0;

  if (easyPct < 20 || easyPct > 50) {
    warnings.push(
      `Easy question ratio is ${easyPct.toFixed(0)}% (target 30-40%). (06 §2.3)`
    );
  }
  if (mediumPct < 30 || mediumPct > 60) {
    warnings.push(
      `Medium question ratio is ${mediumPct.toFixed(0)}% (target 40-50%). (06 §2.3)`
    );
  }
  if (hardPct < 10 || hardPct > 30) {
    warnings.push(
      `Hard question ratio is ${hardPct.toFixed(0)}% (target 15-25%). (06 §2.3)`
    );
  }

  // Per-question validations
  const bloomDistribution: Record<string, number> = {};
  const correctAnswerPositions: Record<string, number> = {};
  let totalOptionLength = 0;
  let totalOptionCount = 0;

  for (const q of bank.questions) {
    // Bloom distribution
    bloomDistribution[q.bloom_level] = (bloomDistribution[q.bloom_level] || 0) + 1;

    // single-best must have exactly 1 correct answer
    if (q.question_type === "single-best") {
      const correctCount = q.options.filter((o) => o.is_correct).length;
      if (correctCount !== 1) {
        businessRuleErrors.push(
          `Question ${q.id}: single-best must have exactly 1 correct answer; found ${correctCount}. (06 §2.2)`
        );
      }
    }

    // multi-select must have 2-3 correct answers
    if (q.question_type === "multi-select") {
      const correctCount = q.options.filter((o) => o.is_correct).length;
      if (correctCount < 2 || correctCount > 3) {
        businessRuleErrors.push(
          `Question ${q.id}: multi-select must have 2-3 correct answers; found ${correctCount}. (06 §2.2)`
        );
      }
    }

    // Track correct answer positions for distribution check
    const correctIdx = q.options.findIndex((o) => o.is_correct);
    if (correctIdx >= 0) {
      const pos = ["A", "B", "C", "D", "E"][correctIdx] || String(correctIdx);
      correctAnswerPositions[pos] = (correctAnswerPositions[pos] || 0) + 1;
    }

    // Option length parity (06 §4.4)
    const lengths = q.options.map((o) => o.text.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    for (let i = 0; i < lengths.length; i++) {
      if (Math.abs(lengths[i] - avgLen) / avgLen > 0.5) {
        warnings.push(
          `Question ${q.id}: option ${q.options[i].id} length (${lengths[i]}) deviates >50% from average (${avgLen.toFixed(0)}). (06 §4.4)`
        );
      }
      totalOptionLength += lengths[i];
      totalOptionCount++;
    }

    // Every option must have explanation (06 §5)
    for (const opt of q.options) {
      if (!opt.explanation || opt.explanation.length < 10) {
        businessRuleErrors.push(
          `Question ${q.id}: option ${opt.id} explanation too short or missing. (06 §5)`
        );
      }
    }
  }

  // Correct answer position distribution (06 §4.5)
  if (total >= 4) {
    for (const [pos, count] of Object.entries(correctAnswerPositions)) {
      const pct = (count / total) * 100;
      if (pct > 40) {
        warnings.push(
          `Correct answer position ${pos} appears ${pct.toFixed(0)}% of the time (target: even distribution). (06 §4.5)`
        );
      }
    }
  }

  return {
    valid: businessRuleErrors.length === 0,
    schemaErrors: null,
    businessRuleErrors,
    warnings,
    stats: {
      totalQuestions: total,
      easyCount,
      mediumCount,
      hardCount,
      bloomDistribution,
      correctAnswerPositions,
      averageOptionLength: totalOptionCount > 0 ? totalOptionLength / totalOptionCount : 0,
    },
  };
}
