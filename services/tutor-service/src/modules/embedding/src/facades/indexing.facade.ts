import {
  IndexingService,
  McqIndexParams,
  KnowledgeIndexParams,
  InteractiveSpecIndexParams,
} from "../services/indexing.service";

export class IndexingFacade {
  constructor(private readonly service: IndexingService) {}

  async indexLesson(
    lessonSlug: string,
  ): Promise<{ total: number; skipped: number; indexed: number }> {
    return this.service.indexLesson(lessonSlug);
  }

  async indexMcq(params: McqIndexParams): Promise<boolean> {
    return this.service.indexMcq(params);
  }

  async indexKnowledge(params: KnowledgeIndexParams): Promise<boolean> {
    return this.service.indexKnowledge(params);
  }

  async indexInteractiveSpec(params: InteractiveSpecIndexParams): Promise<boolean> {
    return this.service.indexInteractiveSpec(params);
  }
}

