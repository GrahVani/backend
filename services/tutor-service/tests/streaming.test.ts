import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { getContainer } from "../src/container";
import { TutorLLMError } from "../src/clients/gemini.client";
import { randomUUID } from "crypto";

async function testStreamingAndConversation() {
  console.log("Starting Streaming & Conversation APIs Verification...");

  const container = getContainer();
  const orchestrator = container.tutorOrchestrator;
  const facade = container.conversationFacade;
  const prisma = container.prisma;

  const testUserId = "stream-test-user";
  const testLessonSlug = "jyotisha-as-vedanga";
  const testSessionId = `stream-sess-${Date.now()}`;

  try {
    // 1. Synchronous compatibility check (/chat workflow)
    console.log("Checking synchronous chat regression...");
    const syncRes = await orchestrator.chat({
      userId: testUserId,
      lessonSlug: testLessonSlug,
      sessionId: testSessionId,
      message: "Hello tutor"
    });
    console.log("Synchronous chat response:", syncRes);
    if (!syncRes.answer.includes("Gyaneshwara")) {
      throw new Error("Synchronous chat failed to return valid response");
    }
    console.log("Synchronous chat verified successfully!");

    // 2. Paginated active session list check (GET /sessions)
    console.log("Checking session listing and pagination...");
    const sessions = await facade.listSessions(testUserId, { limit: 10 });
    console.log(`Found ${sessions.length} sessions`);
    const foundSession = sessions.find((s) => s.id === testSessionId);
    if (!foundSession) {
      throw new Error("Expected to find the newly created session in the session list");
    }
    console.log("Session list query passed!");

    // 3. Paginated messages check (GET /sessions/:sessionId/messages)
    console.log("Checking message listing and pagination...");
    const messages = await facade.getMessages(testSessionId, testUserId, { limit: 10 });
    console.log(`Found ${messages.length} messages in session`);
    if (messages.length !== 2) {
      // 1 USER message and 1 ASSISTANT response
      throw new Error(`Expected exactly 2 messages, got ${messages.length}`);
    }
    console.log("Message list query passed!");

    // 4. Successful streaming verification
    console.log("Checking successful streaming...");
    let tokensEmitted = "";
    const testSessionId2 = `stream-sess-2-${Date.now()}`;

    const streamRes = await orchestrator.chatStream(
      {
        userId: testUserId,
        lessonSlug: testLessonSlug,
        sessionId: testSessionId2,
        message: "Explain Jyotiṣa.",
        clientMessageId: `msg-user-2-${Date.now()}`
      },
      (token) => {
        tokensEmitted += token;
      }
    );

    console.log("Stream completed. Output length:", tokensEmitted.length);
    if (tokensEmitted.length === 0) {
      throw new Error("Expected streamed tokens, got empty string");
    }
    if (!streamRes.answer.includes("Gyaneshwara")) {
      throw new Error(`Expected valid answer containing 'Gyaneshwara', got: ${streamRes.answer}`);
    }

    // Verify database assistant record contains correct RAG, model, cost metadata
    const session2Msgs = await facade.getMessages(testSessionId2, testUserId);
    if (session2Msgs.length !== 2) {
      throw new Error(`Expected exactly 2 messages in session 2, got ${session2Msgs.length}`);
    }
    const assistantMsg = session2Msgs.find((m) => m.role === "ASSISTANT");
    if (!assistantMsg) {
      throw new Error("Assistant message not found in session 2");
    }
    if (assistantMsg.content !== streamRes.answer) {
      throw new Error("Database content mismatch with streamed answer");
    }
    if (!assistantMsg.retrievedChunkIds || assistantMsg.retrievedChunkIds.length === 0) {
      throw new Error("Database record missing retrievedChunkIds metadata");
    }
    if (!assistantMsg.model || !assistantMsg.tokenUsageInput || !assistantMsg.latencyMs) {
      throw new Error("Database record missing model/token/latency metadata");
    }
    console.log("Database metadata persistence checked successfully!");

    // Check usage log record
    const usageLogs = await prisma.tutorUsageLog.findMany({
      where: { sessionId: testSessionId2 }
    });
    if (usageLogs.length === 0) {
      throw new Error("Usage log missing for streaming session");
    }
    console.log("Analytics logging verified successfully!");

    // 5. Client disconnect handling
    console.log("Checking client disconnect abort handling...");
    const abortController = new AbortController();
    const testSessionId3 = `stream-sess-3-${Date.now()}`;

    setTimeout(() => {
      console.log("Simulating client disconnect...");
      abortController.abort();
    }, 30);

    try {
      await orchestrator.chatStream(
        {
          userId: testUserId,
          lessonSlug: testLessonSlug,
          sessionId: testSessionId3,
          message: "Trigger client disconnect abort",
          clientMessageId: `msg-user-3-${Date.now()}`
        },
        (token) => {},
        abortController.signal
      );
      throw new Error("Expected chatStream to throw abort exception");
    } catch (err: any) {
      if (!err.message.includes("aborted") && !err.message.includes("Stream aborted")) {
        throw new Error(`Expected aborted exception, got: ${err.message}`);
      }
      console.log("Stream successfully caught abort event and stopped downstream execution!");
    }

    // Verify no assistant response was saved for the aborted stream session
    const session3Msgs = await prisma.tutorMessage.findMany({
      where: { sessionId: testSessionId3 }
    });
    // The USER message is stored immediately (session3Msgs should contain only USER msg), assistant message must NOT exist
    const assistantMsg3 = session3Msgs.find((m) => m.role === "ASSISTANT");
    if (assistantMsg3) {
      throw new Error("Assistant message was persisted on an aborted stream request");
    }
    console.log("Client disconnect database safety verified successfully!");

    // 6. Validation failure checks
    console.log("Checking validation failure & retry isolation...");
    const mockOrchestrator = orchestrator as any;
    const mockGeminiClient = mockOrchestrator.geminiClient as any;
    const originalGenerateDetailedStream = mockGeminiClient.generateDetailedStream;

    // Simulate invalid response containing code block
    mockGeminiClient.generateDetailedStream = async (prompt: string, onToken: any, signal: any) => {
      onToken("Here is a forbidden python code block ```python print(1) ```");
      return {
        text: "Here is a forbidden python code block ```python print(1) ```",
        model: "gemini-2.5-flash-lite",
        finishReason: "STOP",
        inputTokens: 5,
        outputTokens: 5,
        totalTokens: 10,
        latencyMs: 100
      };
    };

    const testSessionId4 = `stream-sess-4-${Date.now()}`;
    try {
      await orchestrator.chatStream(
        {
          userId: testUserId,
          lessonSlug: testLessonSlug,
          sessionId: testSessionId4,
          message: "Trigger validation error response"
        },
        (token) => {}
      );
      throw new Error("Expected chatStream to throw validation failure error");
    } catch (err: any) {
      if (!(err instanceof TutorLLMError)) {
        throw new Error(`Expected TutorLLMError, got: ${err.name || err}`);
      }
      if (!err.message.includes("validation failed")) {
        throw new Error(`Expected validation failure message, got: ${err.message}`);
      }
      console.log("Validation failure successfully triggered validation exception!");
    }

    // Verify assistant response was NOT persisted in the database
    const session4Msgs = await prisma.tutorMessage.findMany({
      where: { sessionId: testSessionId4 }
    });
    const assistantMsg4 = session4Msgs.find((m) => m.role === "ASSISTANT");
    if (assistantMsg4) {
      throw new Error("Invalid response was persisted in the database!");
    }
    console.log("Validation failure database safety verified successfully!");

    // Restore original generateDetailedStream
    mockGeminiClient.generateDetailedStream = originalGenerateDetailedStream;

    // 7. Cleanup database records
    console.log("Cleaning up test database records...");
    const testSessionIds = [testSessionId, testSessionId2, testSessionId3, testSessionId4];
    await prisma.tutorMessage.deleteMany({
      where: { sessionId: { in: testSessionIds } }
    });
    await prisma.tutorSession.deleteMany({
      where: { id: { in: testSessionIds } }
    });

    console.log("All Streaming & Conversation API checks passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Streaming & Conversation API verification failed:", err.message || err);
    process.exit(1);
  }
}

testStreamingAndConversation();
