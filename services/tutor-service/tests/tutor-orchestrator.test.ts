import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";

async function testTutorOrchestrator() {
  console.log("Starting Tutor Orchestrator Metadata & Grounding integration tests...");
  const container = getContainer();
  const prisma = container.prisma;
  const orchestrator = container.tutorOrchestrator;

  const testSessionId = `orch-sess-${Date.now()}`;
  const testUserId = "test-user-orch";
  const testLessonSlug = "jyotisha-as-vedanga";

  try {
    // 1. Run the orchestrator chat flow
    console.log("Sending query through TutorOrchestrator...");
    const chatResult = await orchestrator.chat({
      userId: testUserId,
      lessonSlug: testLessonSlug,
      sessionId: testSessionId,
      message: "Explain the body map of Purusha and its relationship with Jyotiṣa."
    });

    console.log("Chat result:", chatResult);

    // 2. Query the persisted messages in the database
    console.log("Querying database to check persisted TutorMessage fields...");
    const dbMessages = await prisma.tutorMessage.findMany({
      where: { sessionId: testSessionId },
      orderBy: { createdAt: "asc" }
    });

    console.log(`Retrieved ${dbMessages.length} messages from database.`);
    if (dbMessages.length !== 2) {
      throw new Error(`Expected exactly 2 messages (USER + ASSISTANT), got ${dbMessages.length}`);
    }

    const userMessage = dbMessages[0];
    const assistantMessage = dbMessages[1];

    console.log("User Message DB Record:", {
      id: userMessage.id,
      role: userMessage.role,
      content: userMessage.content,
    });

    console.log("Assistant Message DB Record:", {
      id: assistantMessage.id,
      role: assistantMessage.role,
      model: assistantMessage.model,
      tokenUsageInput: assistantMessage.tokenUsageInput,
      tokenUsageOutput: assistantMessage.tokenUsageOutput,
      latencyMs: assistantMessage.latencyMs,
      retrievedChunkIds: assistantMessage.retrievedChunkIds,
    });

    // Validations:
    if (assistantMessage.role !== "ASSISTANT") {
      throw new Error(`Expected second message role to be ASSISTANT, got ${assistantMessage.role}`);
    }

    // Verify model name was stored correctly
    if (!assistantMessage.model || assistantMessage.model !== "gemini-2.5-flash-lite") {
      throw new Error(`Expected model to be gemini-2.5-flash-lite (from mock fallback response), got: ${assistantMessage.model}`);
    }

    // Verify token counts are present (mock mode sets them to non-zero values)
    if (
      assistantMessage.tokenUsageInput === null || 
      assistantMessage.tokenUsageInput <= 0 ||
      assistantMessage.tokenUsageOutput === null ||
      assistantMessage.tokenUsageOutput <= 0
    ) {
      throw new Error(`Expected non-zero token metrics, got: input=${assistantMessage.tokenUsageInput}, output=${assistantMessage.tokenUsageOutput}`);
    }

    // Verify latency is present and matches the environment mode (mock: 100ms, live: >0)
    const isMockMode = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "xxx";
    if (assistantMessage.latencyMs === null || (isMockMode && assistantMessage.latencyMs !== 100) || (!isMockMode && assistantMessage.latencyMs <= 0)) {
      throw new Error(`Expected latencyMs to be ${isMockMode ? "100" : ">0"}, got: ${assistantMessage.latencyMs}`);
    }

    // Verify retrievedChunkIds list is present
    if (!assistantMessage.retrievedChunkIds || !Array.isArray(assistantMessage.retrievedChunkIds)) {
      throw new Error("Expected retrievedChunkIds to be a valid string array");
    }
    console.log("Retrieved chunk IDs found:", assistantMessage.retrievedChunkIds);

    // 3. Query the persisted analytics usage logs in the database
    console.log("Querying database to check persisted TutorUsageLog fields...");
    const usageLogs = await prisma.tutorUsageLog.findMany({
      where: { sessionId: testSessionId }
    });

    console.log(`Retrieved ${usageLogs.length} usage logs from database.`);
    if (usageLogs.length < 1) {
      throw new Error("Expected at least one usage log to be saved to database");
    }

    const log = usageLogs[0];
    console.log("Usage Log Record:", {
      model: log.model,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      latencyMs: log.latencyMs,
      provider: log.provider,
    });

    if (log.model !== "gemini-2.5-flash-lite") {
      throw new Error(`Expected usage log model to be gemini-2.5-flash-lite, got ${log.model}`);
    }
    if (log.inputTokens !== assistantMessage.tokenUsageInput || log.outputTokens !== assistantMessage.tokenUsageOutput) {
      throw new Error("Expected usage log token counts to match assistant message record exactly");
    }
    if (log.latencyMs !== assistantMessage.latencyMs) {
      throw new Error("Expected usage log latency to match assistant message latency exactly");
    }

    // 4. Cleanup DB session records
    console.log("Cleaning up test database records...");
    await prisma.tutorMessage.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.tutorUsageLog.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.tutorSession.deleteMany({ where: { id: testSessionId } });

    console.log("All Tutor Orchestrator Metadata & Grounding verifications passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Tutor orchestrator verification failed:", err.message || err);
    process.exit(1);
  }
}

testTutorOrchestrator();
