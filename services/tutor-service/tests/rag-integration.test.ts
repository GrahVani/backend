import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";
import { ContextBuilder } from "../src/services/context.builder";
import { LearningContextResponse } from "../src/services/learning.client";
import { TutorMessage } from "@grahvani/tutor-database";
import { RelevantChunk } from "../src/modules/rag";

async function testRAGIntegration() {
  console.log("Starting RAG Integration Verification Tests...");
  const container = getContainer();
  const prisma = container.prisma;
  const orchestrator = container.tutorOrchestrator;
  const embeddingFacade = container.embeddingFacade;

  const testLessonSlug = `rag-test-slug-${Date.now()}`;
  const testQuestionId = `rag-test-q-${Date.now()}`;
  const testTermKey = `rag-test-k-${Date.now()}`;

  try {
    // ==========================================
    // 1. ContextBuilder Unit Verification
    // ==========================================
    console.log("Testing ContextBuilder aggregation, formatting, and limits...");
    
    const contextBuilder = new ContextBuilder({ maxCharacters: 500 }); // strict limit

    const mockLessonContext: LearningContextResponse = {
      lesson: {
        id: "l1",
        slug: testLessonSlug,
        title: "Introduction to Jyotisha",
        subtitle: "The Eye of the Veda",
        learningOutcomes: ["Understand 6 Vedangas"],
        prerequisites: [],
      },
      sections: [
        {
          sectionNumber: 1,
          sectionTitle: "Purusha Body Map",
          sectionType: "text",
          content: "The mouth of Purusha is Vyakarana."
        }
      ],
      knowledge: [],
      interactiveSummary: null
    };

    const mockMessages: TutorMessage[] = [];

    const mockRetrievedChunks: RelevantChunk[] = [
      // Chunk A: Unique Glossary Term (Should be included)
      {
        id: "c1",
        type: "knowledge",
        content: "Ayanamsa represents the calculation offset.",
        score: 0.95
      },
      // Chunk B: Duplicate of section content (Should be removed/skipped)
      {
        id: "c2",
        type: "lesson",
        content: "The mouth of Purusha is Vyakarana.",
        score: 0.90
      },
      // Chunk C: Duplicate of Chunk A (Should be skipped)
      {
        id: "c3",
        type: "knowledge",
        content: "Ayanamsa represents the calculation offset.",
        score: 0.85
      },
      // Chunk D: Extremely long content to trigger truncation limit
      {
        id: "c4",
        type: "mcq",
        content: "This is a very long text to overflow the budget limit. " + "x".repeat(600),
        score: 0.80
      }
    ];

    const result = contextBuilder.build(
      "Explain Ayanamsa and Vyakarana",
      mockLessonContext,
      mockMessages,
      mockRetrievedChunks
    );

    console.log("Generated Context Length:", result.lessonContext.length);
    
    // Asserts
    if (!result.lessonContext.includes("Ayanamsa represents the calculation offset.")) {
      throw new Error("Expected RAG glossary term to be merged into lessonContext");
    }

    // Check deduplication (Chunk B should not be duplicated as retrieved RAG section reference block)
    if (result.lessonContext.includes("[Retrieved Lesson Section Reference]")) {
      throw new Error("Expected duplicate section reference block to be skipped because the content is already present in static sections");
    }
    console.log("ContextBuilder duplicate removal verified!");

    // Check truncation
    if (result.lessonContext.length > 550) {
      throw new Error(`Expected context length to be truncated below 500 (+ buffer), got ${result.lessonContext.length}`);
    }
    if (!result.lessonContext.includes("[Context truncated due to size limit]")) {
      throw new Error("Expected context limit truncation message to be present");
    }
    console.log("ContextBuilder size limits verified!");

    // ==========================================
    // 2. End-to-End Tutor Request Integration
    // ==========================================
    console.log("Testing full Orchestrator request flow with database seeding...");

    // Seeding mock embeddings so retrieval actually fetches them
    const kContent = "Astronomy uses the Nirayana coordinate system.";
    const kVec = await embeddingFacade.generateEmbedding(kContent);
    await prisma.knowledgeEmbedding.create({
      data: {
        termKey: testTermKey,
        chunkHash: `hash-${Date.now()}`,
        content: kContent,
        metadata: { vector: kVec }
      }
    });

    const response = await orchestrator.chat({
      userId: "test-user-rag",
      lessonSlug: "jyotisha-as-vedanga", // valid slug to pass internal client calls
      sessionId: `rag-sess-${Date.now()}`,
      message: "Explain the Nirayana coordinate system?"
    });

    console.log("Tutor Chat Response:", response.answer);
    if (!response.answer || response.answer.trim() === "") {
      throw new Error("Expected non-empty tutor answer response");
    }

    // Clean up
    await prisma.knowledgeEmbedding.deleteMany({ where: { termKey: testTermKey } });
    console.log("Orchestrator request flow integration verified successfully!");

    await prisma.$disconnect();
    const { disconnectRedis } = require("../src/config/redis");
    await disconnectRedis();

    console.log("All RAG integration verification tests passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("RAG integration verification failed:", err.message || err);
    try {
      await prisma.$disconnect();
      const { disconnectRedis } = require("../src/config/redis");
      await disconnectRedis();
    } catch (cleanupErr) {}
    process.exit(1);
  }
}

testRAGIntegration();
