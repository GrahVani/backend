/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";

// ============================================================
// QUESTION BANK LOADER & MAPPING ENGINE
// ============================================================
// This module loads all question banks and maps them to lessons.
//
// HOW IT WORKS:
// 1. Explicit overrides (guaranteed 100% accuracy)
// 2. Fuzzy title matching (fallback for exact/near-exact matches)
// 3. Corrective questions (for lessons with no matching bank questions)
//
// TO ADD QUESTIONS FOR A NEW LESSON:
// 1. If the lesson title exactly matches a question bank lesson → done (auto)
// 2. If not, add an entry to EXPLICIT_QUESTION_OVERRIDES below
// 3. If no question bank covers the topic, add to corrective-questions.json
// ============================================================

export interface QuestionBank {
  modules: Array<{
    moduleId: string;
    moduleTitle: string;
    lessons: Array<{
      lessonId: string;
      lessonTitle: string;
      questions: any[];
    }>;
  }>;
}

export interface CorrectiveBank {
  lessons: Array<{
    lessonTitle: string;
    questions: any[];
  }>;
}

// --- Load all question banks ---
const DATA_DIR = path.join(__dirname);

export const MAIN_BANK: QuestionBank = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "main-bank.json"), "utf-8")
);

export const SUPPLEMENTAL_BANK: QuestionBank = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "supplemental.json"), "utf-8")
);

export const CORRECTIVE_BANK: CorrectiveBank = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "corrective.json"), "utf-8")
);

// --- Explicit mapping: seed lesson title → { moduleId, lessonId } ---
// Use this when fuzzy matching cannot reliably distinguish between lessons.
//
// TO ADD A NEW OVERRIDE:
// 1. Find the lesson title as it appears in curriculum.ts
// 2. Find the moduleId + lessonId from the question bank JSON
// 3. Add an entry below
const EXPLICIT_QUESTION_OVERRIDES: Record<string, { moduleId: string; lessonId: string }> = {
  // M6: Pro Timing Systems
  "Jaimini Sutras (The Sign-Based Engine)": { moduleId: "M6", lessonId: "L6.1" },

  // M7: Applied Predictive Sciences
  "Astro-Remediation (The Physical Output)": { moduleId: "M7", lessonId: "L7.4" },

  // M8: Annual Predictive Engines
  "Varsha Pravesh (The Solar Return Cast) & The Muntha": { moduleId: "M8", lessonId: "L8.1" },
  "Pancha Vargiya Bala (The 5-Fold Strength Algorithm)": { moduleId: "M8", lessonId: "L8.3" },
  "Tajik Yogas (The Persian Geometry)": { moduleId: "M8", lessonId: "L8.2" },

  // M9: Advanced Remedial & Spiritual Astrology
  "Yantra & Modern Anchors (The Geometry Engine)": { moduleId: "M9", lessonId: "L9.4" },

  // M10: Multi-System Synthesis
  "Bridging Vedic and Western (The Hybrid Approach)": { moduleId: "M10", lessonId: "L10.2" },
  "The Master Dashboard (The Ultimate Synthesis)": { moduleId: "M10", lessonId: "L10.1" },
  // Note: "Ayanamsa Variations" removed — no matching question bank exists
};

// Build a lookup map for corrective questions
const CORRECTIVE_MAP = new Map<string, any[]>();
for (const lesson of CORRECTIVE_BANK.lessons) {
  CORRECTIVE_MAP.set(lesson.lessonTitle, lesson.questions);
}

// ============================================================
// SCORING ENGINE
// ============================================================

function scoreMatch(seedTitle: string, qbTitle: string): number {
  const st = seedTitle.toLowerCase().replace(/[()]/g, "");
  const qt = qbTitle.toLowerCase().replace(/[()]/g, "");
  const qbWords = qt.split(/\s+/).filter((w) => w.length > 3);
  let score = 0;
  for (const word of qbWords) {
    if (st.includes(word)) score++;
  }
  // Bonus for exact prefix match
  if (st.includes(qt.substring(0, 12))) score += 3;
  return score;
}

function findInBankFuzzy(lessonTitle: string, bank: QuestionBank): any[] | null {
  let bestScore = 0;
  let bestQuestions: any[] | null = null;

  for (const mod of bank.modules) {
    for (const lesson of mod.lessons) {
      const score = scoreMatch(lessonTitle, lesson.lessonTitle);
      if (score > bestScore) {
        bestScore = score;
        bestQuestions = lesson.questions;
      }
    }
  }

  return bestScore >= 1 ? bestQuestions : null;
}

// ============================================================
// PUBLIC API
// ============================================================

function findExplicitOverride(lessonTitle: string, bank: QuestionBank): any[] | null {
  const override = EXPLICIT_QUESTION_OVERRIDES[lessonTitle];
  if (!override) return null;

  const mod = bank.modules.find((m) => m.moduleId === override.moduleId);
  const lesson = mod?.lessons.find((l) => l.lessonId === override.lessonId);
  return lesson?.questions ?? null;
}

export function findQuestionsForLesson(lessonTitle: string): {
  questions: any[] | null;
  source: string;
} {
  // 1. Check corrective questions first (highest priority)
  const corrective = CORRECTIVE_MAP.get(lessonTitle);
  if (corrective) {
    return { questions: corrective, source: "corrective" };
  }

  // 2. Check explicit overrides across ALL banks before any fuzzy matching
  // This prevents weak fuzzy matches from shadowing correct supplemental/corrective entries
  const mainExplicit = findExplicitOverride(lessonTitle, MAIN_BANK);
  if (mainExplicit) {
    return { questions: mainExplicit, source: "main-bank" };
  }

  const supplementalExplicit = findExplicitOverride(lessonTitle, SUPPLEMENTAL_BANK);
  if (supplementalExplicit) {
    return { questions: supplementalExplicit, source: "supplemental" };
  }

  // 3. Fuzzy fallback: check main question bank
  const main = findInBankFuzzy(lessonTitle, MAIN_BANK);
  if (main) {
    return { questions: main, source: "main-bank" };
  }

  // 4. Fuzzy fallback: check supplemental question bank
  const supplemental = findInBankFuzzy(lessonTitle, SUPPLEMENTAL_BANK);
  if (supplemental) {
    return { questions: supplemental, source: "supplemental" };
  }

  return { questions: null, source: "none" };
}

// Validation helper: run this to find lessons with no question match
export function validateMappings(seedLessonTitles: string[]): {
  matched: string[];
  unmatched: string[];
} {
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const title of seedLessonTitles) {
    const result = findQuestionsForLesson(title);
    if (result.questions) {
      matched.push(`${title} (${result.source}, ${result.questions.length} qs)`);
    } else {
      unmatched.push(title);
    }
  }

  return { matched, unmatched };
}
