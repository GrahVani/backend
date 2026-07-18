/**
 * Embedding module — internal implementation module.
 *
 * This module owns chunking, embedding generation, indexing workers, and
 * curriculum event subscription.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP.
 */

export { EmbeddingFacade } from "./facade";

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddingsBatch(texts: string[]): Promise<number[][]>;
  saveLessonEmbedding(params: {
    lessonSlug: string;
    sectionNumber: number;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void>;
  saveMcqEmbedding(params: {
    lessonSlug: string;
    questionId: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void>;
  saveKnowledgeEmbedding(params: {
    termKey: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void>;
  saveInteractiveSpecEmbedding(params: {
    componentType: string;
    content: string;
    metadata?: any;
    vector?: number[];
  }): Promise<void>;
}

export { EmbeddingServiceImpl } from "./src/services/embedding.service";
export { EmbeddingProvider } from "./src/providers/embedding.provider";
export { GeminiEmbeddingProvider } from "./src/providers/gemini-embedding.provider";

// Indexing Pipeline Exports
export { IndexingFacade } from "./src/facades/indexing.facade";
export {
  IndexingService,
  McqIndexParams,
  KnowledgeIndexParams,
  InteractiveSpecIndexParams,
} from "./src/services/indexing.service";

