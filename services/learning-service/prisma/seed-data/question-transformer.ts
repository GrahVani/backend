// ============================================================
// QUESTION FORMAT TRANSFORMER
// ============================================================
// Converts question-bank formats (A, B, C) into the frontend
// InteractiveQuiz.tsx expected format.
//
// INPUT FORMATS:
//   Format A (main-bank.json):
//     { id, question, options: string[], correctAnswerIndex: number,
//       explanationCorrect: string, explanationsWrong: string[]|object }
//
//   Format B (supplemental.json):
//     { id, type: "multiple-choice", question,
//       options: [{text, isCorrect, explanation}, ...] }
//
//   Format C (corrective.json):
//     { id, question, options: string[], correctAnswerIndex: number,
//       explanationCorrect: string, explanationsWrong: object }
//
// OUTPUT FORMAT (frontend expected):
//   { questionId: number, type: "multiple_choice", question: string,
//     options: { A: "...", B: "...", ... }, correctAnswer: "A",
//     explanation: string, whyWrong?: { A: "...", B: "..." },
//     difficulty?: string }
// ============================================================

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

let globalQuestionId = 1;

function resetQuestionId() {
  globalQuestionId = 1;
}

function nextQuestionId(): number {
  return globalQuestionId++;
}

function indexToKey(index: number): string {
  return OPTION_KEYS[index] ?? String(index);
}

/**
 * Detects if options are in Format B (array of objects with text/isCorrect)
 */
function isFormatB(options: any): boolean {
  return (
    Array.isArray(options) &&
    options.length > 0 &&
    typeof options[0] === "object" &&
    "text" in options[0]
  );
}

/**
 * Converts an array of option strings to a Record<string, string>
 */
function arrayOptionsToRecord(options: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  options.forEach((opt, idx) => {
    record[indexToKey(idx)] = opt;
  });
  return record;
}

/**
 * Converts Format B options to Record<string, string>
 */
function formatBOptionsToRecord(
  options: Array<{ text: string; isCorrect?: boolean; explanation?: string }>
): {
  optionsRecord: Record<string, string>;
  correctAnswer: string;
  explanations: Record<string, string>;
} {
  const optionsRecord: Record<string, string> = {};
  let correctAnswer = "";
  const explanations: Record<string, string> = {};

  options.forEach((opt, idx) => {
    const key = indexToKey(idx);
    optionsRecord[key] = opt.text;
    if (opt.isCorrect) {
      correctAnswer = key;
    }
    if (opt.explanation) {
      explanations[key] = opt.explanation;
    }
  });

  return { optionsRecord, correctAnswer, explanations };
}

/**
 * Converts explanationsWrong array/object to whyWrong Record
 */
function buildWhyWrong(
  explanationsWrong: any,
  optionCount: number
): Record<string, string> | undefined {
  if (!explanationsWrong) return undefined;

  // Already an object mapping keys → explanations
  if (typeof explanationsWrong === "object" && !Array.isArray(explanationsWrong)) {
    return explanationsWrong;
  }

  // Array of explanations — map by index
  if (Array.isArray(explanationsWrong)) {
    const record: Record<string, string> = {};
    explanationsWrong.forEach((exp, idx) => {
      if (exp && typeof exp === "string") {
        record[indexToKey(idx)] = exp;
      }
    });
    return Object.keys(record).length > 0 ? record : undefined;
  }

  return undefined;
}

/**
 * Transforms a single raw question into the frontend expected format.
 */
export function transformQuestion(raw: any): any {
  if (!raw) return raw;

  // If the question already has the frontend format (has options as object AND type)
  if (
    raw.type &&
    typeof raw.options === "object" &&
    !Array.isArray(raw.options) &&
    !isFormatB(raw.options)
  ) {
    // Already in target format — just ensure questionId is a number
    return {
      ...raw,
      questionId: raw.questionId ?? nextQuestionId(),
    };
  }

  // Determine question type
  let type = raw.type;
  if (!type) {
    // Default to multiple_choice for questions with options array
    if (raw.options && Array.isArray(raw.options)) {
      type = "multiple_choice";
    } else if (raw.correctAnswer === "true" || raw.correctAnswer === "false") {
      type = "true_false";
    } else if (raw.acceptableAnswers) {
      type = "fill_blank";
    } else if (raw.subQuestions) {
      type = "case_study";
    } else {
      type = "multiple_choice"; // safest default
    }
  }

  // Normalize type string
  type = type.replace(/-/g, "_"); // "multiple-choice" → "multiple_choice"

  // Build base transformed question
  const transformed: any = {
    questionId: raw.questionId ?? nextQuestionId(),
    type,
    question: raw.question ?? raw.questionText ?? "",
    difficulty: raw.difficulty,
  };

  // Handle different question types
  switch (type) {
    case "multiple_choice": {
      let optionsRecord: Record<string, string>;
      let correctAnswer: string;
      let explanation = raw.explanation ?? raw.explanationCorrect ?? "";
      let whyWrong: Record<string, string> | undefined;

      if (isFormatB(raw.options)) {
        // Format B: options = [{text, isCorrect, explanation}, ...]
        const fmtB = formatBOptionsToRecord(raw.options);
        optionsRecord = fmtB.optionsRecord;
        correctAnswer = fmtB.correctAnswer;
        whyWrong = fmtB.explanations;
      } else if (Array.isArray(raw.options)) {
        // Format A/C: options = string[]
        optionsRecord = arrayOptionsToRecord(raw.options);
        correctAnswer = indexToKey(raw.correctAnswerIndex ?? 0);
        whyWrong = buildWhyWrong(raw.explanationsWrong, raw.options.length);
      } else if (typeof raw.options === "object") {
        // Already an object (original seed.ts format)
        optionsRecord = raw.options;
        correctAnswer = raw.correctAnswer ?? "A";
        whyWrong = raw.whyWrong;
      } else {
        optionsRecord = {};
        correctAnswer = "A";
      }

      transformed.options = optionsRecord;
      transformed.correctAnswer = correctAnswer;
      transformed.explanation = explanation;
      if (whyWrong && Object.keys(whyWrong).length > 0) {
        transformed.whyWrong = whyWrong;
      }
      if (raw.hint) transformed.hint = raw.hint;
      if (raw.memoryAid) transformed.memoryAid = raw.memoryAid;
      if (raw.conceptRef) transformed.conceptRef = raw.conceptRef;
      if (raw.conceptLadder) transformed.conceptLadder = raw.conceptLadder;
      if (raw.tags) transformed.tags = raw.tags;
      break;
    }

    case "true_false": {
      transformed.correctAnswer =
        raw.correctAnswer === true
          ? "true"
          : raw.correctAnswer === false
            ? "false"
            : raw.correctAnswer ?? "true";
      transformed.explanation = raw.explanation ?? raw.explanationCorrect ?? "";
      if (raw.memoryAid) transformed.memoryAid = raw.memoryAid;
      break;
    }

    case "fill_blank": {
      transformed.correctAnswer = raw.correctAnswer ?? "";
      transformed.acceptableAnswers = raw.acceptableAnswers;
      transformed.explanation = raw.explanation ?? raw.explanationCorrect ?? "";
      if (raw.hint) transformed.hint = raw.hint;
      if (raw.memoryAid) transformed.memoryAid = raw.memoryAid;
      break;
    }

    case "case_study": {
      transformed.scenario = raw.scenario ?? "";
      transformed.subQuestions = (raw.subQuestions ?? []).map((sq: any) =>
        transformQuestion({ ...sq, type: "multiple_choice" })
      );
      if (raw.memoryAid) transformed.memoryAid = raw.memoryAid;
      break;
    }

    case "matching": {
      transformed.pairs = raw.pairs ?? [];
      if (raw.explanation) transformed.explanation = raw.explanation;
      break;
    }

    default:
      // Unknown type — pass through with minimal normalization
      transformed.correctAnswer = raw.correctAnswer;
      transformed.explanation = raw.explanation ?? raw.explanationCorrect ?? "";
      if (raw.options) transformed.options = raw.options;
      break;
  }

  return transformed;
}

/**
 * Transforms an array of raw questions.
 */
export function transformQuestions(rawQuestions: any[]): any[] {
  if (!Array.isArray(rawQuestions)) return [];
  resetQuestionId();
  return rawQuestions.map(transformQuestion);
}
