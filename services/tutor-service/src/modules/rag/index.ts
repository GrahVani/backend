/**
 * RAG module — internal implementation module.
 *
 * This module owns hybrid vector + keyword retrieval.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP.
 */

export { RAGFacade } from "./facade";
export { RetrievalService, RetrievalOptions, RelevantChunk } from "./src/services/retrieval.service";

import { RetrievalOptions, RelevantChunk } from "./src/services/retrieval.service";

export interface RAGService {
  retrieveRelevantChunks(question: string, options: RetrievalOptions): Promise<RelevantChunk[]>;
}
