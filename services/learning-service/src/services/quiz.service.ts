/**
 * Quiz Service
 * Based on 06-assessment-design-standard.md §8
 *
 * Handles MCQ delivery (with randomisation) and submission scoring
 * with mastery gates (80% threshold, 24h cooldown).
 */

import * as fs from "fs";
import * as path from "path";
import { CURRICULUM_ROOT } from "../utils/curriculum-path";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { SectionsViewedJson } from "../types/prisma-json";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  questionId: string;
  stem: string;
  stem_devanagari?: string | null;
  question_type: string;
  bloom_level: string;
  difficulty: string;
  options: QuizOption[];
  tags?: string[];
}

export interface QuizDelivery {
  lessonId: string;
  lessonSlug: string;
  totalQuestions: number;
  questions: QuizQuestion[];
  passingThresholdPercent: number;
  cooldownHoursAfterFailure: number;
}

export interface QuizSubmissionResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  passed: boolean;
  mastered: boolean;
  cooldownActive: boolean;
  nextAttemptAt?: Date;
  questionResults: Array<{
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    correctOptionId: string;
    explanation: string;
  }>;
}

// ─────────────────────────────────────────────────────────────
// MCQ Bank Loader
// ─────────────────────────────────────────────────────────────

export interface McqQuestion {
  id: string;
  questionId?: string;
  stem: string;
  stem_devanagari?: string;
  type?: string;
  question_type?: string;
  options: Array<{
    id: string;
    text: string;
    is_correct: boolean;
    explanation?: string;
  }>;
  pairs?: Array<{ left: string; right: string }>;
  correctOrder?: string[];
  difficulty: "easy" | "medium" | "hard";
  bloom_level: string;
  concept_tags: string[];
  tags?: string[];
  explanation?: string;
  acceptableAnswers?: string[];
  spaced_repetition?: {
    include_in_sr_deck: boolean;
    sr_card_front?: string;
    sr_card_back?: string;
  };
}

export interface QuizAnswerRecord {
  questionId: string;
  selectedOptionIndex?: number;
  userAnswer: string | string[];
  isCorrect: boolean;
  timeSpentSeconds?: number;
  conceptTags?: string[];
}

export function loadMcqBank(mcqBankFile: string | null): McqQuestion[] {
  if (!mcqBankFile) return [];
  try {
    const bankPath = path.join(CURRICULUM_ROOT, mcqBankFile);
    if (fs.existsSync(bankPath)) {
      const raw = fs.readFileSync(bankPath, "utf-8");
      const parsed = JSON.parse(raw);
      const rawQuestions = parsed.questions || parsed || [];
      return Array.isArray(rawQuestions) ? rawQuestions.map(normalizeMcqQuestion) : [];
    }
  } catch (e) {
    logger.warn({ mcqBankFile, error: e }, "Failed to load MCQ bank");
  }
  return [];
}

/**
 * Normalize MCQ questions from various curriculum formats into the
 * canonical McqQuestion shape expected by the quiz engine.
 */
function normalizeMcqQuestion(raw: any): McqQuestion {
  const options = (raw.options || []).map((opt: any) => ({
    id: String(opt.id || ""),
    text: String(opt.text || ""),
    is_correct: Boolean(opt.is_correct ?? opt.isCorrect ?? false),
    explanation: opt.explanation || opt.explanation_if_chosen || "",
  }));

  return {
    id: String(raw.id || raw.questionId || ""),
    questionId: raw.questionId ? String(raw.questionId) : undefined,
    stem: String(raw.stem || raw.question_text || raw.question || ""),
    stem_devanagari: raw.stem_devanagari || undefined,
    type: raw.type || raw.question_type || "single-best",
    question_type: raw.question_type || raw.type || "single-best",
    options,
    pairs: raw.pairs || undefined,
    correctOrder: raw.correctOrder || undefined,
    difficulty: raw.difficulty || "medium",
    bloom_level: raw.bloom_level || "Remember",
    concept_tags: Array.isArray(raw.concept_tags) ? raw.concept_tags : [],
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    explanation: raw.explanation || "",
    acceptableAnswers: Array.isArray(raw.acceptableAnswers) ? raw.acceptableAnswers : undefined,
    spaced_repetition: raw.spaced_repetition || raw.spaced_repetition_card || undefined,
  };
}

/**
 * Load MCQ bank from PostgreSQL (DB-only architecture).
 * Returns the same shape as loadMcqBank for drop-in replacement.
 */
export async function loadMcqBankFromDb(lessonId: string): Promise<McqQuestion[]> {
  const bank = await prisma.mcqBank.findUnique({ where: { lessonId } });
  if (!bank) return [];
  const rawQuestions = bank.questions as unknown as any[] | undefined;
  if (!Array.isArray(rawQuestions)) return [];
  return rawQuestions.map(normalizeMcqQuestion);
}

export function loadChapterMcqBank(chapterSlug: string, moduleSlug: string, tier: number): McqQuestion[] {
  const bankPath = path.join(
    CURRICULUM_ROOT,
    "assessment-bank",
    `tier-${tier}-mcq-bank`,
    "_chapter-checks",
    moduleSlug,
    `${chapterSlug}.json`
  );
  if (fs.existsSync(bankPath)) {
    try {
      const raw = fs.readFileSync(bankPath, "utf-8");
      const parsed = JSON.parse(raw);
      const rawQuestions = parsed.questions || [];
      return Array.isArray(rawQuestions) ? rawQuestions.map(normalizeMcqQuestion) : [];
    } catch (e) {
      logger.warn({ bankPath, error: e }, "Failed to load chapter MCQ bank");
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────
// Randomisation
// ─────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Builds a deliverable quiz with randomised questions and options.
 * Strips correct answers and explanations.
 */
export function buildDeliverableQuiz(rawQuestions: McqQuestion[]): QuizQuestion[] {
  // Shuffle question order
  const shuffledQuestions = shuffleArray(rawQuestions);

  return shuffledQuestions.map((q) => {
    // Shuffle options and strip is_correct + explanation
    const shuffledOptions = shuffleArray(q.options || []).map((opt) => ({
      id: opt.id,
      text: opt.text,
    }));

    return {
      questionId: q.id || q.questionId || "",
      stem: q.stem,
      stem_devanagari: q.stem_devanagari,
      question_type: q.question_type || q.type || "single-best",
      bloom_level: q.bloom_level,
      difficulty: q.difficulty,
      options: shuffledOptions,
      tags: q.tags,
    };
  });
}

/**
 * Frontend-compatible quiz format.
 * Maps internal MCQ structure to what the React frontend expects.
 */
export interface FrontendQuizQuestion {
  questionId: number;
  type: "multiple_choice" | "true_false" | "matching" | "fill_blank" | "case_study";
  question: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  difficulty?: string;
  conceptRef?: number;
  hint?: string;
  memoryAid?: string;
  whyWrong?: Record<string, string>;
  pairs?: Array<{ left: string; right: string }>;
  acceptableAnswers?: string[];
  scenario?: string;
  subQuestions?: Array<{
    questionId: number;
    question: string;
    options: Record<string, string>;
    correctAnswer: string;
    explanation: string;
    whyWrong?: Record<string, string>;
  }>;
}

/**
 * Builds a frontend-compatible quiz from raw MCQ bank questions.
 * Includes correct answers (required for client-side immediate feedback).
 */
export function buildFrontendQuiz(rawQuestions: McqQuestion[]): FrontendQuizQuestion[] {
  const shuffledQuestions = shuffleArray(rawQuestions);
  let idCounter = 1;

  return shuffledQuestions.map((q) => {
    const qid = idCounter++;
    const qType = q.question_type || q.type || "single-best";

    // Map question type
    let mappedType: FrontendQuizQuestion["type"] = "multiple_choice";
    if (qType === "true-false") mappedType = "true_false";
    else if (qType === "match") mappedType = "matching";
    else if (qType === "fill-blank") mappedType = "fill_blank";
    else if (qType === "case-study") mappedType = "case_study";

    // Find correct option
    const correctOpt = (q.options || []).find((o) => o.is_correct);
    const correctAnswer = correctOpt?.id || "";

    // Build whyWrong map from wrong options
    const whyWrong: Record<string, string> = {};
    for (const opt of q.options || []) {
      if (!opt.is_correct && opt.explanation) {
        whyWrong[opt.id] = opt.explanation;
      }
    }

    // Convert options array to Record<string, string>
    const shuffledOptions = shuffleArray(q.options || []);
    const optionsRecord: Record<string, string> = {};
    for (const opt of shuffledOptions) {
      optionsRecord[opt.id] = opt.text;
    }

    const base: FrontendQuizQuestion = {
      questionId: qid,
      type: mappedType,
      question: q.stem,
      options: optionsRecord,
      correctAnswer,
      explanation: correctOpt?.explanation || q.explanation || "",
      difficulty: q.difficulty,
      conceptRef: q.concept_tags?.length ? qid : undefined,
      whyWrong: Object.keys(whyWrong).length > 0 ? whyWrong : undefined,
    };

    // Handle matching questions
    if (mappedType === "matching" && q.pairs && q.pairs.length > 0) {
      base.pairs = q.pairs;
      base.options = {}; // matching doesn't use standard options
    }

    // Handle fill-blank
    if (mappedType === "fill_blank") {
      base.acceptableAnswers = q.acceptableAnswers;
      base.options = {};
    }

    return base;
  });
}

// ─────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────

function scoreQuestion(
  question: McqQuestion,
  userAnswer: string | string[] | Record<string, string>
): { isCorrect: boolean; correctOptionId: string; explanation: string } {
  const options = question.options || [];
  const correctOpt = options.find((o) => o.is_correct);
  const correctOptionId = correctOpt?.id || "";

  if (question.question_type === "multi-select" || question.type === "multi-select") {
    const userAnswers = Array.isArray(userAnswer)
      ? userAnswer
      : typeof userAnswer === "string"
      ? JSON.parse(userAnswer)
      : [];
    const correctIds = options.filter((o) => o.is_correct).map((o) => o.id);
    const isCorrect =
      correctIds.length === userAnswers.length &&
      correctIds.every((id) => userAnswers.includes(id));
    return {
      isCorrect,
      correctOptionId: correctIds.join(","),
      explanation: correctOpt?.explanation || "",
    };
  }

  if (question.question_type === "match" || question.type === "match") {
    try {
      const matched = typeof userAnswer === "string" ? JSON.parse(userAnswer) : userAnswer;
      const pairs = question.pairs || [];
      let allCorrect = true;
      for (const pair of pairs) {
        if (matched[pair.left] !== pair.right) {
          allCorrect = false;
          break;
        }
      }
      const isCorrect =
        allCorrect && Object.keys(matched || {}).length === pairs.length;
      return {
        isCorrect,
        correctOptionId: "match",
        explanation: correctOpt?.explanation || "",
      };
    } catch (e) {
      logger.warn({ error: e, userAnswer }, "Invalid match-type answer JSON");
      return { isCorrect: false, correctOptionId: "match", explanation: "" };
    }
  }

  if (question.question_type === "fill-blank" || question.type === "fill-blank") {
    const userAns = String(userAnswer).trim().toLowerCase();
    const correctAns = String(correctOpt?.text || "").trim().toLowerCase();
    const acceptable = (question.acceptableAnswers || []).map((a) => a.trim().toLowerCase());
    const isCorrect = userAns === correctAns || acceptable.includes(userAns);
    return {
      isCorrect,
      correctOptionId: correctAns,
      explanation: correctOpt?.explanation || "",
    };
  }

  if (question.question_type === "order" || question.type === "order") {
    try {
      const userOrder = Array.isArray(userAnswer)
        ? userAnswer
        : JSON.parse(userAnswer as string);
      const correctOrder = question.correctOrder || [];
      const isCorrect =
        JSON.stringify(userOrder) === JSON.stringify(correctOrder);
      return {
        isCorrect,
        correctOptionId: "order",
        explanation: correctOpt?.explanation || "",
      };
    } catch (e) {
      logger.warn({ error: e, userAnswer }, "Invalid order-type answer JSON");
      return { isCorrect: false, correctOptionId: "order", explanation: "" };
    }
  }

  // Default: single-best, true-false
  const isCorrect = String(userAnswer).toUpperCase() === String(correctOptionId).toUpperCase();
  return {
    isCorrect,
    correctOptionId,
    explanation: correctOpt?.explanation || "",
  };
}

// ─────────────────────────────────────────────────────────────
// Cooldown Check
// ─────────────────────────────────────────────────────────────

export async function checkCooldown(
  userId: string,
  lessonId: string
): Promise<{ cooldownActive: boolean; nextAttemptAt?: Date; lastFailedAttempt?: Date }> {
  const failedAttempts = await prisma.quizAttempt.findMany({
    where: { userId, lessonId, score: { lt: 80 } },
    orderBy: { createdAt: "desc" },
  });

  if (failedAttempts.length === 0) {
    return { cooldownActive: false };
  }

  const lastFailedAttempt = failedAttempts[0];
  const failCount = failedAttempts.length;

  let cooldownMs = 15 * 60 * 1000; // 15 mins
  if (failCount === 2) {
    cooldownMs = 8 * 60 * 60 * 1000; // 8 hours
  } else if (failCount >= 3) {
    cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  const cooldownEnd = new Date(lastFailedAttempt.createdAt.getTime() + cooldownMs);

  if (new Date() < cooldownEnd) {
    return { cooldownActive: true, nextAttemptAt: cooldownEnd, lastFailedAttempt: lastFailedAttempt.createdAt };
  }

  return { cooldownActive: false };
}

// ─────────────────────────────────────────────────────────────
// Quiz Submission
// ─────────────────────────────────────────────────────────────

export async function submitQuiz(
  userId: string,
  lessonId: string,
  rawQuestions: McqQuestion[],
  answers: Array<{ questionId: string; answer: string | string[] | Record<string, string> }>
): Promise<QuizSubmissionResult> {
  // Check cooldown first
  const cooldownCheck = await checkCooldown(userId, lessonId);
  if (cooldownCheck.cooldownActive) {
    return {
      score: 0,
      totalQuestions: rawQuestions.length,
      correctAnswers: 0,
      passed: false,
      mastered: false,
      cooldownActive: true,
      nextAttemptAt: cooldownCheck.nextAttemptAt,
      questionResults: [],
    };
  }

  let correctCount = 0;
  const questionResults: QuizSubmissionResult["questionResults"] = [];

  for (const ans of answers) {
    const q = rawQuestions.find((rq) => (rq.id || rq.questionId) === ans.questionId);
    if (!q) continue;

    const score = scoreQuestion(q, ans.answer);
    if (score.isCorrect) correctCount++;

    questionResults.push({
      questionId: ans.questionId,
      userAnswer: typeof ans.answer === "object" ? JSON.stringify(ans.answer) : String(ans.answer),
      isCorrect: score.isCorrect,
      correctOptionId: score.correctOptionId,
      explanation: score.explanation,
    });
  }

  const totalQuestions = rawQuestions.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = score >= 80;
  const mastered = passed;

  return {
    score,
    totalQuestions,
    correctAnswers: correctCount,
    passed,
    mastered,
    cooldownActive: false,
    questionResults,
  };
}

// ─────────────────────────────────────────────────────────────
// Lesson Mastery Check
// ─────────────────────────────────────────────────────────────

export async function checkLessonMasteryRequirements(
  userId: string,
  lessonId: string
): Promise<{
  allSectionsViewed: boolean;
  interactiveInteracted: boolean;
  quizMastered: boolean;
  bestQuizScore: number;
  sectionsViewedCount: number;
  totalSections: number;
}> {
  const [lesson, lessonProgress, quizAttempts] = await Promise.all([
    prisma.lesson.findUnique({ where: { id: lessonId } }),
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    }),
    prisma.quizAttempt.findMany({ take: 250, 
      where: { userId, lessonId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!lesson) {
    return {
      allSectionsViewed: false,
      interactiveInteracted: false,
      quizMastered: false,
      bestQuizScore: 0,
      sectionsViewedCount: 0,
      totalSections: 0,
    };
  }

  const sectionsViewed = (lessonProgress?.sectionsViewedJson as unknown as SectionsViewedJson) || [];
  const totalSections = countSectionsInMarkdown(lesson.bodyMarkdown);
  const allSectionsViewed = totalSections > 0 && sectionsViewed.length >= totalSections;

  const bestQuizScore = quizAttempts.length > 0 ? Math.max(...quizAttempts.map((qa) => qa.score)) : 0;
  const quizMastered = bestQuizScore >= 80;

  let interactiveInteracted = !lesson.interactiveEnabled;
  if (lesson.interactiveEnabled) {
    const eventCount = await prisma.interactiveEvent.count({
      where: { userId, lessonId: lesson.id },
    });
    interactiveInteracted = eventCount > 0;
  }

  return {
    allSectionsViewed,
    interactiveInteracted,
    quizMastered,
    bestQuizScore,
    sectionsViewedCount: sectionsViewed.length,
    totalSections,
  };
}

function countSectionsInMarkdown(bodyMarkdown: string | null): number {
  if (!bodyMarkdown) return 0;
  const matches = bodyMarkdown.match(/^#\s+§\d+/gm);
  return matches ? matches.length : 0;
}
