import "../../config"; // Load env vars first!
import { createContainer } from "../../container";
import { CreateMessageParams } from "./index";

async function runTest() {
  console.log("Initializing container...");
  const container = createContainer();
  const conversationService = container.conversationService;

  const testUserId = "test-user-id-" + Math.random().toString(36).substring(7);
  const clientMsgId1 = "client-msg-" + Math.random().toString(36).substring(7);
  const clientMsgId2 = "client-msg-" + Math.random().toString(36).substring(7);

  console.log("1. Creating a tutor session...");
  const session = await conversationService.createSession(
    testUserId,
    "Test Session Title",
    "jyotisha-as-vedanga",
  );
  console.log("Session created successfully:", {
    id: session.id,
    userId: session.userId,
    title: session.title,
    lessonSlug: session.lessonSlug,
    status: session.status,
  });

  if (session.userId !== testUserId) throw new Error("userId mismatch");
  if (session.title !== "Test Session Title") throw new Error("title mismatch");

  console.log("2. Retrieving the session...");
  const retrievedSession = await conversationService.getSession(session.id, testUserId);
  if (!retrievedSession) throw new Error("Failed to retrieve session");
  console.log("Retrieved session:", retrievedSession.id);

  console.log("3. Expecting Forbidden error for unauthorized user...");
  try {
    await conversationService.getSession(session.id, "unauthorized-user-id");
    throw new Error("Should have thrown ForbiddenError");
  } catch (err: any) {
    if (err.name === "ForbiddenError") {
      console.log("Successfully blocked unauthorized access (ForbiddenError thrown).");
    } else {
      throw err;
    }
  }

  console.log("4. Creating a message...");
  const msgParams: CreateMessageParams = {
    sessionId: session.id,
    clientMessageId: clientMsgId1,
    role: "USER",
    content: "What is a Vedāṅga?",
  };
  const message = await conversationService.createMessage(msgParams, testUserId);
  console.log("Message created successfully:", {
    id: message.id,
    role: message.role,
    content: message.content,
    clientMessageId: message.clientMessageId,
  });

  console.log("5. Testing message idempotency (sending message with same clientMessageId)...");
  const duplicateMessage = await conversationService.createMessage(msgParams, testUserId);
  console.log("Duplicate message response:", duplicateMessage.id);
  if (duplicateMessage.id !== message.id) {
    throw new Error(
      "Idempotency check failed, created a new message instead of returning existing one",
    );
  }
  console.log("Idempotency verified successfully.");

  console.log("6. Creating a second message...");
  const msgParams2: CreateMessageParams = {
    sessionId: session.id,
    clientMessageId: clientMsgId2,
    role: "ASSISTANT",
    content: "A Vedāṅga is one of the six auxiliary disciplines...",
  };
  const message2 = await conversationService.createMessage(msgParams2, testUserId);
  console.log("Second message created:", message2.id);

  console.log("7. Retrieving all messages for the session...");
  const messages = await conversationService.getMessages(session.id, testUserId);
  console.log("Retrieved messages count:", messages.length);
  if (messages.length !== 2) {
    throw new Error("Expected exactly 2 messages in session, got " + messages.length);
  }
  console.log("Message order verification:");
  messages.forEach((m, i) => console.log(`  [${i}] ${m.role}: ${m.content.substring(0, 30)}...`));

  console.log("8. Listing sessions for user...");
  const sessions = await conversationService.listSessions(testUserId);
  console.log("User sessions count:", sessions.length);
  if (sessions.length === 0) {
    throw new Error("Expected at least 1 session for user");
  }

  console.log("9. Soft deleting session...");
  await conversationService.softDeleteSession(session.id, testUserId);
  console.log("Soft delete executed.");

  console.log("10. Verifying session is excluded from active list...");
  const sessionsAfterDelete = await conversationService.listSessions(testUserId);
  const foundSession = sessionsAfterDelete.find((s) => s.id === session.id);
  if (foundSession) {
    throw new Error("Soft-deleted session is still returned by listSessions!");
  }
  console.log("Soft delete verified successfully.");

  console.log("All tests passed successfully!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
