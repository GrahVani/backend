import { EmbeddingService } from "./index";

export class EmbeddingFacade {
  constructor(private readonly service: EmbeddingService) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.service.generateEmbedding(text);
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    return this.service.generateEmbeddingsBatch(texts);
  }

  async saveLessonEmbedding(params: {
    lessonSlug: string;
    sectionNumber: number;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    return this.service.saveLessonEmbedding(params);
  }

  async saveMcqEmbedding(params: {
    lessonSlug: string;
    questionId: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    return this.service.saveMcqEmbedding(params);
  }

  async saveKnowledgeEmbedding(params: {
    termKey: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    return this.service.saveKnowledgeEmbedding(params);
  }

  async saveInteractiveSpecEmbedding(params: {
    componentType: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void> {
    return this.service.saveInteractiveSpecEmbedding(params);
  }
}
