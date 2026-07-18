import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";

async function testContextEndpoint() {
  console.log("Starting Tutor Lesson Context API Verification...");

  const container = getContainer();
  const learningClient = container.learningClient;

  const validSlug = "jyotisha-as-vedanga";
  const invalidSlug = `non-existent-slug-${Date.now()}`;

  try {
    // 1. Test positive retrieval
    console.log(`Querying context for valid slug '${validSlug}'...`);
    const context = await learningClient.getLessonContext(validSlug);
    console.log("Context retrieved:", context.lesson.title);

    if (context.lesson.slug !== validSlug) {
      throw new Error(`Expected slug '${validSlug}', got '${context.lesson.slug}'`);
    }
    if (!context.sections || context.sections.length === 0) {
      throw new Error("Expected sections array to be populated");
    }
    console.log("Positive context retrieval query passed!");

    // 2. Test negative retrieval (non-existent slug)
    console.log(`Querying context for invalid slug '${invalidSlug}'...`);
    try {
      await learningClient.getLessonContext(invalidSlug);
      throw new Error("Expected learningClient to throw error on non-existent lesson");
    } catch (err: any) {
      if (!err.message.includes("404") && !err.message.includes("not found")) {
        throw new Error(`Expected 404 error, got: ${err.message}`);
      }
      console.log("Negative context retrieval query passed with expected error status!");
    }

    console.log("All Tutor Lesson Context API verification checks completed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Lesson Context API verification failed:", err.message || err);
    process.exit(1);
  }
}

testContextEndpoint();
