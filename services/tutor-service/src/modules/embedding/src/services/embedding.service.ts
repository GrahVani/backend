import { PrismaClient } from "@grahvani/tutor-database";
import { createHash } from "crypto";
import { EmbeddingService } from "../../index";
import { EmbeddingProvider } from "../providers/embedding.provider";

export class EmbeddingServiceImpl implements EmbeddingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: EmbeddingProvider,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.provider.embedText(text);
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }

  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  async saveLessonEmbedding(params: {
    lessonSlug: string;
    sectionNumber: number;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    const vector = params.vector || (await this.generateEmbedding(params.content));
    const chunkHash = this.computeHash(params.content);

    const serializedMetadata = { ...(params.metadata || {}) };
    delete serializedMetadata.vector;

    const record = await this.prisma.lessonEmbedding.upsert({
      where: { chunkHash },
      update: {
        lessonSlug: params.lessonSlug,
        sectionNumber: params.sectionNumber,
        content: params.content,
        metadata: serializedMetadata,
      },
      create: {
        lessonSlug: params.lessonSlug,
        sectionNumber: params.sectionNumber,
        chunkHash,
        content: params.content,
        metadata: serializedMetadata,
      },
    });

    await this.prisma
      .$executeRaw`UPDATE app_tutor."LessonEmbedding" SET vector = ${JSON.stringify(vector)}::public.vector WHERE id = ${record.id}`;
  }

  async saveMcqEmbedding(params: {
    lessonSlug: string;
    questionId: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    const vector = params.vector || (await this.generateEmbedding(params.content));
    const chunkHash = this.computeHash(params.content);

    const serializedMetadata = { ...(params.metadata || {}) };
    delete serializedMetadata.vector;

    const record = await this.prisma.mcqEmbedding.upsert({
      where: { chunkHash },
      update: {
        lessonSlug: params.lessonSlug,
        questionId: params.questionId,
        content: params.content,
        metadata: serializedMetadata,
      },
      create: {
        lessonSlug: params.lessonSlug,
        questionId: params.questionId,
        chunkHash,
        content: params.content,
        metadata: serializedMetadata,
      },
    });

    await this.prisma
      .$executeRaw`UPDATE app_tutor."McqEmbedding" SET vector = ${JSON.stringify(vector)}::public.vector WHERE id = ${record.id}`;
  }

  async saveKnowledgeEmbedding(params: {
    termKey: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    const vector = params.vector || (await this.generateEmbedding(params.content));
    const chunkHash = this.computeHash(params.content);

    const serializedMetadata = { ...(params.metadata || {}) };
    delete serializedMetadata.vector;

    const record = await this.prisma.knowledgeEmbedding.upsert({
      where: { chunkHash },
      update: {
        termKey: params.termKey,
        content: params.content,
        metadata: serializedMetadata,
      },
      create: {
        termKey: params.termKey,
        chunkHash,
        content: params.content,
        metadata: serializedMetadata,
      },
    });

    await this.prisma
      .$executeRaw`UPDATE app_tutor."KnowledgeEmbedding" SET vector = ${JSON.stringify(vector)}::public.vector WHERE id = ${record.id}`;
  }

  async saveInteractiveSpecEmbedding(params: {
    componentType: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    const vector = params.vector || (await this.generateEmbedding(params.content));
    const chunkHash = this.computeHash(params.content);

    const serializedMetadata = { ...(params.metadata || {}) };
    delete serializedMetadata.vector;

    const record = await this.prisma.interactiveSpecEmbedding.upsert({
      where: { chunkHash },
      update: {
        componentType: params.componentType,
        content: params.content,
        metadata: serializedMetadata,
      },
      create: {
        componentType: params.componentType,
        chunkHash,
        content: params.content,
        metadata: serializedMetadata,
      },
    });

    await this.prisma
      .$executeRaw`UPDATE app_tutor."InteractiveSpecEmbedding" SET vector = ${JSON.stringify(vector)}::public.vector WHERE id = ${record.id}`;
  }
}
