import { prisma } from "./database/prisma";
import {
  ConversationRepository,
  ConversationService,
  ConversationFacade,
  AdminReviewService,
} from "./modules/conversation";
import { PromptService, PromptFacade } from "./modules/prompt";
import { LearningContextClient } from "./services/learning.client";
import { GeminiClient } from "./clients/gemini.client";
import { ContextBuilder } from "./services/context.builder";
import { ResponseValidatorService } from "./services/response-validator.service";
import { TutorOrchestrator } from "./services/tutor.orchestrator";
import {
  UsageLogRepository,
  AnalyticsServiceImpl,
  AnalyticsService,
  AnalyticsFacade,
} from "./modules/analytics";
import { RetrievalService, RAGFacade } from "./modules/rag";
import {
  EmbeddingServiceImpl,
  EmbeddingFacade,
  GeminiEmbeddingProvider,
  IndexingService,
  IndexingFacade,
} from "./modules/embedding";
import { CurriculumSubscriber } from "./events/curriculum.subscriber";
import { RecommendationFacade, RecommendationServiceImpl } from "./modules/recommendation";

/**
 * Dependency injection container for tutor-service.
 *
 * Internal modules and the orchestrator will receive their dependencies
 * from this container.
 */
export interface Container {
  prisma: typeof prisma;
  conversationRepository: ConversationRepository;
  conversationService: ConversationService;
  conversationFacade: ConversationFacade;
  adminReviewService: AdminReviewService;
  promptService: PromptService;
  promptFacade: PromptFacade;
  learningClient: LearningContextClient;
  geminiClient: GeminiClient;
  contextBuilder: ContextBuilder;
  responseValidator: ResponseValidatorService;
  tutorOrchestrator: TutorOrchestrator;
  analyticsRepository: UsageLogRepository;
  analyticsService: AnalyticsService;
  analyticsFacade: AnalyticsFacade;
  ragFacade: RAGFacade;
  embeddingFacade: EmbeddingFacade;
  indexingService: IndexingService;
  indexingFacade: IndexingFacade;
  curriculumSubscriber: CurriculumSubscriber;
  recommendationFacade: RecommendationFacade;
}

let containerInstance: Container | null = null;

export function createContainer(): Container {
  if (containerInstance) {
    return containerInstance;
  }

  const conversationRepository = new ConversationRepository(prisma);
  const conversationService = new ConversationService(conversationRepository);
  const conversationFacade = new ConversationFacade(conversationService);
  const adminReviewService = new AdminReviewService(conversationRepository);

  const promptService = new PromptService(prisma);
  const promptFacade = new PromptFacade(promptService);

  const learningClient = new LearningContextClient();
  const geminiClient = new GeminiClient();
  const contextBuilder = new ContextBuilder();
  const responseValidator = new ResponseValidatorService();

  const analyticsRepository = new UsageLogRepository(prisma);
  const analyticsService = new AnalyticsServiceImpl(analyticsRepository);
  const analyticsFacade = new AnalyticsFacade(analyticsService);

  const embeddingProvider = new GeminiEmbeddingProvider();
  const embeddingService = new EmbeddingServiceImpl(prisma, embeddingProvider);
  const embeddingFacade = new EmbeddingFacade(embeddingService);

  const ragService = new RetrievalService(prisma, embeddingFacade);
  const ragFacade = new RAGFacade(ragService);

  const indexingService = new IndexingService(prisma, learningClient, embeddingFacade);
  const indexingFacade = new IndexingFacade(indexingService);

  const curriculumSubscriber = new CurriculumSubscriber(indexingFacade);

  const recommendationService = new RecommendationServiceImpl(conversationFacade);
  const recommendationFacade = new RecommendationFacade(recommendationService);

  const tutorOrchestrator = new TutorOrchestrator(
    conversationFacade,
    learningClient,
    promptFacade,
    geminiClient,
    contextBuilder,
    analyticsFacade,
    ragFacade,
    responseValidator,
  );

  containerInstance = {
    prisma,
    conversationRepository,
    conversationService,
    conversationFacade,
    adminReviewService,
    promptService,
    promptFacade,
    learningClient,
    geminiClient,
    contextBuilder,
    responseValidator,
    tutorOrchestrator,
    analyticsRepository,
    analyticsService,
    analyticsFacade,
    ragFacade,
    embeddingFacade,
    indexingService,
    indexingFacade,
    curriculumSubscriber,
    recommendationFacade,
  };

  return containerInstance;
}

export function getContainer(): Container {
  if (!containerInstance) {
    return createContainer();
  }
  return containerInstance;
}
