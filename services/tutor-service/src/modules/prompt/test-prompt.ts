import { createContainer } from "../../container";

async function runTest() {
  console.log("Initializing container...");
  const container = createContainer();
  const promptService = container.promptService;

  console.log("1. Rendering prompt with variables...");
  const renderResult = await promptService.renderPrompt({
    content: "What is Jyotiṣa?",
    lessonContext:
      "Jyotiṣa is the science of time tracking and stellar observation, functioning as one of the six auxiliary Vedāṅgas.",
    conversationHistory:
      "User: Hello\nAssistant: Welcome! How can I assist you with your lesson today?",
  });

  console.log("Rendered Prompt Output:");
  console.log("=========================================");
  console.log(renderResult.rendered);
  console.log("=========================================");
  console.log("Prompt Version:", renderResult.version);

  if (!renderResult.rendered.includes("Gyaneshwara")) {
    throw new Error("Persona 'Gyaneshwara' not found in rendered prompt!");
  }
  if (!renderResult.rendered.includes("What is Jyotiṣa?")) {
    throw new Error("Content 'What is Jyotiṣa?' not found in rendered prompt!");
  }
  if (!renderResult.rendered.includes("stellar observation")) {
    throw new Error("Lesson context not interpolated correctly!");
  }
  if (!renderResult.rendered.includes("Welcome! How can I assist")) {
    throw new Error("Conversation history not interpolated correctly!");
  }
  if (renderResult.version !== "gyaneshwara:1.0.0") {
    throw new Error(
      "Static prompt version mismatch! Expected 'gyaneshwara:1.0.0', got " + renderResult.version,
    );
  }

  console.log("All prompt tests passed successfully!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
