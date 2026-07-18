import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const port = process.env.PORT || 3015;

async function testChatFlow() {
  const url = `http://localhost:${port}/chat`;
  const sessionId = `test-sess-${Date.now()}`;
  const requestBody = {
    lessonSlug: "jyotisha-as-vedanga",
    sessionId,
    message: "Who is Gyaneshwara, and how is Jyotiṣa related to the eye of the Veda?",
  };

  console.log(`Testing POST ${url}`);
  console.log("Request Body:", JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "test-user-id",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Response Status: ${response.status}`);
    const json: any = await response.json();

    if (!response.ok) {
      console.error("Chat flow failed:", JSON.stringify(json, null, 2));
      process.exit(1);
    }

    console.log("Response Body:", JSON.stringify(json, null, 2));

    if (json.sessionId !== sessionId) throw new Error("Session ID mismatch!");
    if (!json.answer) throw new Error("Missing response answer!");
    if (!json.messageId) throw new Error("Missing message ID!");
    if (json.promptVersion !== "gyaneshwara:1.0.0") throw new Error("Incorrect prompt version!");

    console.log("All chat flow validations passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  }
}

testChatFlow();
