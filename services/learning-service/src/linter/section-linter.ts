/**
 * Section Linter
 * Based on 02-lesson-authoring-standard.md §4 — The 12-section lesson body template
 *
 * Validates that a lesson markdown body contains all required sections
 * in the correct order, and checks length budgets.
 */

export interface SectionLintResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sections: ParsedSection[];
  stats: {
    totalWordCount: number;
    sectionWordCounts: Record<string, number>;
    newTermCount: number;
    slokaCount: number;
    diagramCount: number;
    commonMistakeCount: number;
    thingsToRememberCount: number;
  };
}

export interface ParsedSection {
  number: number;
  title: string;
  content: string;
  wordCount: number;
}

const REQUIRED_SECTIONS = [
  { num: 1, title: "Hook", minWords: 20, maxWords: 120, required: true },
  { num: 2, title: "What you should know first", minWords: 20, maxWords: 120, required: true },
  { num: 3, title: "What you'll be able to do after this lesson", minWords: 10, maxWords: 200, required: true },
  { num: 4, title: "Body", minWords: 100, maxWords: 4000, required: true },
  { num: 5, title: "Śloka block", minWords: 0, maxWords: 2000, required: false }, // N/A allowed
  { num: 6, title: "Worked examples", minWords: 0, maxWords: 3000, required: false },
  { num: 7, title: "Interactive component", minWords: 0, maxWords: 1000, required: false },
  { num: 8, title: "Common mistakes", minWords: 30, maxWords: 1500, required: true },
  { num: 9, title: "Things to remember", minWords: 30, maxWords: 1000, required: true },
  { num: 10, title: "Test yourself", minWords: 10, maxWords: 500, required: true },
  { num: 11, title: "Summary", minWords: 50, maxWords: 200, required: true },
  { num: 12, title: "Citations", minWords: 10, maxWords: 2000, required: true },
];

function countWords(text: string): number {
  return text
    .replace(/[#*>`|\[\]()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Parses body markdown into the 12 sections.
 * Sections are identified by `# §N Title` headings.
 */
export function parseSections(bodyMarkdown: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = bodyMarkdown.replace(/\r/g, "").split("\n");

  const sectionRegex = /^#\s+§(\d+)\s+(.+)$/;
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    const match = line.match(sectionRegex);
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        number: parseInt(match[1], 10),
        title: match[2].trim(),
        content: "",
        wordCount: 0,
      };
    } else if (currentSection) {
      currentSection.content += line + "\n";
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  // Compute word counts
  for (const s of sections) {
    s.wordCount = countWords(s.content);
  }

  return sections;
}

/**
 * Lints a lesson body against the 12-section standard.
 */
export function lintSections(
  bodyMarkdown: string,
  lessonType: string,
  hasInteractive: boolean
): SectionLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sections = parseSections(bodyMarkdown);
  const sectionMap = new Map(sections.map((s) => [s.number, s]));

  // Check all required sections exist
  for (const req of REQUIRED_SECTIONS) {
    const found = sectionMap.get(req.num);
    if (!found) {
      if (req.required) {
        errors.push(
          `Missing required section §${req.num} (${req.title}). (02 §4)`
        );
      }
      continue;
    }

    // Check section is not just "N/A"
    const trimmed = found.content.trim();
    const isNa = /^\*N\/A/i.test(trimmed) || /^N\/A/i.test(trimmed);

    if (isNa) {
      if (req.required) {
        errors.push(
          `Section §${req.num} (${req.title}) is marked N/A but is required for lesson_type=${lessonType}. (02 §4)`
        );
      }
      continue;
    }

    // Length budget check
    if (found.wordCount < req.minWords) {
      warnings.push(
        `Section §${req.num} (${req.title}) is ${found.wordCount} words (min ${req.minWords}). (02 §5)`
      );
    }
    if (found.wordCount > req.maxWords) {
      warnings.push(
        `Section §${req.num} (${req.title}) is ${found.wordCount} words (max ${req.maxWords}). Consider splitting. (02 §5)`
      );
    }
  }

  // Check section order
  const sortedSections = [...sections].sort((a, b) => a.number - b.number);
  for (let i = 0; i < sortedSections.length - 1; i++) {
    if (sortedSections[i].number >= sortedSections[i + 1].number) {
      errors.push(
        `Sections out of order: §${sortedSections[i].number} appears before §${sortedSections[i + 1].number}. (02 §4)`
      );
    }
  }

  // Lesson-type specific checks
  if (lessonType === "calculative" || lessonType === "interpretive" || lessonType === "synthesis" || lessonType === "case-study") {
    const workedExamples = sectionMap.get(6);
    if (!workedExamples || /^\*N\/A/i.test(workedExamples.content.trim())) {
      errors.push(
        `lesson_type=${lessonType} requires §6 Worked examples. (02 §4, 01-pedagogical-framework.md §7.1)`
      );
    }
  }

  if (hasInteractive) {
    const interactiveSection = sectionMap.get(7);
    if (!interactiveSection || /^\*N\/A/i.test(interactiveSection.content.trim())) {
      errors.push(
        `interactive.enabled=true but §7 Interactive component is missing or N/A. (02 §4, 05-interactive-component-taxonomy.md §14)`
      );
    }
    // Check for "Things to try" prompts
    if (interactiveSection && !interactiveSection.content.includes("Things to try")) {
      warnings.push(
        `§7 Interactive component should contain "Things to try" prompts. (02 §7, 05 §14)`
      );
    }
  }

  // Common mistakes count
  const commonMistakesSection = sectionMap.get(8);
  let commonMistakeCount = 0;
  if (commonMistakesSection) {
    commonMistakeCount = (commonMistakesSection.content.match(/⚠️\s*\*\*Common mistake/g) || []).length;
    if (commonMistakeCount < 3) {
      warnings.push(
        `§8 Common mistakes has ${commonMistakeCount} entries (target 3-7). (02 §8)`
      );
    }
    if (commonMistakeCount > 7) {
      warnings.push(
        `§8 Common mistakes has ${commonMistakeCount} entries (max 7). (02 §8)`
      );
    }
  }

  // Things to remember count
  const thingsToRememberSection = sectionMap.get(9);
  let thingsToRememberCount = 0;
  if (thingsToRememberSection) {
    thingsToRememberCount = (thingsToRememberSection.content.match(/💡\s*\*\*Remember/g) || []).length;
    if (thingsToRememberCount < 3) {
      warnings.push(
        `§9 Things to remember has ${thingsToRememberCount} entries (target 3-7). (02 §9)`
      );
    }
    if (thingsToRememberCount > 7) {
      warnings.push(
        `§9 Things to remember has ${thingsToRememberCount} entries (max 7). (02 §9)`
      );
    }
  }

  // New vocabulary check (≤ 9 new terms per lesson, 02 §4, 01 §6)
  const bodySection = sectionMap.get(4);
  let newTermCount = 0;
  if (bodySection) {
    // Count italicised terms as proxy for new vocabulary
    const italicTerms = bodySection.content.matchAll(/\*([a-zA-Zāīūṛṝḷḹṁḥṅñṇṭḍśṣ]+)\*/g);
    const uniqueTerms = new Set(Array.from(italicTerms).map((m) => m[1].toLowerCase()));
    newTermCount = uniqueTerms.size;
    if (newTermCount > 9) {
      warnings.push(
        `§4 Body introduces ~${newTermCount} italicised terms (target ≤ 9 new vocabulary per lesson). (02 §4, 01 §6)`
      );
    }
  }

  // Śloka count
  const slokaSection = sectionMap.get(5);
  let slokaCount = 0;
  if (slokaSection && !/^\*N\/A/i.test(slokaSection.content.trim())) {
    slokaCount = (slokaSection.content.match(/देवनागरी/g) || []).length;
    if (slokaCount > 5) {
      warnings.push(
        `§5 Śloka block has ${slokaCount} verses (max 5; split if exceeded). (02 §5)`
      );
    }
  }

  // Diagram count (alt text mentions)
  const diagramCount = (bodyMarkdown.match(/alt="/g) || []).length;

  const totalWordCount = countWords(bodyMarkdown);

  const sectionWordCounts: Record<string, number> = {};
  for (const s of sections) {
    sectionWordCounts[`§${s.number}`] = s.wordCount;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sections,
    stats: {
      totalWordCount,
      sectionWordCounts,
      newTermCount,
      slokaCount,
      diagramCount,
      commonMistakeCount,
      thingsToRememberCount,
    },
  };
}
