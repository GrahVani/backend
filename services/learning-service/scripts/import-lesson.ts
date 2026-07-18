#!/usr/bin/env tsx
/**
 * Single-File Lesson Import CLI
 * Usage: npm run import-lesson -- <path/to/lesson.md> [--dry-run] [--force]
 *
 * Based on 02-lesson-authoring-standard.md §3 + §4
 * Validates, lints, and upserts a single lesson into the database.
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import matter from "gray-matter";
import { PrismaClient } from "@prisma/client";
import {
  validateLessonFrontMatter,
  LessonFrontMatter,
} from "../src/validators/lesson.validator";
import { validateMcqBank } from "../src/validators/mcq.validator";
import { lintSections } from "../src/linter/section-linter";
import { publishImportCompleted, disconnectRedisPublisher } from "../src/events/publisher";

const prisma = new PrismaClient();

interface ImportOptions {
  dryRun: boolean;
  force: boolean;
  curriculumRoot: string;
  jobId: string;
}

function printUsage() {
  console.log(`
Usage: npm run import-lesson -- <path/to/lesson.md> [options]

Options:
  --dry-run     Validate only; do not write to database
  --force       Skip non-fatal warnings and import anyway
  --help        Show this help
`);
}

function parseArgs(): { filePath: string; options: ImportOptions } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const filePath = args[0];
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  // Resolve curriculum root relative to this script
  // scriptDir = .../grahvani-backend/services/learning-service/scripts/
  const scriptDir = path.dirname(__filename);
  const curriculumRoot = path.resolve(scriptDir, "..", "..", "..", "..", "curriculum");

  const jobId = randomUUID();
  return { filePath, options: { dryRun, force, curriculumRoot, jobId } };
}

async function resolveTier(tierNumber: number) {
  const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
  if (!tier) {
    throw new Error(
      `Tier ${tierNumber} not found in database. Run 'npm run db:seed' first.`
    );
  }
  return tier;
}

async function resolveModule(tierId: string, moduleNumber: number, moduleSlug: string) {
  let mod = await prisma.module.findFirst({
    where: { tierId, number: moduleNumber },
  });

  if (!mod) {
    // Auto-create module if not exists
    console.log(`  🆕 Creating module ${moduleNumber} (${moduleSlug})...`);
    mod = await prisma.module.create({
      data: {
        tierId,
        number: moduleNumber,
        slug: moduleSlug,
        title: `Module ${moduleNumber}`,
        status: "DRAFT",
        sequenceOrder: moduleNumber,
      },
    });
  }

  return mod;
}

async function resolveChapter(moduleId: string, chapterNumber: number, chapterSlug: string) {
  let ch = await prisma.chapter.findFirst({
    where: { moduleId, number: chapterNumber },
  });

  if (!ch) {
    console.log(`  🆕 Creating chapter ${chapterNumber} (${chapterSlug})...`);
    ch = await prisma.chapter.create({
      data: {
        moduleId,
        number: chapterNumber,
        slug: chapterSlug,
        title: `Chapter ${chapterNumber}`,
        status: "DRAFT",
        sequenceOrder: chapterNumber,
      },
    });
  }

  return ch;
}

async function validateMcqBankFile(
  mcqBankFile: string | undefined,
  curriculumRoot: string
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  if (!mcqBankFile) return { valid: true, errors: [], warnings: [] };

  const bankPath = path.join(curriculumRoot, mcqBankFile);
  if (!fs.existsSync(bankPath)) {
    return {
      valid: false,
      errors: [`MCQ bank file not found: ${bankPath} (02 §3.1, 06 §2)`],
      warnings: [],
    };
  }

  try {
    const raw = fs.readFileSync(bankPath, "utf-8");
    const json = JSON.parse(raw);
    const result = validateMcqBank(json);
    const errors: string[] = [];
    if (result.schemaErrors) {
      for (const issue of result.schemaErrors.issues) {
        errors.push(`[schema] ${issue.path.join(".")}: ${issue.message}`);
      }
    }
    errors.push(...result.businessRuleErrors);
    return {
      valid: errors.length === 0,
      errors,
      warnings: result.warnings,
    };
  } catch (e: any) {
    return {
      valid: false,
      errors: [`Failed to parse MCQ bank: ${e.message}`],
      warnings: [],
    };
  }
}

async function importLesson(filePath: string, options: ImportOptions) {
  console.log(`\n📄 Importing: ${filePath}`);

  // ─── 1. File existence ───
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // ─── 2. Parse markdown + front matter ───
  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(raw);
  } catch (e: any) {
    console.error(`❌ Failed to parse front matter: ${e.message}`);
    process.exit(1);
  }
  const frontMatter = parsed.data;
  const bodyMarkdown = parsed.content;

  // ─── 3. Validate front matter ───
  const fmResult = validateLessonFrontMatter(frontMatter);
  if (!fmResult.valid || fmResult.schemaErrors) {
    console.error(`❌ Front-matter validation failed:`);
    if (fmResult.schemaErrors) {
      for (const issue of fmResult.schemaErrors.issues) {
        console.error(`   • [${issue.path.join(".")}] ${issue.message}`);
      }
    }
    for (const err of fmResult.businessRuleErrors) {
      console.error(`   • ${err}`);
    }
    process.exit(1);
  }

  const fm = fmResult.data!;

  // ─── 4. Lint sections ───
  const sectionResult = lintSections(bodyMarkdown, fm.lesson_type, fm.interactive?.enabled ?? false);
  if (sectionResult.errors.length > 0) {
    console.error(`❌ Section lint failed:`);
    for (const err of sectionResult.errors) {
      console.error(`   • ${err}`);
    }
  }
  for (const warn of sectionResult.warnings) {
    console.log(`   ⚠️  ${warn}`);
  }

  if (sectionResult.errors.length > 0 && !options.force) {
    console.error(`\n💡 Use --force to import despite section errors.`);
    process.exit(1);
  }

  // ─── 5. Validate MCQ bank ───
  const mcqResult = await validateMcqBankFile(fm.mcq_bank_file, options.curriculumRoot);
  if (!mcqResult.valid) {
    console.error(`❌ MCQ bank validation failed:`);
    for (const err of mcqResult.errors) {
      console.error(`   • ${err}`);
    }
  }
  for (const warn of mcqResult.warnings) {
    console.log(`   ⚠️  ${warn}`);
  }

  // ─── 6. Validate citations ───
  const { validateLessonCitations } = await import("../src/services/bibliography.service");
  const citationResult = await validateLessonCitations(fm.primary_sources, fm.modern_sources);
  if (!citationResult.valid) {
    console.log(`   ⚠️  Missing bibliography entries:`);
    for (const ref of citationResult.missingRefs) {
      console.log(`      • ${ref}`);
    }
  }

  if (!mcqResult.valid && !options.force) {
    console.error(`\n💡 Use --force to import despite MCQ errors.`);
    process.exit(1);
  }

  // ─── 7. Summary ───
  console.log(`\n✅ Validation passed:`);
  console.log(`   • Slug: ${fm.slug}`);
  console.log(`   • Tier ${fm.tier} → Module ${fm.module} → Chapter ${fm.chapter} → Lesson ${fm.sequence}`);
  console.log(`   • Type: ${fm.lesson_type}`);
  console.log(`   • Bloom: ${fm.bloom_levels.join(", ")}`);
  console.log(`   • MCQs: ${fm.mcq_count} (${fm.mcq_bank_file || "none"})`);
  console.log(`   • Words: ${sectionResult.stats.totalWordCount}`);
  console.log(`   • Sections: ${sectionResult.sections.length}/12`);
  console.log(`   • Ślokas: ${sectionResult.stats.slokaCount}`);
  console.log(`   • Common mistakes: ${sectionResult.stats.commonMistakeCount}`);
  console.log(`   • Things to remember: ${sectionResult.stats.thingsToRememberCount}`);

  if (options.dryRun) {
    console.log(`\n🏃 DRY RUN — no database changes.`);
    return;
  }

  // ─── 7. Database upsert ───
  const tier = await resolveTier(fm.tier);
  const mod = await resolveModule(tier.id, fm.module, fm.module_slug);
  const ch = await resolveChapter(mod.id, fm.chapter, fm.chapter_slug);

  // Check for slug collision within tier
  const existingBySlug = await prisma.lesson.findUnique({ where: { slug: fm.slug } });
  if (existingBySlug && existingBySlug.chapterId !== ch.id) {
    console.error(
      `❌ Slug collision: "${fm.slug}" already exists in a different chapter (${existingBySlug.chapterId} vs ${ch.id}).`
    );
    process.exit(1);
  }

  const lessonData = {
    slug: fm.slug,
    chapterId: ch.id,
    tier: fm.tier,
    module: fm.module,
    chapter: fm.chapter,
    sequence: fm.sequence,
    title: fm.title,
    titleDevanagari: fm.title_devanagari || null,
    subtitle: fm.subtitle || null,
    lessonType: fm.lesson_type.toUpperCase().replace(/-/g, "_") as any,
    bloomLevels: fm.bloom_levels,
    targetMinutesReading: fm.target_minutes_reading,
    targetMinutesTotal: fm.target_minutes_total,
    streams: fm.streams,
    streamNeutrality: fm.stream_neutrality,
    prerequisites: fm.prerequisites,
    postrequisites: fm.postrequisites,
    learningOutcomes: fm.learning_outcomes,
    primarySources: fm.primary_sources as any,
    modernSources: fm.modern_sources as any,
    interactiveEnabled: fm.interactive?.enabled ?? false,
    interactiveType: fm.interactive?.component_type || null,
    interactiveSpecFile: fm.interactive?.spec_file || null,
    interactiveEndpoints: fm.interactive?.astro_engine_endpoints ?? [],
    mcqCount: fm.mcq_count,
    mcqBankFile: fm.mcq_bank_file || null,
    bodyMarkdown,
    authoringStatus: fm.authoring_status.toUpperCase().replace(/-/g, "_") as any,
    version: fm.version,
    authors: fm.authors,
    technicalReviewer: fm.technical_reviewer || null,
    pedagogicalReviewer: fm.pedagogical_reviewer || null,
    hasDevanagari: fm.has_devanagari,
    hasDiagrams: fm.has_diagrams,
    hasAudio: fm.has_audio_pronunciation,
    estimatedReadingGrade: fm.estimated_reading_grade || null,
  };

  const upserted = await prisma.lesson.upsert({
    where: { slug: fm.slug },
    create: lessonData,
    update: lessonData,
  });

  console.log(`\n✅ Lesson upserted:`);
  console.log(`   • ID: ${upserted.id}`);
  console.log(`   • Slug: ${upserted.slug}`);
  console.log(`   • Status: ${upserted.authoringStatus}`);

  await publishImportCompleted({
    scope: "lesson",
    lessonSlug: upserted.slug,
    correlationId: options.jobId,
  });

  // ─── 8. Update postrequisites of prerequisite lessons ───
  if (fm.prerequisites.length > 0) {
    for (const prereqSlug of fm.prerequisites) {
      const prereq = await prisma.lesson.findUnique({ where: { slug: prereqSlug } });
      if (prereq) {
        const currentPost = prereq.postrequisites || [];
        if (!currentPost.includes(fm.slug)) {
          await prisma.lesson.update({
            where: { id: prereq.id },
            data: {
              postrequisites: [...currentPost, fm.slug],
            },
          });
          console.log(`   🔗 Updated postrequisite: ${prereqSlug} → ${fm.slug}`);
        }
      } else {
        console.log(`   ⚠️  Prerequisite lesson not found: ${prereqSlug}`);
      }
    }
  }
}

// ─── Main ───
async function main() {
  const { filePath, options } = parseArgs();

  try {
    await importLesson(path.resolve(filePath), options);
  } catch (err: any) {
    console.error(`\n❌ Import failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await disconnectRedisPublisher();
    await prisma.$disconnect();
  }
}

main();
