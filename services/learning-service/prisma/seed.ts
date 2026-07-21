import { PrismaClient, Prisma, LessonType, AuthoringStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import matter from "gray-matter";
import { publishImportCompleted, disconnectRedisPublisher } from "../src/events/publisher";

const prisma = new PrismaClient();
const seedJobId = randomUUID();

const CURRICULUM_ROOT = process.env.CURRICULUM_PATH || (fs.existsSync("/app/curriculum")
  ? "/app/curriculum"
  : fs.existsSync(path.resolve(__dirname, "../../../curriculum"))
  ? path.resolve(__dirname, "../../../curriculum")
  : path.resolve(__dirname, "../../../../curriculum"));

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
  interactiveFallback?: string;
  interactiveEndpoints: string[];
  mcqCount: number;
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
  lastUpdated?: Date;
}

interface LessonFrontMatter {
  slug?: string;
  lesson_type?: string;
  sequence?: number;
  title?: string;
  title_devanagari?: string;
  subtitle?: string;
  bloom_levels?: unknown[];
  target_minutes_reading?: number;
  target_minutes_total?: number;
  streams?: unknown[];
  stream_neutrality?: boolean;
  prerequisites?: unknown[];
  postrequisites?: unknown[];
  learning_outcomes?: unknown[];
  primary_sources?: unknown[];
  modern_sources?: unknown[];
  interactive?: {
    enabled?: boolean;
    component_type?: string;
    spec_file?: string;
    fallback_if_offline?: string;
    astro_engine_endpoints?: unknown[];
  };
  mcq_count?: number;
  mcq_bank_file?: string;
  version?: string | number;
  authors?: unknown[];
  technical_reviewer?: string;
  pedagogical_reviewer?: string;
  has_devanagari?: boolean;
  has_diagrams?: boolean;
  has_audio_pronunciation?: boolean;
  estimated_reading_grade?: number;
  last_updated?: string | number | Date;
}

function toLessonType(type: string | undefined | null): LessonType {
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
  return map[status?.toLowerCase()] ?? AuthoringStatus.PUBLISHED;
}

/**
 * Sanitize arrays that should contain only strings.
 * YAML may parse unquoted lines with colons as objects; coerce them back.
 */
function sanitizeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const entries = Object.entries(item);
        if (entries.length === 1) {
          const [k, v] = entries[0];
          return `${k}: ${v}`;
        }
        return JSON.stringify(item);
      }
      return String(item);
    })
    .filter((s) => s.length > 0);
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

/**
 * Strip implementation-only embed markers from lesson body.
 * These are placeholders for developers, not content for students.
 */
function stripEmbedMarkers(body: string): string {
  return body
    .replace(/\[INTERACTIVE COMPONENT EMBED\s*—?\s*see?\s+[^\]]+\]/gi, "")
    .replace(/\[MCQ BANK EMBED\s*—?\s*[^\]]+\]/gi, "");
}

// ── Section extractors for AI + structured access ──

interface ParsedSection {
  number: number;
  title: string;
  type: string;
  content: string;
}

function parseTwelveSections(body: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  // Normalize Windows CRLF → LF so regexes work cross-platform
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let current: ParsedSection | null = null;

  for (const line of lines) {
    // Match both # §N (h1) and ## §N (h2) formats
    // Handle both "# §1 Hook" and "## §1. Why this matters"
    const match = line.match(/^#{1,2}\s+§(\d+)\.?\s+(.+)$/);
    if (match) {
      if (current) sections.push(current);
      const title = match[2].trim();
      const type = inferSectionType(title);
      current = { number: parseInt(match[1], 10), title, type, content: "" };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

function inferSectionType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("hook")) return "hook";
  if (t.includes("should know") || t.includes("prerequisite")) return "prerequisites";
  if (t.includes("able to do") || t.includes("learning outcome")) return "outcomes";
  if (t.includes("body") || t.includes("core teaching")) return "body";
  if (t.includes("śloka") || t.includes("sloka") || t.includes("classical citation")) return "sloka_block";
  if (t.includes("worked example") || t.includes("recognition")) return "worked_example";
  if (t.includes("interactive")) return "interactive";
  if (t.includes("common mistake")) return "common_mistake";
  if (t.includes("remember")) return "remember";
  if (t.includes("test yourself") || t.includes("test your")) return "test_yourself";
  if (t.includes("summary")) return "summary";
  if (t.includes("citation") || t.includes("further reading")) return "citations";
  return "body";
}

function extractSectionByNumber(sections: ParsedSection[], num: number): string | null {
  const s = sections.find((x) => x.number === num);
  return s ? s.content.trim() : null;
}

function extractJsonSection(sections: ParsedSection[], num: number): any | null {
  const content = extractSectionByNumber(sections, num);
  if (!content) return null;
  // Try to extract structured items (blockquote blocks, lists, etc.)
  const blocks: Array<{ title?: string; content: string }> = [];
  const lines = content.split("\n");
  let currentBlock: { title?: string; content: string } | null = null;

  for (const line of lines) {
    if (line.startsWith("> **") || line.match(/^>\s*⚠️/)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { title: line.replace(/^>\s*[*️\s]*/, "").trim(), content: "" };
    } else if (currentBlock && line.startsWith(">")) {
      currentBlock.content += line.replace(/^>\s?/, "") + "\n";
    } else if (line.trim() && currentBlock) {
      currentBlock.content += line + "\n";
    }
  }
  if (currentBlock) blocks.push(currentBlock);
  return blocks.length > 0 ? blocks : content;
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
          overviewMarkdown: overviewContent || undefined,
          sequenceOrder: moduleMeta.number,
          status: "PUBLISHED",
        },
        create: {
          tierId: tier.id,
          number: moduleMeta.number,
          slug: moduleMeta.slug,
          title: moduleTitle,
          description: null,
          overviewMarkdown: overviewContent || null,
          status: "PUBLISHED",
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
            overviewMarkdown: chapterOverviewContent || undefined,
            slug: chapterMeta.slug,
            sequenceOrder: chapterMeta.number,
            status: "PUBLISHED",
          },
          create: {
            moduleId: dbModule.id,
            number: chapterMeta.number,
            slug: chapterMeta.slug,
            title: chapterTitle,
            description: null,
            overviewMarkdown: chapterOverviewContent || null,
            status: "PUBLISHED",
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
          let parsed: { data: LessonFrontMatter; content: string };
          try {
            parsed = matter(rawContent);
          } catch (e: any) {
            console.error(`❌ Failed to parse front matter in ${lessonPath}: ${e.message}`);
            continue;
          }
          const fm = parsed.data || {};

          // Extract interactive config
          const interactive: NonNullable<LessonFrontMatter["interactive"]> = fm.interactive || {};
          const primarySources = (Array.isArray(fm.primary_sources)
            ? fm.primary_sources
            : []) as any[];
          const modernSources = (Array.isArray(fm.modern_sources)
            ? fm.modern_sources
            : []) as any[];

          // Parse sections from body for structured extraction
          const sections = parseTwelveSections(parsed.content);

          const lessonData: Prisma.LessonUncheckedCreateInput = {
            // Prefer YAML front-matter slug (curriculum standard) over filename-derived slug.
            // The curriculum front matter is the authoritative source of truth for lesson identity;
            // filenames may drift during editorial renames but front matter is intentionally maintained.
            slug: (typeof fm.slug === "string" ? fm.slug : lessonMeta.slug) || lessonMeta.slug,
            chapterId: dbChapter.id,
            tier: tierNumber,
            module: moduleMeta.number,
            chapter: chapterMeta.number,
            sequence: fm.sequence ?? lessonMeta.sequence,
            title: fm.title || lessonMeta.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            titleDevanagari: fm.title_devanagari || null,
            subtitle: fm.subtitle || null,
            lessonType: toLessonType(fm.lesson_type),
            bloomLevels: sanitizeStringArray(fm.bloom_levels),
            targetMinutesReading: fm.target_minutes_reading || 15,
            targetMinutesTotal: fm.target_minutes_total || 30,
            streams: sanitizeStringArray(fm.streams),
            streamNeutrality: fm.stream_neutrality ?? true,
            prerequisites: sanitizeStringArray(fm.prerequisites),
            postrequisites: sanitizeStringArray(fm.postrequisites),
            learningOutcomes: sanitizeStringArray(fm.learning_outcomes),
            primarySources: primarySources.length > 0 ? primarySources : Prisma.DbNull,
            modernSources: modernSources.length > 0 ? modernSources : Prisma.DbNull,
            interactiveEnabled: interactive.enabled ?? false,
            interactiveType: interactive.component_type || null,
            interactiveSpecFile: interactive.spec_file || null,
            interactiveFallback: interactive.fallback_if_offline || null,
            interactiveEndpoints: sanitizeStringArray(interactive.astro_engine_endpoints),
            mcqCount: fm.mcq_count || 0,
            bodyMarkdown: stripEmbedMarkers(parsed.content),
            // NEW: structured sections ingested into DB
            commonMistakes: extractJsonSection(sections, 8) as any,
            slokaBlocks: extractJsonSection(sections, 5) as any,
            testYourself: extractSectionByNumber(sections, 10),
            summary90Seconds: extractSectionByNumber(sections, 11),
            authoringStatus: AuthoringStatus.PUBLISHED,
            version: fm.version ? String(fm.version) : "1.0",
            authors: sanitizeStringArray(fm.authors),
            technicalReviewer: fm.technical_reviewer || null,
            pedagogicalReviewer: fm.pedagogical_reviewer || null,
            hasDevanagari: fm.has_devanagari ?? false,
            hasDiagrams: fm.has_diagrams ?? false,
            hasAudio: fm.has_audio_pronunciation ?? false,
            estimatedReadingGrade: fm.estimated_reading_grade || null,
            lastUpdated: fm.last_updated ? new Date(fm.last_updated) : null,
          };

          const dbLesson = await prisma.lesson.upsert({
            where: { slug: lessonData.slug },
            update: lessonData as Prisma.LessonUncheckedUpdateInput,
            create: lessonData,
          });
          totalLessons++;

          // ── Ingest MCQ bank into DB ──
          if (fm.mcq_bank_file) {
            const mcqPath = path.join(CURRICULUM_ROOT, fm.mcq_bank_file);
            if (fs.existsSync(mcqPath)) {
              try {
                const mcqRaw = JSON.parse(fs.readFileSync(mcqPath, "utf-8"));
                // Curriculum JSON uses `mcqs` key; older format used `questions`
                const questions = Array.isArray(mcqRaw.mcqs)
                  ? mcqRaw.mcqs
                  : Array.isArray(mcqRaw.questions)
                    ? mcqRaw.questions
                    : [];
                await prisma.mcqBank.upsert({
                  where: { lessonId: dbLesson.id },
                  update: {
                    questions,
                    schemaVersion: mcqRaw.schema_version || mcqRaw.version || "1.0",
                  },
                  create: {
                    lessonId: dbLesson.id,
                    questions,
                    schemaVersion: mcqRaw.schema_version || mcqRaw.version || "1.0",
                  },
                });
              } catch (e: any) {
                console.warn(`⚠️ Failed to ingest MCQ bank for ${lessonData.slug}: ${e.message}`);
              }
            }
          }

          // ── Ingest interactive spec into DB ──
          if (interactive.spec_file) {
            const specPath = path.join(CURRICULUM_ROOT, interactive.spec_file);
            if (fs.existsSync(specPath)) {
              try {
                const specContent = fs.readFileSync(specPath, "utf-8");
                await prisma.lesson.update({
                  where: { id: dbLesson.id },
                  data: { interactiveSpec: specContent },
                });
              } catch (e: any) {
                console.warn(`⚠️ Failed to ingest spec for ${lessonData.slug}: ${e.message}`);
              }
            }
          }

          // ── Ingest lesson sections for AI search ──
          if (sections.length > 0) {
            // Delete old sections first (clean slate)
            await prisma.lessonSection.deleteMany({ where: { lessonId: dbLesson.id } });
            // Batch create
            await prisma.lessonSection.createMany({
              data: sections.map((s) => ({
                lessonId: dbLesson.id,
                sectionNumber: s.number,
                sectionTitle: s.title,
                sectionType: s.type,
                content: s.content.trim(),
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    }
  }

  console.log(`\n✅ Curriculum seeded:`);
  console.log(`   📚 ${totalModules} modules`);
  console.log(`   📂 ${totalChapters} chapters`);
  console.log(`   📝 ${totalLessons} lessons`);

  await publishImportCompleted({ scope: "full", correlationId: seedJobId });
}

/** Parse bibliography entries from curriculum markdown files.
 *  Robust parser that respects code blocks, skips sections/skeletons,
 *  and splits entries by `---` separators.
 */
function parseBibliographyMarkdown(filePath: string, entryType: "PRIMARY" | "MODERN"): Array<{
  refKey: string;
  entryType: "PRIMARY" | "MODERN";
  title: string;
  author: string | null;
  year: string | null;
  publisher: string | null;
  isbn: string | null;
  stream: string | null;
  notes: string | null;
  citedInModules: string[];
}> {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

  // Split file into sections by `---` (horizontal rules separate entries)
  // But first strip out code blocks entirely so template examples don't become entries
  const cleaned = content.replace(/```[\s\S]*?```/g, "");

  const sections = cleaned.split(/^---+$/m);
  const entries: Array<{
    refKey: string;
    entryType: "PRIMARY" | "MODERN";
    title: string;
    author: string | null;
    year: string | null;
    publisher: string | null;
    isbn: string | null;
    stream: string | null;
    notes: string | null;
    citedInModules: string[];
  }> = [];

  for (const section of sections) {
    const lines = section.split("\n").map((l) => l.trimEnd());
    const headingLine = lines.find((l) => l.startsWith("### "));
    if (!headingLine) continue;

    let heading = headingLine.replace("### ", "").trim();
    const plainHeading = heading.replace(/\*\*/g, "").replace(/\*/g, "").trim();

    // Skip section headers, skeletons, and template examples
    if (/\bskeleton\b/i.test(plainHeading)) continue;
    if (heading.startsWith("<") || heading.includes("Author surname")) continue;
    if (/^section\s+[a-z]/i.test(plainHeading)) continue;
    if (/^tier-[a-b]/i.test(plainHeading)) continue;
    if (/^modern primary carve-outs/i.test(plainHeading)) continue;
    if (/^manuscript and regional texts/i.test(plainHeading)) continue;

    // Extract refKey and title
    let title = heading;
    let refKey = "";

    // Primary format: "Title (REFKEY)" — last parenthesis is the refKey, but only
    // if it looks like one (no spaces, or all-uppercase acronym)
    const parenMatch = heading.match(/\s+\(([^)]+)\)$/);
    const looksLikeRefKey = (s: string) => !s.includes(" ") || /^[A-Z][A-Z0-9-]+$/.test(s);
    const baseTitle = parenMatch ? heading.replace(/\s+\([^)]+\)$/, "").trim() : heading;
    if (parenMatch && entryType === "PRIMARY" && looksLikeRefKey(parenMatch[1].trim())) {
      refKey = parenMatch[1].trim();
      title = baseTitle;
    } else {
      // Modern format: "Author (Year). Title" — derive refKey from first word + year
      const yearMatch = heading.match(/\((\d{4}[^)]*)\)/);
      const firstWord = baseTitle.split(/[\s,]/)[0]?.replace(/[^a-zA-Z]/g, "");
      if (yearMatch && firstWord) {
        refKey = `${firstWord}-${yearMatch[1]}`.substring(0, 35);
      } else {
        refKey = baseTitle.split(" ").slice(0, 3).map((w) => w.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean).join("-").substring(0, 30);
      }
    }

    const entry: any = {
      refKey,
      entryType,
      title,
      author: null,
      year: null,
      publisher: null,
      isbn: null,
      stream: null,
      notes: null,
      citedInModules: [],
    };

    const notesBuffer: string[] = [];

    for (const line of lines) {
      const bulletMatch = line.match(/^\s*-\s+\*\*([^*:]+):\*\*\s*(.*)$/);
      if (bulletMatch) {
        const field = bulletMatch[1].trim().toLowerCase();
        const value = bulletMatch[2].trim();
        if (!value) continue;
        const clean = value.replace(/\*\*/g, "").trim();
        if (field.includes("author") || field.includes("attributed author")) entry.author = clean;
        else if (field.includes("year")) entry.year = clean;
        else if (field.includes("composition period")) entry.year = clean;
        else if (field.includes("publisher")) entry.publisher = clean;
        else if (field.includes("isbn")) entry.isbn = clean;
        else if (field.includes("stream")) entry.stream = clean;
        else if (field.includes("cited in modules")) entry.citedInModules = value.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
        else if (field.includes("notes") || field.includes("strengths") || field.includes("weaknesses") || field.includes("scope")) {
          notesBuffer.push(`${bulletMatch[1].trim()}: ${value}`);
        }
      }
    }

    if (notesBuffer.length > 0) {
      entry.notes = notesBuffer.join("\n").trim().substring(0, 400);
    }

    // Only keep entries that have at least some substance (author, year, publisher, isbn, stream, or notes)
    const hasSubstance = entry.author || entry.year || entry.publisher || entry.isbn || entry.stream || (entry.notes && entry.notes.length > 20);
    if (hasSubstance && title.length > 3) {
      entries.push(entry);
    }
  }

  return entries;
}

async function seedBibliography() {
  const primaryPath = path.join(CURRICULUM_ROOT, "meta", "primary-source-bibliography.md");
  const modernPath = path.join(CURRICULUM_ROOT, "meta", "modern-academic-bibliography.md");

  const primaryEntries = parseBibliographyMarkdown(primaryPath, "PRIMARY");
  const modernEntries = parseBibliographyMarkdown(modernPath, "MODERN");
  const allEntries = [...primaryEntries, ...modernEntries];

  for (const entry of allEntries) {
    await prisma.bibliographyEntry.upsert({
      where: { refKey: entry.refKey },
      update: {
        title: entry.title,
        entryType: entry.entryType,
        author: entry.author,
        year: entry.year,
        publisher: entry.publisher,
        isbn: entry.isbn,
        stream: entry.stream,
        notes: entry.notes,
        citedInModules: entry.citedInModules,
      },
      create: {
        refKey: entry.refKey,
        entryType: entry.entryType,
        title: entry.title,
        author: entry.author,
        year: entry.year,
        publisher: entry.publisher,
        isbn: entry.isbn,
        stream: entry.stream,
        notes: entry.notes,
        citedInModules: entry.citedInModules,
      },
    });
  }
  console.log(`📚 ${allEntries.length} bibliography entries seeded from curriculum`);
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
  await seedBibliography();
  await seedLegacyGamification();

  console.log("\n✅ FULL CURRICULUM SEEDED!");
  const stats = await prisma.$transaction([
    prisma.tier.count(),
    prisma.module.count(),
    prisma.chapter.count(),
    prisma.lesson.count(),
    prisma.badgeDefinition.count(),
    prisma.bibliographyEntry.count(),
  ]);
  console.log(`   Tiers: ${stats[0]} | Modules: ${stats[1]} | Chapters: ${stats[2]} | Lessons: ${stats[3]} | Badges: ${stats[4]} | Bibliography: ${stats[5]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectRedisPublisher();
    await prisma.$disconnect();
  });
