import { ConversationFacade } from "../modules/conversation";
import { LearningContextClient } from "./learning.client";
import { PromptFacade } from "../modules/prompt";
import { GeminiClient, TutorLLMError } from "../clients/gemini.client";
import { ContextBuilder } from "./context.builder";
import { logger } from "../config/logger";
import { randomUUID } from "crypto";
import { AnalyticsFacade } from "../modules/analytics";
import { RAGFacade } from "../modules/rag";
import { ResponseValidatorService } from "./response-validator.service";

export interface ChatParams {
  userId: string;
  lessonSlug: string;
  sessionId: string;
  message: string;
  clientMessageId?: string;
  context?: {
    sectionNumber?: number;
    componentType?: string;
    componentState?: any;
  };
}

export interface CitationItem {
  source: string;
  section?: number;
}

export interface ChatResult {
  answer: string;
  sessionId: string;
  messageId: string;
  promptVersion: string;
  citations: CitationItem[];
}

function buildCleanCitations(retrievedChunks: any[], lessonSlug: string, fallbackSection?: number): CitationItem[] {
  const seen = new Set<string>();
  const results: CitationItem[] = [];

  for (const c of retrievedChunks) {
    const rawSec = c.metadata?.sectionNumber ?? c.metadata?.section ?? fallbackSection;
    const secNum =
      typeof rawSec === "number"
        ? rawSec
        : typeof rawSec === "string" && !isNaN(parseInt(rawSec, 10))
          ? parseInt(rawSec, 10)
          : undefined;
    const source = secNum ? `Section ${secNum}` : `Lesson Overview`;
    const key = `${secNum || "overview"}:${source}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        source,
        ...(secNum ? { section: secNum } : {}),
      });
    }
  }

  if (results.length === 0 && typeof fallbackSection === "number") {
    results.push({
      source: `Section ${fallbackSection}`,
      section: fallbackSection,
    });
  } else if (results.length === 0) {
    results.push({
      source: `Lesson Overview`,
    });
  }

  return results;
}

export class TutorOrchestrator {
  constructor(
    private readonly conversationService: ConversationFacade,
    private readonly learningClient: LearningContextClient,
    private readonly promptService: PromptFacade,
    private readonly geminiClient: GeminiClient,
    private readonly contextBuilder: ContextBuilder,
    private readonly analyticsService: AnalyticsFacade,
    private readonly ragFacade: RAGFacade,
    private readonly responseValidator: ResponseValidatorService,
  ) {}

  async chat(params: ChatParams): Promise<ChatResult> {
    const { userId, lessonSlug, message } = params;
    const sessionId = params.sessionId || randomUUID();
    logger.info(
      { userId, lessonSlug, sessionId },
      "Starting tutor orchestrator chat flow with RAG",
    );

    let session = await this.conversationService.getSession(sessionId, userId);
    if (!session) {
      logger.info({ sessionId, userId }, "Session not found, creating a new session");
      session = await this.conversationService.createSession(
        userId,
        `Chat: ${lessonSlug}`,
        lessonSlug,
        sessionId,
      );
    }

    const messages = await this.conversationService.getMessages(sessionId, userId, { limit: 15 });

    const userClientMessageId = params.clientMessageId || `usr-${randomUUID()}`;
    await this.conversationService.createMessage(
      {
        sessionId,
        clientMessageId: userClientMessageId,
        role: "USER",
        content: message,
      },
      userId,
    );

    // Fetch static lesson context, learner progress, and AI learner profile in parallel
    // All three are wrapped with .catch() so a downstream service outage does not crash the chat.
    const [lessonContext, learnerProgress, learnerProfile] = await Promise.all([
      this.learningClient.getLessonContext(lessonSlug).catch((err) => {
        logger.warn({ error: err.message, lessonSlug }, "Failed to fetch lesson context from learning-service, using fallback");
        return {
          lesson: { id: lessonSlug, slug: lessonSlug, title: lessonSlug.replace(/-/g, " "), learningOutcomes: [], prerequisites: [] },
          sections: [],
          knowledge: [],
          interactiveSummary: null,
        } as any;
      }),
      this.learningClient.getLearnerProgress(userId, lessonSlug).catch((err) => {
        logger.warn({ error: err.message }, "Failed to fetch learner progress, using fallback");
        return null;
      }),
      this.conversationService.getLearnerProfile(userId).catch((err: any) => {
        logger.warn({ error: err.message }, "Failed to fetch learner profile, using fallback");
        return null;
      }),
    ]);

    // Retrieve relevant chunks via RAGFacade
    let retrievedChunks: any[] = [];
    try {
      retrievedChunks = await this.ragFacade.retrieveRelevantChunks(message, {
        lessonSlug,
        limit: 3,
        minScore: 0.55,
      });
    } catch (ragErr: any) {
      logger.error(
        { error: ragErr.message },
        "RAG retrieval failed inside orchestrator, falling back to static context only",
      );
    }

    // Build unified context
    const builderContext = this.contextBuilder.build(
      message,
      lessonContext,
      messages,
      retrievedChunks,
      session.summary,
      learnerProgress,
      params.context,
      learnerProfile,
    );

    // Render system prompt
    const renderResult = await this.promptService.renderPrompt({
      content: builderContext.content,
      lessonContext: builderContext.lessonContext,
      conversationHistory: builderContext.conversationHistory,
    });

    let attempts = 0;
    const maxAttempts = 3;
    let geminiRes: any;
    let normalizedAnswer = "";

    while (attempts < maxAttempts) {
      attempts++;
      logger.info(
        { sessionId, attempt: attempts },
        "[TutorOrchestrator] Generating tutor response",
      );
      try {
        geminiRes = await this.geminiClient.generateDetailed(renderResult.rendered);
      } catch (llmErr: any) {
        const errMsg = llmErr?.message || "";
        if (
          llmErr?.code === "RATE_LIMITED" ||
          llmErr?.code === "LLM_UNAVAILABLE" ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("Circuit breaker")
        ) {
          logger.warn(
            { error: errMsg, lessonSlug, sessionId },
            "[TutorOrchestrator] Gemini API rate limited during chat. Using pedagogical fallback.",
          );
          const fallbackText = this.generatePedagogicalFallback(message, lessonContext, retrievedChunks);
          geminiRes = {
            text: fallbackText,
            model: "gemini-2.5-flash-lite-fallback",
            finishReason: "STOP",
            inputTokens: Math.ceil(renderResult.rendered.length / 4),
            outputTokens: Math.ceil(fallbackText.length / 4),
            totalTokens: Math.ceil((renderResult.rendered.length + fallbackText.length) / 4),
            latencyMs: 100,
          };
        } else {
          throw llmErr;
        }
      }
      const rawAnswer = geminiRes.text;

      const validation = this.responseValidator.validate(rawAnswer, lessonContext, retrievedChunks);
      if (validation.isValid) {
        normalizedAnswer = validation.normalizedText || rawAnswer;
        logger.info(
          { sessionId, attempt: attempts },
          "[TutorOrchestrator] Response validation passed successfully",
        );
        break;
      }

      logger.warn(
        { sessionId, attempt: attempts, error: validation.error },
        "[TutorOrchestrator] Generated response validation failed",
      );

      if (attempts >= maxAttempts) {
        logger.error(
          { sessionId, attempts },
          "[TutorOrchestrator] Response validation failed after maximum attempts",
        );
        throw new TutorLLMError(
          "INTERNAL_ERROR",
          `Tutor response validation failed after ${maxAttempts} attempts: ${validation.error}`,
        );
      }
    }

    const retrievedChunkIds = retrievedChunks.map((c) => c.id);
    const assistantClientMessageId = `ast-${randomUUID()}`;
    const savedAssistantMsg = await this.conversationService.createMessage(
      {
        sessionId,
        clientMessageId: assistantClientMessageId,
        role: "ASSISTANT",
        content: normalizedAnswer,
        promptVersion: renderResult.version,
        latencyMs: geminiRes.latencyMs,
        model: geminiRes.model,
        tokenUsageInput: geminiRes.inputTokens,
        tokenUsageOutput: geminiRes.outputTokens,
        retrievedChunkIds,
      },
      userId,
    );

    // Cost Logging & Analytics Audit
    try {
      await this.analyticsService.logUsage({
        userId,
        sessionId,
        messageId: savedAssistantMsg.id,
        model: geminiRes.model,
        inputTokens: geminiRes.inputTokens,
        outputTokens: geminiRes.outputTokens,
        latencyMs: geminiRes.latencyMs,
        provider: "google",
      });
    } catch (analyticsErr: any) {
      logger.error({ error: analyticsErr.message }, "Failed to log usage to analytics service");
    }

    // Update cognitive learner memory
    await this.updateLearnerMemory(userId, lessonSlug, message);

    const citations: CitationItem[] = buildCleanCitations(retrievedChunks, lessonSlug, params.context?.sectionNumber);

    logger.info(
      { sessionId, messageId: savedAssistantMsg.id },
      "Tutor response completed and stored successfully",
    );

    return {
      answer: normalizedAnswer,
      sessionId,
      messageId: savedAssistantMsg.id,
      promptVersion: renderResult.version,
      citations,
    };
  }

  private generatePedagogicalFallback(
    message: string,
    lessonContext: any,
    retrievedChunks: any[],
  ): string {
    const title = lessonContext?.lesson?.title || "Vedic Jyotiṣa";
    const topChunk = retrievedChunks && retrievedChunks.length > 0 ? retrievedChunks[0].content : null;
    const activeSecNum = retrievedChunks?.[0]?.metadata?.sectionNumber || lessonContext?.sections?.[0]?.sectionNumber || 1;

    if (topChunk) {
      return `As Gyaneshwara, guiding you through ${title}:\n\nRegarding your inquiry: "${message}"\n\nFrom our canonical Vedic shlokas and commentary:\n${topChunk}\n\nBy contemplating these foundational teachings, we observe how planetary consciousness directly correlates with human faculties and the Puruṣa body map. Does this textual foundation clarify the planetary significations for you? [Section ${activeSecNum}]`;
    }

    const firstSection = lessonContext?.sections?.[0];
    const sectionText = firstSection ? `\n\n### ${firstSection.sectionTitle}\n${firstSection.content.slice(0, 380)}...` : "";

    return `As Gyaneshwara, your Vedic Jyotiṣa mentor:\n\nWe are currently exploring ${title}. While deep scriptural contemplation aligns across the spheres, remember our foundational principle: Jyotiṣa is the divine eye (Cakṣus) of the Veda, revealing how cosmic rhythms govern both celestial movements and human consciousness.${sectionText}\n\nLet us reflect on how each planetary archetype reflects an internal faculty of human awareness. Would you like to examine the primary shlokas governing this concept? [Section ${activeSecNum}]`;
  }

  async chatStream(
    params: ChatParams,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    const { userId, lessonSlug, message } = params;
    const sessionId = params.sessionId || randomUUID();
    logger.info(
      { userId, lessonSlug, sessionId },
      "Starting tutor orchestrator streaming chat flow",
    );

    let session = await this.conversationService.getSession(sessionId, userId);
    if (!session) {
      logger.info({ sessionId, userId }, "Session not found, creating a new session");
      session = await this.conversationService.createSession(
        userId,
        `Chat: ${lessonSlug}`,
        lessonSlug,
        sessionId,
      );
    }

    const messages = await this.conversationService.getMessages(sessionId, userId, { limit: 15 });

    const userClientMessageId = params.clientMessageId || `usr-${randomUUID()}`;
    await this.conversationService.createMessage(
      {
        sessionId,
        clientMessageId: userClientMessageId,
        role: "USER",
        content: message,
      },
      userId,
    );

    // Fetch static lesson context, learner progress, and AI learner profile in parallel
    // All three are wrapped with .catch() so a downstream service outage does not crash the stream.
    const [lessonContext, learnerProgress, learnerProfile] = await Promise.all([
      this.learningClient.getLessonContext(lessonSlug).catch((err) => {
        logger.warn({ error: err.message, lessonSlug }, "Failed to fetch lesson context from learning-service for stream, using fallback");
        return {
          lesson: { id: lessonSlug, slug: lessonSlug, title: lessonSlug.replace(/-/g, " "), learningOutcomes: [], prerequisites: [] },
          sections: [],
          knowledge: [],
          interactiveSummary: null,
        } as any;
      }),
      this.learningClient.getLearnerProgress(userId, lessonSlug).catch((err) => {
        logger.warn(
          { error: err.message },
          "Failed to fetch learner progress for stream, using fallback",
        );
        return null;
      }),
      this.conversationService.getLearnerProfile(userId).catch((err: any) => {
        logger.warn(
          { error: err.message },
          "Failed to fetch learner profile for stream, using fallback",
        );
        return null;
      }),
    ]);

    // Retrieve relevant chunks via RAGFacade
    let retrievedChunks: any[] = [];
    try {
      retrievedChunks = await this.ragFacade.retrieveRelevantChunks(message, {
        lessonSlug,
        limit: 3,
        minScore: 0.55,
      });
    } catch (ragErr: any) {
      logger.error(
        { error: ragErr.message },
        "RAG retrieval failed inside orchestrator stream, falling back to static context only",
      );
    }

    // Build unified context with adaptive learner progress, profile memory, and active screen tracking
    const builderContext = this.contextBuilder.build(
      message,
      lessonContext,
      messages,
      retrievedChunks,
      session.summary,
      learnerProgress,
      params.context,
      learnerProfile,
    );

    // Render system prompt
    const renderResult = await this.promptService.renderPrompt({
      content: builderContext.content,
      lessonContext: builderContext.lessonContext,
      conversationHistory: builderContext.conversationHistory,
    });

    // Generate response stream with resilient pedagogical fallback for rate limits
    const startTime = Date.now();
    let geminiRes: any;
    try {
      geminiRes = await this.geminiClient.generateDetailedStream(
        renderResult.rendered,
        onToken,
        signal,
      );
    } catch (llmErr: any) {
      const errMsg = llmErr?.message || "";
      if (
        llmErr?.code === "RATE_LIMITED" ||
        llmErr?.code === "LLM_UNAVAILABLE" ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("Circuit breaker")
      ) {
        logger.warn(
          { error: errMsg, lessonSlug, sessionId },
          "[TutorOrchestrator] Gemini API rate limited during stream. Using pedagogical fallback stream.",
        );
        const fallbackText = this.generatePedagogicalFallback(message, lessonContext, retrievedChunks);
        const tokens = fallbackText.split(" ");
        for (let i = 0; i < tokens.length; i++) {
          if (signal?.aborted) break;
          const suffix = i === tokens.length - 1 ? "" : " ";
          onToken(tokens[i] + suffix);
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        geminiRes = {
          text: fallbackText,
          model: "gemini-2.5-flash-lite-fallback",
          finishReason: "STOP",
          inputTokens: Math.ceil(renderResult.rendered.length / 4),
          outputTokens: Math.ceil(fallbackText.length / 4),
          totalTokens: Math.ceil((renderResult.rendered.length + fallbackText.length) / 4),
          latencyMs: Date.now() - startTime,
        };
      } else {
        throw llmErr;
      }
    }
    const latencyMs = Date.now() - startTime;

    const fullText = geminiRes.text;

    // Validate full text
    const validation = this.responseValidator.validate(fullText, lessonContext, retrievedChunks);
    if (!validation.isValid) {
      logger.error(
        { sessionId, error: validation.error },
        "[TutorOrchestrator] Streamed response failed validation",
      );
      throw new TutorLLMError(
        "INTERNAL_ERROR",
        `Tutor response validation failed: ${validation.error}`,
      );
    }

    const normalizedAnswer = validation.normalizedText || fullText;
    const retrievedChunkIds = retrievedChunks.map((c) => c.id);
    const assistantClientMessageId = `ast-${randomUUID()}`;

    // Persist assistant message ONLY after successful validation
    const savedAssistantMsg = await this.conversationService.createMessage(
      {
        sessionId,
        clientMessageId: assistantClientMessageId,
        role: "ASSISTANT",
        content: normalizedAnswer,
        promptVersion: renderResult.version,
        latencyMs,
        model: geminiRes.model,
        tokenUsageInput: geminiRes.inputTokens,
        tokenUsageOutput: geminiRes.outputTokens,
        retrievedChunkIds,
      },
      userId,
    );

    // Cost Logging & Analytics
    try {
      await this.analyticsService.logUsage({
        userId,
        sessionId,
        messageId: savedAssistantMsg.id,
        model: geminiRes.model,
        inputTokens: geminiRes.inputTokens,
        outputTokens: geminiRes.outputTokens,
        latencyMs,
        provider: "google",
      });
    } catch (analyticsErr: any) {
      logger.error({ error: analyticsErr.message }, "Failed to log usage to analytics service");
    }

    // Update cognitive learner memory
    await this.updateLearnerMemory(userId, lessonSlug, message);

    const citations: CitationItem[] = buildCleanCitations(retrievedChunks, lessonSlug, params.context?.sectionNumber);

    logger.info(
      { sessionId, messageId: savedAssistantMsg.id },
      "Tutor stream response completed and stored successfully",
    );

    return {
      answer: normalizedAnswer,
      sessionId,
      messageId: savedAssistantMsg.id,
      promptVersion: renderResult.version,
      citations,
    };
  }

  private async updateLearnerMemory(userId: string, lessonSlug: string, userQuestion: string) {
    try {
      const existing = await this.conversationService.getLearnerProfile(userId);
      const askedSet = new Set(existing?.askedConcepts || []);
      // Add topic snippet from current query
      const topicSnippet = userQuestion.slice(0, 45).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
      if (topicSnippet && !askedSet.has(topicSnippet)) {
        askedSet.add(topicSnippet);
      }
      await this.conversationService.upsertLearnerProfile(userId, {
        askedConcepts: Array.from(askedSet).slice(-20),
        summary: existing?.summary || `Learner studying ${lessonSlug}`,
      });
    } catch (err: any) {
      logger.warn({ error: err.message, userId }, "Failed to update learner memory profile");
    }
  }
}
