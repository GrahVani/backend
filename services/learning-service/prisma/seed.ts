import { PrismaClient, LessonType, AuthoringStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const prisma = new PrismaClient();

const CURRICULUM_ROOT = path.join(__dirname, "..", "..", "..", "..", "curriculum");

interface ParsedLesson {
  slug: string;
  title: string;
  titleDevanagari?: string;
  subtitle?: string;
  tier: number;
  module: number;
  chapter: number;
  sequence: number;
  lessonType: string;
  bloomLevels: string[];
  targetMinutesReading: number;
  targetMinutesTotal: number;
  streams: string[];
  streamNeutrality: boolean;
  prerequisites: string[];
  postrequisites: string[];
  learningOutcomes: string[];
  primarySources: any;
  modernSources: any;
  interactiveEnabled: boolean;
  interactiveType?: string;
  interactiveSpecFile?: string;
  interactiveEndpoints: string[];
  mcqCount: number;
  mcqBankFile?: string;
  bodyMarkdown: string;
  authoringStatus: string;
  version: string;
  authors: string[];
  technicalReviewer?: string;
  pedagogicalReviewer?: string;
  hasDevanagari: boolean;
  hasDiagrams: boolean;
  hasAudio: boolean;
  estimatedReadingGrade?: number;
}

function toLessonType(type: string): LessonType {
  const map: Record<string, LessonType> = {
    conceptual: LessonType.CONCEPTUAL,
    calculative: LessonType.CALCULATIVE,
    interpretive: LessonType.INTERPRETIVE,
    synthesis: LessonType.SYNTHESIS,
    "prose-essay": LessonType.PROSE_ESSAY,
    "case-study": LessonType.CASE_STUDY,
  };
  return map[type?.toLowerCase()] ?? LessonType.CONCEPTUAL;
}

function toAuthoringStatus(status: string): AuthoringStatus {
  const map: Record<string, AuthoringStatus> = {
    draft: AuthoringStatus.DRAFT,
    "technical-audit": AuthoringStatus.TECHNICAL_AUDIT,
    "pedagogical-audit": AuthoringStatus.PEDAGOGICAL_AUDIT,
    published: AuthoringStatus.PUBLISHED,
    "revision-needed": AuthoringStatus.REVISION_NEEDED,
  };
  return map[status?.toLowerCase()] ?? AuthoringStatus.DRAFT;
}

function parseModuleFolderName(folderName: string): { number: number; slug: string } {
  // e.g., "module-01-introduction-to-jyotisha" -> { number: 1, slug: "introduction-to-jyotisha" }
  const match = folderName.match(/^module-(\d+)-(.+)$/);
  if (!match) return { number: 0, slug: folderName };
  return { number: parseInt(match[1], 10), slug: match[2] };
}

function parseChapterFolderName(folderName: string): { number: number; slug: string } {
  // e.g., "chapter-01-what-jyotisha-is" -> { number: 1, slug: "what-jyotisha-is" }
  const match = folderName.match(/^chapter-(\d+)-(.+)$/);
  if (!match) return { number: 0, slug: folderName };
  return { number: parseInt(match[1], 10), slug: match[2] };
}

function parseLessonFileName(fileName: string): { sequence: number; slug: string } {
  // e.g., "lesson-01-jyotisha-as-vedanga.md" -> { sequence: 1, slug: "jyotisha-as-vedanga" }
  const match = fileName.match(/^lesson-(\d+)-(.+)\.md$/);
  if (!match) return { sequence: 0, slug: fileName.replace(/\.md$/, "") };
  return { sequence: parseInt(match[1], 10), slug: match[2] };
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function extractTitleFromMarkdown(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

async function seedTiers() {
  console.log("🎓 Seeding tiers...");

  const tiers = [
    { number: 1, title: "Tier 1 — Foundation", description: "Comprehensive theoretical mastery; vocabulary, frameworks, conceptual map across all major streams", status: "ACTIVE" as const },
    { number: 2, title: "Tier 2 — Advanced / Predictive Mastery", description: "Multi-domain interpretive synthesis; produce reliable, defensible predictions", status: "ACTIVE" as const },
  ];

  for (const t of tiers) {
    await prisma.tier.upsert({
      where: { number: t.number },
      update: t,
      create: t,
    });
  }
  console.log("✅ Tiers seeded");
}

async function seedFromCurriculum() {
  // Auto-discover tier directories (e.g., tier-1-foundation, tier-2-advanced, tier-3-expert)
  const tierDirs = fs.readdirSync(CURRICULUM_ROOT)
    .filter((f) => f.startsWith("tier-"))
    .map((dir) => {
      const match = dir.match(/^tier-(\d+)-/);
      return { dir, number: match ? parseInt(match[1], 10) : 0 };
    })
    .filter((t) => t.number > 0)
    .sort((a, b) => a.number - b.number);

  let totalModules = 0;
  let totalChapters = 0;
  let totalLessons = 0;

  for (const { dir: tierDir, number: tierNumber } of tierDirs) {
    const tierPath = path.join(CURRICULUM_ROOT, tierDir);
    if (!fs.existsSync(tierPath)) {
      console.warn(`⚠️ Tier directory not found: ${tierPath}`);
      continue;
    }

    const tier = await prisma.tier.findUnique({ where: { number: tierNumber } });
    if (!tier) {
      console.warn(`⚠️ Tier ${tierNumber} not found in DB`);
      continue;
    }

    // Read module folders
    const moduleFolders = fs.readdirSync(tierPath)
      .filter((f) => f.startsWith("module-"))
      .sort();

    for (const moduleFolder of moduleFolders) {
      const modulePath = path.join(tierPath, moduleFolder);
      const moduleMeta = parseModuleFolderName(moduleFolder);

      // Read module overview to get title
      const overviewPath = path.join(modulePath, "00-module-overview.md");
      const overviewContent = readFileIfExists(overviewPath);
      const moduleTitle = overviewContent
        ? extractTitleFromMarkdown(overviewContent)
        : moduleMeta.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const dbModule = await prisma.module.upsert({
        where: { slug: moduleMeta.slug },
        update: {
          title: moduleTitle,
          description: overviewContent ? undefined : undefined,
          sequenceOrder: moduleMeta.number,
        },
        create: {
          tierId: tier.id,
          number: moduleMeta.number,
          slug: moduleMeta.slug,
          title: moduleTitle,
          description: null,
          status: "DRAFT",
          sequenceOrder: moduleMeta.number,
        },
      });
      totalModules++;

      // Read chapter folders
      const chapterFolders = fs.readdirSync(modulePath)
        .filter((f) => f.startsWith("chapter-"))
        .sort();

      for (const chapterFolder of chapterFolders) {
        const chapterPath = path.join(modulePath, chapterFolder);
        const chapterMeta = parseChapterFolderName(chapterFolder);

        const chapterOverviewPath = path.join(chapterPath, "00-chapter-overview.md");
        const chapterOverviewContent = readFileIfExists(chapterOverviewPath);
        const chapterTitle = chapterOverviewContent
          ? extractTitleFromMarkdown(chapterOverviewContent)
          : chapterMeta.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        const dbChapter = await prisma.chapter.upsert({
          where: {
            moduleId_number: {
              moduleId: dbModule.id,
              number: chapterMeta.number,
            },
          },
          update: {
            title: chapterTitle,
            slug: chapterMeta.slug,
            sequenceOrder: chapterMeta.number,
          },
          create: {
            moduleId: dbModule.id,
            number: chapterMeta.number,
            slug: chapterMeta.slug,
            title: chapterTitle,
            description: null,
            status: "DRAFT",
            sequenceOrder: chapterMeta.number,
          },
        });
        totalChapters++;

        // Read lesson files
        const lessonFiles = fs.readdirSync(chapterPath)
          .filter((f) => f.startsWith("lesson-") && f.endsWith(".md"))
          .sort();

        for (const lessonFile of lessonFiles) {
          const lessonPath = path.join(chapterPath, lessonFile);
          const lessonMeta = parseLessonFileName(lessonFile);
          const rawContent = fs.readFileSync(lessonPath, "utf-8");

          // Parse front matter and body
          let parsed: { data: Record<string, unknown>; content: string };
          try {
            parsed = matter(rawContent);
          } catch (e: any) {
            console.error(`❌ Failed to parse front matter in ${lessonPath}: ${e.message}`);
            continue;
          }
          const fm = parsed.data || {};

          // Extract interactive config
          const interactive = fm.interactive || {};
          const primarySources = Array.isArray(fm.primary_sources)
            ? fm.primary_sources
            : [];
          const modernSources = Array.isArray(fm.modern_sources)
            ? fm.modern_sources
            : [];

          const lessonData = {
            slug: fm.slug || lessonMeta.slug,
            chapterId: dbChapter.id,
            tier: tierNumber,
            module: moduleMeta.number,
            chapter: chapterMeta.number,
            sequence: fm.sequence ?? lessonMeta.sequence,
            title: fm.title || lessonMeta.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            titleDevanagari: fm.title_devanagari || null,
            subtitle: fm.subtitle || null,
            lessonType: toLessonType(fm.lesson_type),
            bloomLevels: Array.isArray(fm.bloom_levels) ? fm.bloom_levels : [],
            targetMinutesReading: fm.target_minutes_reading || 15,
            targetMinutesTotal: fm.target_minutes_total || 30,
            streams: Array.isArray(fm.streams) ? fm.streams : [],
            streamNeutrality: fm.stream_neutrality ?? true,
            prerequisites: Array.isArray(fm.prerequisites) ? fm.prerequisites : [],
            postrequisites: Array.isArray(fm.postrequisites) ? fm.postrequisites : [],
            learningOutcomes: Array.isArray(fm.learning_outcomes) ? fm.learning_outcomes : [],
            primarySources: primarySources.length > 0 ? primarySources : null,
            modernSources: modernSources.length > 0 ? modernSources : null,
            interactiveEnabled: interactive.enabled ?? false,
            interactiveType: interactive.component_type || null,
            interactiveSpecFile: interactive.spec_file || null,
            interactiveEndpoints: Array.isArray(interactive.astro_engine_endpoints)
              ? interactive.astro_engine_endpoints
              : [],
            mcqCount: fm.mcq_count || 0,
            mcqBankFile: fm.mcq_bank_file || null,
            bodyMarkdown: parsed.content,
            authoringStatus: toAuthoringStatus(fm.authoring_status),
            version: fm.version ? String(fm.version) : "1.0",
            authors: Array.isArray(fm.authors) ? fm.authors : [],
            technicalReviewer: fm.technical_reviewer || null,
            pedagogicalReviewer: fm.pedagogical_reviewer || null,
            hasDevanagari: fm.has_devanagari ?? false,
            hasDiagrams: fm.has_diagrams ?? false,
            hasAudio: fm.has_audio_pronunciation ?? false,
            estimatedReadingGrade: fm.estimated_reading_grade || null,
          };

          await prisma.lesson.upsert({
            where: { slug: lessonData.slug },
            update: lessonData,
            create: lessonData,
          });
          totalLessons++;
        }
      }
    }
  }

  console.log(`\n✅ Curriculum seeded:`);
  console.log(`   📚 ${totalModules} modules`);
  console.log(`   📂 ${totalChapters} chapters`);
  console.log(`   📝 ${totalLessons} lessons`);
}

async function seedLegacyGamification() {
  // Ensure default badge definitions exist so gamification routes don't break
  const defaultBadges = [
    { badgeCode: "first_lesson", name: "First Steps", description: "Complete your first lesson", rarity: "common", pointsReward: 100 },
    { badgeCode: "streak_3", name: "On Fire", description: "Maintain a 3-day streak", rarity: "common", pointsReward: 200 },
    { badgeCode: "streak_7", name: "Unstoppable", description: "Maintain a 7-day streak", rarity: "rare", pointsReward: 500 },
    { badgeCode: "tier1_complete", name: "Foundation Master", description: "Complete all Tier 1 modules", rarity: "epic", pointsReward: 2000 },
    { badgeCode: "perfect_quiz", name: "Perfectionist", description: "Score 100% on a quiz", rarity: "rare", pointsReward: 300 },
  ];

  for (const badge of defaultBadges) {
    await prisma.badgeDefinition.upsert({
      where: { badgeCode: badge.badgeCode },
      update: badge,
      create: badge,
    });
  }
  console.log("🏅 Default badges seeded");
}

async function main() {
  console.log("🚀 Starting curriculum seed...\n");

  // Clean slate for curriculum tables only (preserve gamification user data if any)
  // But since we did a hard reset, all tables are empty anyway
  await seedTiers();
  await seedFromCurriculum();
  await seedLegacyGamification();

  console.log("\n✅ FULL CURRICULUM SEEDED!");
  const stats = await prisma.$transaction([
    prisma.tier.count(),
    prisma.module.count(),
    prisma.chapter.count(),
    prisma.lesson.count(),
    prisma.badgeDefinition.count(),
  ]);
  console.log(`   Tiers: ${stats[0]} | Modules: ${stats[1]} | Chapters: ${stats[2]} | Lessons: ${stats[3]} | Badges: ${stats[4]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
