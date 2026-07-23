import { PrismaClient } from "@grahvani/tutor-database";
import { EmbeddingFacade } from "../../../embedding";
import { logger } from "../../../../config/logger";

export interface RetrievalOptions {
  lessonSlug: string;
  limit?: number;
  minScore?: number;
  componentType?: string;
}

export interface RelevantChunk {
  id: string;
  type: "lesson" | "mcq" | "knowledge" | "interactive";
  content: string;
  score: number;
  metadata?: any;
}

export class RetrievalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embeddingFacade: EmbeddingFacade,
  ) {}

  async retrieveRelevantChunks(
    question: string,
    options: RetrievalOptions,
  ): Promise<RelevantChunk[]> {
    if (!question || question.trim() === "") {
      logger.warn("Empty retrieval query. Returning empty chunk list.");
      return [];
    }

    const limit = options.limit || 5;
    logger.info(
      { lessonSlug: options.lessonSlug, limit },
      "Starting relevant chunk retrieval pipeline via pgvector",
    );

    // 1. Generate query embedding vector
    const queryVector = await this.embeddingFacade.generateEmbedding(question);
    const queryVectorStr = JSON.stringify(queryVector);

    const candidates: RelevantChunk[] = [];

    try {
      // 2. Fetch candidate chunks from database tables using pgvector search concurrently
      const [lessonRecords, mcqRecords, knowledgeRecords, specRecords] = await Promise.all([
        this.prisma.$queryRaw<any[]>`
          SELECT id, content, metadata, 1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
          FROM app_tutor."LessonEmbedding"
          WHERE "lessonSlug" = ${options.lessonSlug} AND vector IS NOT NULL
          ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
          LIMIT ${limit};
        `,
        this.prisma.$queryRaw<any[]>`
          SELECT id, content, metadata, 1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
          FROM app_tutor."McqEmbedding"
          WHERE "lessonSlug" = ${options.lessonSlug} AND vector IS NOT NULL
          ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
          LIMIT ${limit};
        `,
        this.prisma.$queryRaw<any[]>`
          SELECT id, content, metadata, 1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
          FROM app_tutor."KnowledgeEmbedding"
          WHERE vector IS NOT NULL
          ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
          LIMIT ${limit};
        `,
        options.componentType ? this.prisma.$queryRaw<any[]>`
          SELECT id, content, metadata, 1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
          FROM app_tutor."InteractiveSpecEmbedding"
          WHERE metadata->>'slug' = ${options.lessonSlug}
            AND metadata->>'componentType' = ${options.componentType}
            AND vector IS NOT NULL
          ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
          LIMIT ${limit};
        ` : this.prisma.$queryRaw<any[]>`
          SELECT id, content, metadata, 1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
          FROM app_tutor."InteractiveSpecEmbedding"
          WHERE metadata->>'slug' = ${options.lessonSlug}
            AND vector IS NOT NULL
          ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
          LIMIT ${limit};
        `,
      ]);

      const processRecords = (
        records: any[],
        type: "lesson" | "mcq" | "knowledge" | "interactive",
      ) => {
        for (const record of records) {
          const scoreVal = typeof record.score === "number" ? record.score : parseFloat(record.score);
          if (scoreVal >= (options.minScore || 0.55)) {
            candidates.push({
              id: record.id,
              type,
              content: record.content,
              score: scoreVal,
              metadata: record.metadata,
            });
          }
        }
      };

      processRecords(lessonRecords, "lesson");
      processRecords(mcqRecords, "mcq");
      processRecords(knowledgeRecords, "knowledge");
      processRecords(specRecords, "interactive");

      // 3. Deduplicate items sharing identical content
      const seenContent = new Set<string>();
      const uniqueCandidates = candidates.filter((c) => {
        if (seenContent.has(c.content)) {
          return false;
        }
        seenContent.add(c.content);
        return true;
      });

      // 4. Rank descending by similarity score
      uniqueCandidates.sort((a, b) => b.score - a.score);

      // 5. Return Top K chunks
      const topK = uniqueCandidates.slice(0, limit);
      logger.info(
        { candidates: candidates.length, unique: uniqueCandidates.length, returned: topK.length },
        "Retrieval pipeline finished",
      );
      return topK;
    } catch (err: any) {
      logger.error({ err: err.message }, "Error during pgvector retrieval query");
      return [];
    }
  }
}
