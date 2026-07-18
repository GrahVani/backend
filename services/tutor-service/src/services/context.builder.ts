import { LearningContextResponse, LearnerProgressResponse } from "./learning.client";
import { TutorMessage, LearnerTutorProfile } from "@grahvani/tutor-database";
import { RelevantChunk } from "../modules/rag";

export interface ContextBuilderResult {
  content: string;
  lessonContext: string;
  conversationHistory: string;
}

export interface ContextBuilderOptions {
  maxCharacters?: number;
}

export interface ClientScreenContext {
  sectionNumber?: number;
  componentType?: string;
  componentState?: any;
}

export class ContextBuilder {
  private readonly maxCharacters: number;

  constructor(options?: ContextBuilderOptions) {
    this.maxCharacters = options?.maxCharacters || 8000;
  }

  /**
   * Compiles and formats lesson context, conversation history, and current question.
   */
  build(
    userQuestion: string,
    lessonContext: LearningContextResponse,
    messages: TutorMessage[],
    retrievedChunks?: RelevantChunk[],
    sessionSummary?: string | null,
    learnerProgress?: LearnerProgressResponse | null,
    clientContext?: ClientScreenContext | null,
    learnerProfile?: LearnerTutorProfile | null,
  ): ContextBuilderResult {
    const activeNum =
      clientContext && typeof clientContext.sectionNumber === "number"
        ? clientContext.sectionNumber
        : 1;

    // To prevent static token bloat while maintaining full pedagogical awareness,
    // only the current active section (or section 1) is injected in full;
    // all remaining sections are provided as structured syllabus headings, relying on
    // RAG retrieved chunks to supply targeted detail from other sections when relevant.
    const sectionTexts = lessonContext.sections.map((sec) => {
      if (sec.sectionNumber === activeNum) {
        return `### Section ${sec.sectionNumber}: ${sec.sectionTitle} (${sec.sectionType})\n${sec.content}`;
      }
      return `### Section ${sec.sectionNumber}: ${sec.sectionTitle} [Syllabus Reference]`;
    });

    if (lessonContext.interactiveSummary) {
      sectionTexts.push(
        `### Interactive Component: ${lessonContext.interactiveSummary.type}\nSpec:\n${lessonContext.interactiveSummary.spec}\nFallback:\n${lessonContext.interactiveSummary.fallback}`,
      );
    }

    const lessonContextString = [
      `Lesson: ${lessonContext.lesson.title}`,
      lessonContext.lesson.subtitle ? `Subtitle: ${lessonContext.lesson.subtitle}` : "",
      `Learning Outcomes: ${lessonContext.lesson.learningOutcomes.join(", ")}`,
      "",
      ...sectionTexts,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Process retrieved RAG chunks
    const formattedRAGChunks: string[] = [];
    const seenContent = new Set<string>();

    for (const chunk of retrievedChunks || []) {
      const contentTrim = chunk.content.trim();
      // Deduplicate: Skip if already exists in static context or seen in this batch
      if (lessonContextString.includes(contentTrim) || seenContent.has(contentTrim)) {
        continue;
      }
      seenContent.add(contentTrim);

      let header = "";
      if (chunk.type === "lesson") {
        header = `[Retrieved Lesson Section Reference]`;
      } else if (chunk.type === "mcq") {
        header = `[Retrieved Multiple Choice Question]`;
      } else if (chunk.type === "knowledge") {
        header = `[Retrieved Glossary Term]`;
      } else if (chunk.type === "interactive") {
        header = `[Retrieved Interactive Component Reference]`;
      }

      formattedRAGChunks.push(`### ${header}\n${chunk.content}`);
    }

    const ragContextString = formattedRAGChunks.join("\n\n");

    let progressString = "";
    if (learnerProgress) {
      progressString = `## Learner Progress\nLevel: ${learnerProgress.level}\nTier: ${learnerProgress.tier}\nXP: ${learnerProgress.xp || 0}\nLesson Status: ${learnerProgress.lessonStatus}\nCompletion: ${learnerProgress.completionPercentage}%\nQuiz Score: ${learnerProgress.quizScore}%\nAttempts: ${learnerProgress.quizAttempts}\nCurrent Streak: ${learnerProgress.currentStreak}`;
    }

    let activeScreenString = "";
    if (clientContext) {
      const parts: string[] = [];
      if (typeof clientContext.sectionNumber === "number") {
        parts.push(`Active Section: Section ${clientContext.sectionNumber}`);
      }
      if (clientContext.componentType) {
        parts.push(`Active Interactive Component: ${clientContext.componentType}`);
      }
      if (clientContext.componentState) {
        parts.push(
          `Component State: ${typeof clientContext.componentState === "object" ? JSON.stringify(clientContext.componentState) : clientContext.componentState}`,
        );
      }
      if (parts.length > 0) {
        const hasFailedAttempt =
          (typeof clientContext.componentState === "object" && clientContext.componentState !== null && clientContext.componentState.isCorrect === false) ||
          (learnerProgress && typeof learnerProgress.quizScore === "number" && learnerProgress.quizScore < 70 && (learnerProgress.quizAttempts || 0) > 0);

        const socraticRule = hasFailedAttempt
          ? `\n\n[SOCRATIC SCAFFOLDING & ERROR RECOVERY MANDATE]\nThe learner is currently struggling with or has failed an interactive question/assessment (or scored < 70%). CRITICAL RULE: DO NOT reveal the direct correct option on your first turn! Instead:\n1. Validate their effort gently.\n2. Provide a conceptual hint or Socratic guiding question pointing toward the underlying principle.\n3. Encourage them to try again after reflecting on your hint.`
          : "";

        const explainInteractiveRule = clientContext.componentType
          ? `\n\n[EXPLAIN INTERACTIVE COMPONENT MANDATE]\nThe learner is interacting with the diagram/tool (${clientContext.componentType}). When explaining or breaking down this interactive component:\n1. Walk through the visual controls and current state clearly.\n2. Connect the diagram settings directly to astrological calculations or rules.\n3. Guide them on what changes to test next in the tool.`
          : "";

        activeScreenString = `## Active Learner Screen Position (Context Sync)\nThe student is currently viewing:\n- ${parts.join("\n- ")}\n\n[DYNAMIC SECTION-BOUND PEDAGOGY RULE]\nRestrict your explanation strictly to concepts covered up to and including this active section. Do not introduce advanced formulas or future section concepts unless specifically asked.\n\n[CITATION & GROUNDING MANDATE]\nWhenever you explain a concept that originates from one of the lesson sections, explicitly cite the section tag in brackets (e.g., [Section 1] or [Section 2]). This allows the learner to click the citation and jump directly to the source text in their study panel.${socraticRule}${explainInteractiveRule}`;
      }
    }

    let profileString = "";
    if (learnerProfile) {
      const parts: string[] = [];
      if (learnerProfile.preferredExplanationStyle) {
        parts.push(`Preferred Explanation Style: ${learnerProfile.preferredExplanationStyle}`);
      }
      if (learnerProfile.preferredLanguage) {
        parts.push(`Preferred Language: ${learnerProfile.preferredLanguage}`);
      }
      if (learnerProfile.weakConcepts && learnerProfile.weakConcepts.length > 0) {
        parts.push(`Weak Concepts Needing Reinforcement: ${learnerProfile.weakConcepts.join(", ")}`);
      }
      if (learnerProfile.strongConcepts && learnerProfile.strongConcepts.length > 0) {
        parts.push(`Mastered Concepts: ${learnerProfile.strongConcepts.join(", ")}`);
      }
      if (learnerProfile.askedConcepts && learnerProfile.askedConcepts.length > 0) {
        parts.push(`Recent Curiosity & Asked Topics across sessions: ${learnerProfile.askedConcepts.slice(-5).join(", ")}`);
      }
      if (learnerProfile.summary) {
        parts.push(`Historical Cognitive Summary: ${learnerProfile.summary}`);
      }
      if (parts.length > 0) {
        profileString = `## AI Tutor Cognitive Memory (Learner Profile)\n- ${parts.join("\n- ")}\n\n[PEDAGOGICAL ADAPTATION RULE]\nAdapt your tone, vocabulary, and explanation structure to match this learner's profile. Gently reinforce weak concepts when relevant.`;
      }
    }

    let mergedContext = [
      activeScreenString,
      progressString ? progressString : "",
      profileString,
      lessonContextString,
      ragContextString ? `## Grounding References (RAG)\n\n${ragContextString}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (mergedContext.length > this.maxCharacters) {
      mergedContext =
        mergedContext.slice(0, this.maxCharacters) + "\n\n[Context truncated due to size limit]";
    }

    let historyString = "";
    if (sessionSummary) {
      historyString += `[Session Summary of previous conversation]: ${sessionSummary}\n\n`;
    }

    // Enterprise Production-Grade History Windowing & Token Budgeting:
    // Enforce a strict sliding window (last 4 turns if summary exists, 6 otherwise) AND a tight character budget (~2,000 chars = ~500 tokens max)
    const maxMessages = sessionSummary ? 4 : 6;
    const activeMessages = messages
      .filter((msg) => !msg.deletedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-maxMessages);

    const maxHistoryChars = 2000;
    const formattedMessages: string[] = [];
    let currentHistoryLength = 0;

    for (let i = activeMessages.length - 1; i >= 0; i--) {
      const msg = activeMessages[i];
      let content = msg.content || "";
      if (msg.role === "ASSISTANT" && content.length > 450) {
        content = content.slice(0, 450) + "... [truncated for token optimization]";
      } else if (msg.role === "USER" && content.length > 300) {
        content = content.slice(0, 300) + "... [truncated]";
      }
      const line = `${msg.role === "USER" ? "User" : "Assistant"}: ${content}`;

      if (currentHistoryLength + line.length > maxHistoryChars && formattedMessages.length > 0) {
        break; // Stop including older turns once history character budget is reached
      }
      formattedMessages.unshift(line);
      currentHistoryLength += line.length;
    }

    historyString += formattedMessages.join("\n");

    return {
      content: userQuestion,
      lessonContext: mergedContext,
      conversationHistory: historyString,
    };
  }
}
