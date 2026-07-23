import { PrismaClient } from "@grahvani/tutor-database";
import { createHash } from "crypto";
import { LearningContextClient } from "../../../../services/learning.client";
import { EmbeddingFacade } from "../../facade";
import { logger } from "../../../../config/logger";

export interface McqIndexParams {
  lessonSlug: string;
  questionId: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface KnowledgeIndexParams {
  termKey: string;
  term: string;
  definition: string;
  category?: string;
}

export interface InteractiveSpecIndexParams {
  componentType: string;
  content: string;
  spec: any;
  fallback: string;
}

export class IndexingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly learningClient: LearningContextClient,
    private readonly embeddingFacade: EmbeddingFacade,
  ) {}

  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  async indexLesson(
    lessonSlug: string,
  ): Promise<{ total: number; skipped: number; indexed: number }> {
    logger.info({ lessonSlug }, "Starting lesson content indexing pipeline");

    const context = await this.learningClient.getLessonContext(lessonSlug);
    const { lesson, sections, interactiveSummary, mcqs } = context;

    const chunksToProcess: {
      type: "lesson" | "section" | "interactive" | "mcq";
      content: string;
      sectionNumber?: number;
      componentType?: string;
      questionId?: string;
      metadata: any;
    }[] = [];

    const lessonContent = `Lesson: ${lesson.title}\nSubtitle: ${lesson.subtitle || ""}\nLearning Outcomes: ${lesson.learningOutcomes.join(", ")}\nPrerequisites: ${lesson.prerequisites.join(", ")}`;
    chunksToProcess.push({
      type: "lesson",
      content: lessonContent,
      sectionNumber: 0,
      metadata: { slug: lesson.slug },
    });

    for (const sec of sections) {
      const sectionContent = `Lesson: ${lesson.title}\nSection ${sec.sectionNumber}: ${sec.sectionTitle}\nType: ${sec.sectionType}\n\n${sec.content}`;
      chunksToProcess.push({
        type: "section",
        content: sectionContent,
        sectionNumber: sec.sectionNumber,
        metadata: { slug: lesson.slug, sectionNumber: sec.sectionNumber },
      });
    }

    if (interactiveSummary) {
      const interactiveContent = `Lesson: ${lesson.title}\nInteractive Component: ${interactiveSummary.type}\nSpecification: ${typeof interactiveSummary.spec === "object" ? JSON.stringify(interactiveSummary.spec) : interactiveSummary.spec}\nFallback: ${interactiveSummary.fallback}`;
      chunksToProcess.push({
        type: "interactive",
        content: interactiveContent,
        componentType: interactiveSummary.type,
        metadata: { slug: lesson.slug, componentType: interactiveSummary.type },
      });
    }

    if (mcqs && Array.isArray(mcqs)) {
      for (const mcq of mcqs) {
        const optionsText = mcq.options ? mcq.options.map((o: any) => `${o.id}) ${o.text}`).join(" | ") : "";
        const correctOption = mcq.options ? mcq.options.find((o: any) => o.is_correct) : null;
        const answerText = correctOption ? `${correctOption.id}) ${correctOption.text}` : "";
        const explanationText = correctOption ? correctOption.explanation : "";
        const mcqContent = `Lesson: ${lesson.title}\nMultiple Choice Question: ${mcq.stem}\nOptions: ${optionsText}\nCorrect Answer: ${answerText}\nExplanation: ${explanationText}`;
        chunksToProcess.push({
          type: "mcq",
          content: mcqContent,
          questionId: mcq.id,
          metadata: { slug: lesson.slug, questionId: mcq.id },
        });
      }
    }

    let skipped = 0;
    let indexed = 0;
    const newChunks: typeof chunksToProcess = [];

    for (const chunk of chunksToProcess) {
      const hash = this.computeHash(chunk.content);

      let exists = false;
      if (chunk.type === "lesson" || chunk.type === "section") {
        const record = await this.prisma.lessonEmbedding.findUnique({
          where: { chunkHash: hash },
        });
        if (record) exists = true;
      } else if (chunk.type === "interactive") {
        const record = await this.prisma.interactiveSpecEmbedding.findUnique({
          where: { chunkHash: hash },
        });
        if (record) exists = true;
      } else if (chunk.type === "mcq") {
        const record = await this.prisma.mcqEmbedding.findUnique({
          where: { chunkHash: hash },
        });
        if (record) exists = true;
      }

      if (exists) {
        skipped++;
      } else {
        newChunks.push(chunk);
      }
    }

    logger.info(
      { total: chunksToProcess.length, skipped, new: newChunks.length },
      "Change detection finished",
    );

    if (newChunks.length > 0) {
      const textStrings = newChunks.map((c) => c.content);
      logger.info({ count: textStrings.length }, "Generating batch embeddings for new chunks");
      const vectors = await this.embeddingFacade.generateEmbeddingsBatch(textStrings);

      for (let i = 0; i < newChunks.length; i++) {
        const chunk = newChunks[i];
        const vector = vectors[i];

        if (chunk.type === "lesson" || chunk.type === "section") {
          await this.embeddingFacade.saveLessonEmbedding({
            lessonSlug: lessonSlug,
            sectionNumber: chunk.sectionNumber || 0,
            content: chunk.content,
            metadata: { ...chunk.metadata },
            vector,
          });
        } else if (chunk.type === "interactive") {
          await this.embeddingFacade.saveInteractiveSpecEmbedding({
            componentType: chunk.componentType || "",
            content: chunk.content,
            metadata: { ...chunk.metadata },
            vector,
          });
        } else if (chunk.type === "mcq") {
          await this.embeddingFacade.saveMcqEmbedding({
            lessonSlug: lessonSlug,
            questionId: chunk.questionId || "",
            content: chunk.content,
            metadata: { ...chunk.metadata },
            vector,
          });
        }
        indexed++;
      }
    }

    logger.info(
      { lessonSlug, total: chunksToProcess.length, skipped, indexed },
      "Lesson indexing pipeline complete",
    );
    return { total: chunksToProcess.length, skipped, indexed };
  }

  async indexMcq(params: McqIndexParams): Promise<boolean> {
    const mcqContent = `Lesson: ${params.lessonSlug}\nMultiple Choice Question: ${params.question}\nOptions: ${params.options.join(", ")}\nCorrect Answer: ${params.answer}\nExplanation: ${params.explanation}`;
    const hash = this.computeHash(mcqContent);

    const existing = await this.prisma.mcqEmbedding.findUnique({
      where: { chunkHash: hash },
    });
    if (existing) {
      logger.info({ questionId: params.questionId }, "MCQ chunk unchanged, skipping");
      return false;
    }

    logger.info({ questionId: params.questionId }, "Indexing new MCQ question");
    await this.embeddingFacade.saveMcqEmbedding({
      lessonSlug: params.lessonSlug,
      questionId: params.questionId,
      content: mcqContent,
      metadata: { questionId: params.questionId },
    });
    return true;
  }

  async indexKnowledge(params: KnowledgeIndexParams): Promise<boolean> {
    const kContent = `Term: ${params.term}\nDefinition: ${params.definition}\nCategory: ${params.category || "General"}`;
    const hash = this.computeHash(kContent);

    const existing = await this.prisma.knowledgeEmbedding.findUnique({
      where: { chunkHash: hash },
    });
    if (existing) {
      logger.info({ termKey: params.termKey }, "Knowledge term chunk unchanged, skipping");
      return false;
    }

    logger.info({ termKey: params.termKey }, "Indexing new Knowledge term");
    await this.embeddingFacade.saveKnowledgeEmbedding({
      termKey: params.termKey,
      content: kContent,
      metadata: { termKey: params.termKey },
    });
    return true;
  }

  async indexInteractiveSpec(params: InteractiveSpecIndexParams): Promise<boolean> {
    const specStr = typeof params.spec === "object" ? JSON.stringify(params.spec) : params.spec;
    const content = `Component Type: ${params.componentType}\nDescription: ${params.content}\nSpecification: ${specStr}\nFallback Content: ${params.fallback}`;
    const hash = this.computeHash(content);

    const existing = await this.prisma.interactiveSpecEmbedding.findUnique({
      where: { chunkHash: hash },
    });
    if (existing) {
      logger.info({ componentType: params.componentType }, "Interactive specification chunk unchanged, skipping");
      return false;
    }

    logger.info({ componentType: params.componentType }, "Indexing new Interactive specification");
    await this.embeddingFacade.saveInteractiveSpecEmbedding({
      componentType: params.componentType,
      content,
      metadata: { componentType: params.componentType, spec: params.spec, fallback: params.fallback },
    });
    return true;
  }
}
