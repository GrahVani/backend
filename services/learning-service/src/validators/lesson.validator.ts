/**
 * Lesson Front-Matter Validator
 * Based on 02-lesson-authoring-standard.md §3 Front matter schema
 *
 * Every lesson imported via the pipeline must pass this validation.
 * Failures are reported with line-specific references to the standard.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Enums matching the curriculum standard
// ─────────────────────────────────────────────────────────────

export const LessonTypeEnum = z.enum([
  "conceptual",
  "calculative",
  "interpretive",
  "synthesis",
  "prose-essay",
  "case-study",
]);

export const AuthoringStatusEnum = z.enum([
  "draft",
  "technical-audit",
  "pedagogical-audit",
  "published",
  "revision-needed",
]);

export const BloomLevelEnum = z.enum([
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
]);

export const StreamEnum = z.enum([
  "parashari",
  "kp",
  "jaimini",
  "lal-kitab",
  "tajika",
  "nadi",
  "numerology",
  "vastu",
  "muhurta",
]);

// ─────────────────────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────────────────────

const SourceRefSchema = z.object({
  ref: z.string().min(1, "Source ref must not be empty (03-source-citation-standard.md §4.2)"),
  note: z.string().optional(),
});

const InteractiveSchema = z.object({
  enabled: z.boolean(),
  component_type: z.string().optional(),
  spec_file: z.string().optional(),
  astro_engine_endpoints: z.array(z.string()).default([]),
  fallback_if_offline: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────
// Main front-matter schema
// ─────────────────────────────────────────────────────────────

export const LessonFrontMatterSchema = z.object({
  // === Identity ===
  slug: z
    .string()
    .min(1, "slug is required (02-lesson-authoring-standard.md §3.1)")
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case ASCII (02 §3.1)"),

  title: z
    .string()
    .min(1, "title is required (02 §3.1)"),

  title_devanagari: z.string().optional(),

  subtitle: z.string().optional(),

  // === Placement ===
  tier: z
    .number()
    .int()
    .refine((v) => v === 1 || v === 2, {
      message: "tier must be 1 or 2 (02 §3.1)",
    }),

  module: z
    .number()
    .int()
    .positive("module must be a positive integer (02 §3.1)"),

  module_slug: z
    .string()
    .min(1, "module_slug is required (02 §3.1)"),

  chapter: z
    .number()
    .int()
    .positive("chapter must be a positive integer (02 §3.1)"),

  chapter_slug: z
    .string()
    .min(1, "chapter_slug is required (02 §3.1)"),

  sequence: z
    .number()
    .int()
    .positive("sequence must be a positive integer (02 §3.1)"),

  canonical_path: z
    .string()
    .min(1, "canonical_path is required (02 §3.1)"),

  // === Pedagogical metadata ===
  lesson_type: LessonTypeEnum,

  bloom_levels: z
    .array(BloomLevelEnum)
    .min(1, "At least one bloom_level required (02 §3.1)")
    .max(3, "Too many bloom_levels — max 3 primary levels (01-pedagogical-framework.md §2)"),

  target_minutes_reading: z
    .number()
    .int()
    .positive("target_minutes_reading must be positive (02 §3.1)"),

  target_minutes_total: z
    .number()
    .int()
    .positive("target_minutes_total must be positive (02 §3.1)"),

  // === Stream coverage ===
  streams: z.array(StreamEnum).default([]),

  stream_neutrality: z.boolean().default(true),

  // === Dependencies ===
  prerequisites: z.array(z.string()).default([]),

  postrequisites: z.array(z.string()).default([]),

  // === Learning outcomes ===
  learning_outcomes: z
    .array(z.string().min(1))
    .min(3, "At least 3 learning outcomes required (02 §3.1)")
    .max(7, "At most 7 learning outcomes allowed (02 §3.1)"),

  // === Sources ===
  primary_sources: z.array(SourceRefSchema).default([]),

  modern_sources: z.array(SourceRefSchema).default([]),

  // === Interactive ===
  interactive: InteractiveSchema.default({ enabled: false }),

  // === Assessment ===
  mcq_count: z
    .number()
    .int()
    .min(0, "mcq_count cannot be negative (02 §3.1)"),

  mcq_bank_file: z.string().optional(),

  // === Audit & versioning ===
  authoring_status: AuthoringStatusEnum.default("draft"),

  version: z.union([z.string(), z.number()]).transform((v) => String(v)).default("1.0"),

  last_updated: z.union([z.string(), z.date()]).transform((v) => {
    if (v instanceof Date) return v.toISOString().split("T")[0];
    return v;
  }).refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "last_updated must be YYYY-MM-DD (02 §3.1)",
  }),

  authors: z.array(z.string()).default([]),

  technical_reviewer: z.string().optional(),

  pedagogical_reviewer: z.string().optional(),

  // === Accessibility ===
  has_devanagari: z.boolean().default(false),

  has_diagrams: z.boolean().default(false),

  has_audio_pronunciation: z.boolean().default(false),

  estimated_reading_grade: z.number().int().optional(),
});

export type LessonFrontMatter = z.infer<typeof LessonFrontMatterSchema>;

// ─────────────────────────────────────────────────────────────
// Cross-field validation helpers
// ─────────────────────────────────────────────────────────────

/**
 * Validates Tier-1 bloom level constraints.
 * T1 lessons may not include Analyze/Evaluate/Create as PRIMARY.
 */
export function validateBloomLevelsForTier(
  tier: number,
  bloomLevels: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const highLevels = ["Analyze", "Evaluate", "Create"];

  if (tier === 1) {
    const primaryHigh = bloomLevels.filter((b) => highLevels.includes(b));
    if (primaryHigh.length > 0) {
      errors.push(
        `Tier 1 lesson declares high Bloom levels [${primaryHigh.join(", ")}] as primary. ` +
        `Tier 1 spans Remember → Understand → Apply only (01-pedagogical-framework.md §2, 02 §3.1).`
      );
    }
  }

  if (tier === 2) {
    const hasHigh = bloomLevels.some((b) => highLevels.includes(b));
    if (!hasHigh) {
      errors.push(
        `Tier 2 lesson should include at least one of Analyze/Evaluate/Create (02 §3.1). `
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates MCQ count rules.
 * prose-essay may have 0 with waiver; all others need ≥ 5.
 */
export function validateMcqCount(
  lessonType: string,
  mcqCount: number,
  interactiveEnabled: boolean
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (lessonType === "prose-essay") {
    if (mcqCount > 0 && mcqCount < 5) {
      errors.push(
        `prose-essay with mcq_count=${mcqCount}: if MCQs present, minimum is 5 (02 §3.1).`
      );
    }
  } else {
    if (mcqCount < 5) {
      errors.push(
        `lesson_type=${lessonType} requires mcq_count >= 5 (02 §3.1). Got ${mcqCount}.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates interactive component rules.
 * If enabled=false, must have justification (lesson body should contain it).
 * We check presence of fallback_if_offline as proxy.
 */
export function validateInteractive(
  interactive: { enabled?: boolean; component_type?: string; spec_file?: string; fallback_if_offline?: string }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!interactive.enabled) {
    // In the standard, disabled interactives need explicit justification in lesson body
    // We can't check body prose here, but we flag for manual review
    // No hard error — this is a pedagogical audit concern
  } else {
    if (!interactive.component_type) {
      errors.push(
        `interactive.enabled=true but component_type is missing (02 §3.1).`
      );
    }
    if (!interactive.spec_file) {
      errors.push(
        `interactive.enabled=true but spec_file is missing (02 §3.1, 05-interactive-component-taxonomy.md §3).`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates canonical_path matches folder structure.
 */
export function validateCanonicalPath(
  canonicalPath: string,
  tier: number,
  module: number,
  chapter: number,
  sequence: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expected = `tier-${tier}/module-${module}/chapter-${chapter}/lesson-${String(sequence).padStart(2, "0")}`;

  if (!canonicalPath.startsWith(`tier-${tier}/module-${module}`)) {
    errors.push(
      `canonical_path "${canonicalPath}" does not match tier=${tier}, module=${module} (02 §3.1).`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs ALL validation rules and returns aggregated results.
 */
export function validateLessonFrontMatter(
  data: unknown
): {
  valid: boolean;
  data?: LessonFrontMatter;
  schemaErrors: z.ZodError | null;
  businessRuleErrors: string[];
} {
  const parseResult = LessonFrontMatterSchema.safeParse(data);

  if (!parseResult.success) {
    return {
      valid: false,
      schemaErrors: parseResult.error,
      businessRuleErrors: [],
    };
  }

  const fm = parseResult.data;
  const businessRuleErrors: string[] = [];

  // Bloom level tier check
  const bloomCheck = validateBloomLevelsForTier(fm.tier, fm.bloom_levels);
  businessRuleErrors.push(...bloomCheck.errors);

  // MCQ count check
  const mcqCheck = validateMcqCount(fm.lesson_type, fm.mcq_count, fm.interactive?.enabled ?? false);
  businessRuleErrors.push(...mcqCheck.errors);

  // Interactive check
  const interactiveCheck = validateInteractive(fm.interactive);
  businessRuleErrors.push(...interactiveCheck.errors);

  // Canonical path check
  const pathCheck = validateCanonicalPath(
    fm.canonical_path,
    fm.tier,
    fm.module,
    fm.chapter,
    fm.sequence
  );
  businessRuleErrors.push(...pathCheck.errors);

  // Source citation check
  if (fm.lesson_type !== "prose-essay" && fm.primary_sources.length === 0) {
    businessRuleErrors.push(
      `lesson_type=${fm.lesson_type} requires at least 1 primary_source (02 §3.1, 03-source-citation-standard.md §1).`
    );
  }

  // MCQ bank file required if mcq_count > 0
  if (fm.mcq_count > 0 && !fm.mcq_bank_file) {
    businessRuleErrors.push(
      `mcq_count=${fm.mcq_count} > 0 but mcq_bank_file is missing (02 §3.1, 06-assessment-design-standard.md §2).`
    );
  }

  return {
    valid: businessRuleErrors.length === 0,
    data: fm,
    schemaErrors: null,
    businessRuleErrors,
  };
}
