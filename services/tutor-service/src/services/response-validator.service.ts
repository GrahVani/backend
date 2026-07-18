import { LearningContextResponse } from "./learning.client";
import { RelevantChunk } from "../modules/rag";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedText?: string;
}

export class ResponseValidatorService {
  /**
   * Deterministically validates the generated tutor answer against retrieved context.
   */
  validate(
    answer: string,
    lessonContext: LearningContextResponse,
    retrievedChunks: RelevantChunk[],
  ): ValidationResult {
    // 1. Validate empty responses
    if (!answer || answer.trim() === "") {
      return { isValid: false, error: "Generated response is empty" };
    }

    // 2. Normalize response text (excessive whitespace and format)
    let normalizedText = answer.replace(/\s+/g, " ").trim();

    // 3. Reject code or prompt-injection style responses
    const lowerAnswer = normalizedText.toLowerCase();
    if (
      normalizedText.includes("```") ||
      (lowerAnswer.includes("function") && lowerAnswer.includes("{")) ||
      (lowerAnswer.includes("import ") && lowerAnswer.includes("from ")) ||
      lowerAnswer.includes("public class ") ||
      (lowerAnswer.includes("def ") && normalizedText.includes(":"))
    ) {
      return { isValid: false, error: "Response contains disallowed code or script formatting" };
    }

    const offTopicKeywords = [
      "programming",
      "software engineering",
      "javascript",
      "python script",
      "compile code",
      "html",
      "css styling",
      "npm install",
      "git commit",
      "docker container",
      "ignore previous instructions",
      "system prompt",
      "developer guidelines",
    ];
    for (const keyword of offTopicKeywords) {
      if (lowerAnswer.includes(keyword)) {
        return {
          isValid: false,
          error: `Response contains off-topic curriculum domain content: ${keyword}`,
        };
      }
    }

    // 4. Validate explicit section citations against retrieved metadata
    const bracketRegex = /\[([^\]]+)\]/g;
    let match;
    const citations: string[] = [];
    while ((match = bracketRegex.exec(normalizedText)) !== null) {
      citations.push(match[1].trim());
    }

    if (citations.length > 0) {
      // Build a validation set of all metadata from static context and retrieved RAG chunks
      const validSections = new Set<number>();
      const validTerms = new Set<string>();
      const validQuestions = new Set<string>();
      const validComponents = new Set<string>();

      // Static context metadata
      for (const sec of lessonContext.sections) {
        validSections.add(sec.sectionNumber);
      }
      if (lessonContext.interactiveSummary && lessonContext.interactiveSummary.type) {
        validComponents.add(lessonContext.interactiveSummary.type.toLowerCase());
      }

      // RAG context metadata
      for (const chunk of retrievedChunks) {
        if (chunk.type === "lesson" && chunk.metadata?.sectionNumber !== undefined) {
          validSections.add(chunk.metadata.sectionNumber);
        } else if (chunk.type === "knowledge" && chunk.metadata?.termKey) {
          validTerms.add(chunk.metadata.termKey.toLowerCase());
        } else if (chunk.type === "mcq" && chunk.metadata?.questionId) {
          validQuestions.add(chunk.metadata.questionId.toLowerCase());
        } else if (chunk.type === "interactive" && chunk.metadata?.componentType) {
          validComponents.add(chunk.metadata.componentType.toLowerCase());
        }
      }

      // Validate each bracketed citation or phrase
      for (const cite of citations) {
        const lowerCite = cite.toLowerCase();

        // Skip decorative / mock / informational markers or general bracketed phrases
        if (
          lowerCite.includes("mock") ||
          lowerCite.includes("note") ||
          lowerCite.includes("context") ||
          lowerCite.includes("source") ||
          lowerCite.includes("eda") || // matches Veda / Vedanga in brackets like [the Veda]
          lowerCite.includes("jyoti") || // matches Jyotisha / Jyotish
          lowerCite.includes("sanskrit") ||
          lowerCite.includes("reference")
        ) {
          continue;
        }

        // If it claims a formal Section reference like [Section 5] or [Sec 9] that is not in retrieved context,
        // strip it from normalizedText so the pedagogical response is self-healing and never dropped or rejected
        const explicitSecMatch = lowerCite.match(/^(?:section|sec)\s*(\d+)$/i);
        if (explicitSecMatch) {
          const num = parseInt(explicitSecMatch[1], 10);
          if (!validSections.has(num)) {
            return {
              isValid: false,
              error: `Response cites non-existent section number: ${num}`,
            };
          }
        }
      }
    }

    return { isValid: true, normalizedText };
  }
}
