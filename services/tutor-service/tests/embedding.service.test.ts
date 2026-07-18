import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";

async function testEmbeddingModule() {
  console.log("Starting Embedding Infrastructure Integration Verification...");
  const container = getContainer();
  const prisma = container.prisma;
  const embeddingFacade = container.embeddingFacade;

  const testLessonSlug = `test-lesson-${Date.now()}`;
  const testQuestionId = `test-question-${Date.now()}`;
  const testTermKey = `test-term-${Date.now()}`;
  const testCompType = `test-comp-${Date.now()}`;

  const testContent = "Astrology or Jyotisha is the study of cosmic time cycles.";
  const testContent2 = "Vedanga Purusha represents the cosmic mapping of parts.";

  try {
    // 1. Verify single embedding generation
    console.log("Generating single embedding...");
    const vector = await embeddingFacade.generateEmbedding(testContent);
    if (!Array.isArray(vector)) {
      throw new Error("Expected single embedding response to be an array");
    }
    console.log(`Generated vector size: ${vector.length}`);
    if (vector.length !== 1536) {
      throw new Error(`Expected vector dimension to be 1536, got ${vector.length}`);
    }

    // 2. Verify batch embedding generation
    console.log("Generating batch embeddings...");
    const batchVectors = await embeddingFacade.generateEmbeddingsBatch([testContent, testContent2]);
    if (!Array.isArray(batchVectors) || batchVectors.length !== 2) {
      throw new Error("Expected batch embedding response to have 2 items");
    }
    if (batchVectors[0].length !== 1536 || batchVectors[1].length !== 1536) {
      throw new Error("Expected batch vector dimensions to be 1536");
    }
    console.log("Batch embedding generation passed!");

    // 3. Verify LessonEmbedding upsert
    console.log("Testing LessonEmbedding upsert...");
    await embeddingFacade.saveLessonEmbedding({
      lessonSlug: testLessonSlug,
      sectionNumber: 1,
      content: testContent,
      metadata: { source: "test" }
    });

    // Verify written
    const dbRecord = await prisma.lessonEmbedding.findFirst({
      where: { lessonSlug: testLessonSlug }
    });
    if (!dbRecord) throw new Error("LessonEmbedding record not found in DB!");
    if (dbRecord.content !== testContent) throw new Error("Content mismatch!");
    
    const rawCheck = await prisma.$queryRaw<any[]>`
      SELECT id, vector IS NOT NULL as has_vector 
      FROM app_tutor."LessonEmbedding" 
      WHERE id = ${dbRecord.id}
    `;
    if (!rawCheck || rawCheck.length === 0 || !rawCheck[0].has_vector) {
      throw new Error("Embedded vector not found or malformed in pgvector column!");
    }
    console.log("LessonEmbedding saved successfully!");

    // Idempotency check: upserting same content again should update, not create new
    console.log("Testing LessonEmbedding idempotency...");
    await embeddingFacade.saveLessonEmbedding({
      lessonSlug: testLessonSlug,
      sectionNumber: 1,
      content: testContent,
      metadata: { source: "test-updated" }
    });
    const recordsCount = await prisma.lessonEmbedding.count({
      where: { lessonSlug: testLessonSlug }
    });
    if (recordsCount !== 1) {
      throw new Error(`Idempotency failed: expected 1 record, got ${recordsCount}`);
    }
    console.log("LessonEmbedding idempotency passed!");

    // 4. Verify McqEmbedding upsert
    console.log("Testing McqEmbedding upsert...");
    await embeddingFacade.saveMcqEmbedding({
      lessonSlug: testLessonSlug,
      questionId: testQuestionId,
      content: testContent,
    });
    const mcqRecord = await prisma.mcqEmbedding.findFirst({
      where: { questionId: testQuestionId }
    });
    if (!mcqRecord) throw new Error("McqEmbedding record not found in DB!");
    console.log("McqEmbedding saved successfully!");

    // 5. Verify KnowledgeEmbedding upsert
    console.log("Testing KnowledgeEmbedding upsert...");
    await embeddingFacade.saveKnowledgeEmbedding({
      termKey: testTermKey,
      content: testContent,
    });
    const kRecord = await prisma.knowledgeEmbedding.findFirst({
      where: { termKey: testTermKey }
    });
    if (!kRecord) throw new Error("KnowledgeEmbedding record not found in DB!");
    console.log("KnowledgeEmbedding saved successfully!");

    // 6. Verify InteractiveSpecEmbedding upsert
    console.log("Testing InteractiveSpecEmbedding upsert...");
    await embeddingFacade.saveInteractiveSpecEmbedding({
      componentType: testCompType,
      content: testContent,
    });
    const specRecord = await prisma.interactiveSpecEmbedding.findFirst({
      where: { componentType: testCompType }
    });
    if (!specRecord) throw new Error("InteractiveSpecEmbedding record not found in DB!");
    console.log("InteractiveSpecEmbedding saved successfully!");

    // 7. Clean up test records
    console.log("Cleaning up test database records...");
    await prisma.lessonEmbedding.deleteMany({ where: { lessonSlug: testLessonSlug } });
    await prisma.mcqEmbedding.deleteMany({ where: { lessonSlug: testLessonSlug } });
    await prisma.knowledgeEmbedding.deleteMany({ where: { termKey: testTermKey } });
    await prisma.interactiveSpecEmbedding.deleteMany({ where: { componentType: testCompType } });

    console.log("All Embedding Infrastructure contract & integration verifications passed!");
  } catch (err: any) {
    console.error("Embedding infrastructure verification failed:", err.message || err);
    process.exit(1);
  }
}

testEmbeddingModule();
