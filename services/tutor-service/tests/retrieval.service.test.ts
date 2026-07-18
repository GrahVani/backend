import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";

async function testRetrievalPipeline() {
  console.log("Starting RAG Retrieval Service Integration Verification...");
  const container = getContainer();
  const prisma = container.prisma;
  const ragFacade = container.ragFacade;
  const embeddingFacade = container.embeddingFacade;

  const testLessonSlug = `test-retrieval-${Date.now()}`;
  const otherLessonSlug = `other-retrieval-${Date.now()}`;
  const testQuestionId = `test-q-${Date.now()}`;
  const testTermKey = `test-k-${Date.now()}`;
  const testCompType = `test-c-${Date.now()}`;

  try {
    // 1. Check empty question handling
    console.log("Testing empty question handling...");
    const emptyResult = await ragFacade.retrieveRelevantChunks("", { lessonSlug: testLessonSlug });
    if (!Array.isArray(emptyResult) || emptyResult.length !== 0) {
      throw new Error("Expected empty question query to return empty array");
    }
    console.log("Empty question handled correctly!");

    // 2. Generate vectors for test contents
    console.log("Generating vectors for test seeding...");
    const queryText = "Veda Purusha cosmic astrology";
    const matchText = "The Veda Purusha represents the cosmic mapping of parts in Vedic Astrology.";
    const unrelatedText = "Ayanamsa is used to calculate the precession of the equinoxes.";
    const duplicateText = "The Veda Purusha represents the cosmic mapping of parts in Vedic Astrology.";

    const queryVec = await embeddingFacade.generateEmbedding(queryText);
    const matchVec = [...queryVec];
    const duplicateVec = [...queryVec];
    const unrelatedVec = queryVec.map(x => -x);

    // 3. Seed candidate chunks
    console.log("Seeding test embeddings to database...");
    // Item 1: Matching lesson chunk
    await embeddingFacade.saveLessonEmbedding({
      lessonSlug: testLessonSlug,
      sectionNumber: 1,
      content: matchText,
      vector: matchVec
    });

    // Item 2: Unrelated knowledge chunk (global)
    await embeddingFacade.saveKnowledgeEmbedding({
      termKey: testTermKey,
      content: unrelatedText,
      vector: unrelatedVec
    });

    // Item 3: Matching MCQ chunk (shares identical content with Item 1 to test deduplication!)
    await embeddingFacade.saveMcqEmbedding({
      lessonSlug: testLessonSlug,
      questionId: testQuestionId,
      content: duplicateText,
      vector: duplicateVec
    });

    // Item 4: Matching lesson chunk but with DIFFERENT lessonSlug (to test filtering)
    await embeddingFacade.saveLessonEmbedding({
      lessonSlug: otherLessonSlug,
      sectionNumber: 1,
      content: "Veda Purusha cosmic mapping but other lesson.",
      vector: matchVec
    });

    // 4. Run Retrieval
    console.log(`Querying: '${queryText}'`);
    const results = await ragFacade.retrieveRelevantChunks(queryText, {
      lessonSlug: testLessonSlug,
      limit: 3
    });

    console.log("Retrieval Results:", results.map(r => ({ type: r.type, content: r.content, score: r.score })));

    // Verify deduplication
    const seenContent = new Set<string>();
    for (const r of results) {
      if (seenContent.has(r.content)) {
        throw new Error(`Deduplication failed! Found duplicate content: '${r.content}'`);
      }
      seenContent.add(r.content);
    }
    console.log("Deduplication verified!");

    // Verify lessonSlug filtering (item 4 must not be in results)
    const hasOtherLesson = results.some(r => r.content.includes("other lesson"));
    if (hasOtherLesson) {
      throw new Error("Lesson slug filtering failed! Found other lesson chunk in results.");
    }
    console.log("Lesson slug filtering verified!");

    // Verify ranking (matching item 1 must rank higher than unrelated item 2)
    if (results.length > 1) {
      const matchIdx = results.findIndex(r => r.content === matchText);
      const unrelatedIdx = results.findIndex(r => r.content === unrelatedText);
      if (matchIdx !== -1 && unrelatedIdx !== -1 && matchIdx > unrelatedIdx) {
        throw new Error("Ranking failed! Unrelated item ranked higher than match item.");
      }
    }
    console.log("Relevance ranking verified!");

    // Verify Top-K limiting
    const resultsLimited = await ragFacade.retrieveRelevantChunks(queryText, {
      lessonSlug: testLessonSlug,
      limit: 1
    });
    if (resultsLimited.length > 1) {
      throw new Error(`Top-K limiting failed! Expected limit 1, got ${resultsLimited.length}`);
    }
    console.log("Top-K limiting verified!");

    // 5. Cleanup database records
    console.log("Cleaning up test database records...");
    await prisma.lessonEmbedding.deleteMany({ where: { lessonSlug: testLessonSlug } });
    await prisma.lessonEmbedding.deleteMany({ where: { lessonSlug: otherLessonSlug } });
    await prisma.knowledgeEmbedding.deleteMany({ where: { termKey: testTermKey } });
    await prisma.mcqEmbedding.deleteMany({ where: { questionId: testQuestionId } });

    console.log("All RAG Retrieval Service integration validations passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("RAG retrieval verification failed:", err.message || err);
    process.exit(1);
  }
}

testRetrievalPipeline();
