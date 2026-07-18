import { RAGService, RetrievalOptions, RelevantChunk } from "./index";

export class RAGFacade {
  constructor(private readonly service: RAGService) {}

  async retrieveRelevantChunks(
    question: string,
    options: RetrievalOptions,
  ): Promise<RelevantChunk[]> {
    return this.service.retrieveRelevantChunks(question, options);
  }
}
