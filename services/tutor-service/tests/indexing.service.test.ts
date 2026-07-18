import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";

async function testIndexingPipeline() {
  console.log("Starting Embedding Indexing Pipeline Integration Verification...");
  const container = getContainer();
  const prisma = container.prisma;
  const indexingFacade = container.indexingFacade;

  const validSlug = "jyotisha-as-vedanga";
  const testQuestionId = `test-q-${Date.now()}`;
  const testTermKey = `test-k-${Date.now()}`;

  try {
    // 1. Initial lesson indexing (all chunks should be indexed)
    console.log(`Indexing lesson '${validSlug}' for the first time...`);
    // Pre-clean database if previous test crashed
    await prisma.lessonEmbedding.deleteMany({ where: { lessonSlug: validSlug } });
    await prisma.interactiveSpecEmbedding.deleteMany({ where: { chunkHash: { startsWith: "" } } }); // cleanup test specs

    const resultFirst = await indexingFacade.indexLesson(validSlug);
    console.log("First index result:", resultFirst);

    if (resultFirst.total === 0) {
      throw new Error("Expected chunks count to be greater than 0");
    }
    if (resultFirst.indexed !== resultFirst.total) {
      throw new Error(`Expected all chunks to be indexed, got indexed: ${resultFirst.indexed}`);
    }
    if (resultFirst.skipped !== 0) {
      throw new Error(`Expected zero skipped chunks on first run, got: ${resultFirst.skipped}`);
    }

    // Verify records exist in database
    const dbLessons = await prisma.lessonEmbedding.findMany({
      where: { lessonSlug: validSlug }
    });
    console.log(`Verified ${dbLessons.length} LessonEmbedding records stored in database.`);
    if (dbLessons.length === 0) {
      throw new Error("No LessonEmbedding records found in database after first run!");
    }

    // 2. Second lesson indexing (all chunks should be skipped as unchanged)
    console.log(`Indexing lesson '${validSlug}' for the second time...`);
    const resultSecond = await indexingFacade.indexLesson(validSlug);
    console.log("Second index result:", resultSecond);

    if (resultSecond.skipped !== resultFirst.total) {
      throw new Error(`Expected all ${resultFirst.total} chunks to be skipped on second run, got skipped: ${resultSecond.skipped}`);
    }
    if (resultSecond.indexed !== 0) {
      throw new Error(`Expected zero chunks to be indexed on second run, got: ${resultSecond.indexed}`);
    }
    console.log("Lesson indexing change detection/skipping verified successfully!");

    // 3. Test MCQ Indexing
    console.log("Testing MCQ chunk indexing...");
    const mcqParams = {
      lessonSlug: validSlug,
      questionId: testQuestionId,
      question: `What is Vedāṅga? (${testQuestionId})`,
      options: ["A", "B", "C"],
      answer: "A",
      explanation: "Vedāṅga represents parts of the Veda."
    };
    
    // Clean old MCQ records just in case
    await prisma.mcqEmbedding.deleteMany({ where: { questionId: testQuestionId } });

    const mcqIndexed = await indexingFacade.indexMcq(mcqParams);
    if (!mcqIndexed) throw new Error("Expected MCQ to be indexed on first run");

    const mcqRecord = await prisma.mcqEmbedding.findFirst({
      where: { questionId: testQuestionId }
    });
    if (!mcqRecord) throw new Error("MCQ record not found in DB");

    // Second run should skip
    const mcqIndexedSecond = await indexingFacade.indexMcq(mcqParams);
    if (mcqIndexedSecond) throw new Error("Expected MCQ indexing to be skipped on second run");
    console.log("MCQ indexing change detection verified!");

    // 4. Test Knowledge Indexing
    console.log("Testing Knowledge chunk indexing...");
    const kParams = {
      termKey: testTermKey,
      term: `Ayanamsa (${testTermKey})`,
      definition: "Precession mapping adjustment.",
      category: "Technical"
    };

    // Clean old Knowledge records just in case
    await prisma.knowledgeEmbedding.deleteMany({ where: { termKey: testTermKey } });

    const kIndexed = await indexingFacade.indexKnowledge(kParams);
    if (!kIndexed) throw new Error("Expected Knowledge to be indexed on first run");

    const kRecord = await prisma.knowledgeEmbedding.findFirst({
      where: { termKey: testTermKey }
    });
    if (!kRecord) throw new Error("Knowledge record not found in DB");

    // Second run should skip
    const kIndexedSecond = await indexingFacade.indexKnowledge(kParams);
    if (kIndexedSecond) throw new Error("Expected Knowledge indexing to be skipped on second run");
    console.log("Knowledge indexing change detection verified!");

    // 5. Cleanup database records
    console.log("Cleaning up test database records...");
    await prisma.lessonEmbedding.deleteMany({ where: { lessonSlug: validSlug } });
    await prisma.mcqEmbedding.deleteMany({ where: { questionId: testQuestionId } });
    await prisma.knowledgeEmbedding.deleteMany({ where: { termKey: testTermKey } });

    console.log("All Indexing Pipeline verification tasks passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Indexing pipeline verification failed:", err.message || err);
    process.exit(1);
  }
}

testIndexingPipeline();
