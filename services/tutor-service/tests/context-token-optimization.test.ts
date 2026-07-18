import { ContextBuilder } from "../src/services/context.builder";
import { LearningContextResponse } from "../src/services/learning.client";
import { TutorMessage } from "@grahvani/tutor-database";

function runTokenOptimizationVerification() {
  console.log("==================================================================");
  console.log("🚀 Running ContextBuilder Token Optimization Verification Suite");
  console.log("==================================================================\n");

  const builder = new ContextBuilder({ maxCharacters: 12000 });

  // 1. Simulate Lesson 1 (jyotisha-as-vedanga) with 13 full sections of Sanskrit shlokas and explanations
  const sections = [];
  for (let i = 1; i <= 13; i++) {
    sections.push({
      sectionNumber: i,
      sectionTitle: `Section ${i}: Vedanga Concept ${i}`,
      sectionType: "text",
      content: `Sanskrit Shloka and detailed commentary for section ${i}. ` + "This section covers fundamental Jyotisha principles, calculation methods, and Vedic alignments. ".repeat(6),
    });
  }

  const mockLessonContext: LearningContextResponse = {
    lesson: {
      id: "lesson-1",
      slug: "jyotisha-as-vedanga",
      title: "Jyotisha as Vedanga",
      subtitle: "The Eye of the Veda",
      learningOutcomes: ["Understand 6 Vedangas", "Master Purusha Body Map", "Distinguish Vedanga vs Vedanta"],
      prerequisites: [],
    },
    sections,
    knowledge: [],
    interactiveSummary: null,
  };

  // 2. Simulate multi-turn historical messages (each AI reply is ~3,000 chars / ~750 tokens)
  const messages: TutorMessage[] = [];
  const baseTime = new Date("2026-07-14T10:00:00Z").getTime();

  console.log("--- TEST 1: Turn 1 (No History, Active Section 4) ---");
  const turn1Result = builder.build(
    "What is the role of Jyotisha in the Purusha Body Map?",
    mockLessonContext,
    messages,
    [],
    null,
    null,
    { sectionNumber: 4 } // Student is actively studying Section 4
  );

  const turn1StaticChars = turn1Result.lessonContext.length;
  const turn1TokensEst = Math.round(turn1StaticChars / 4) + 2800; // +2800 for gyaneshwara system persona
  console.log(`✅ Turn 1 lessonContext chars: ${turn1StaticChars} (~${Math.round(turn1StaticChars / 4)} tokens)`);
  console.log(`✅ Turn 1 Estimated Total Prompt Tokens (including System Persona): ~${turn1TokensEst} tokens`);
  if (!turn1Result.lessonContext.includes("[Syllabus Reference]")) {
    throw new Error("Expected Syllabus Reference slicing when active section is specified");
  }
  console.log("🎯 Active section syllabus slicing verified!\n");

  // Add 6 multi-turn historical questions and massive 800-word AI replies
  for (let i = 1; i <= 6; i++) {
    messages.push({
      id: `msg-u-${i}`,
      sessionId: "test-sess",
      clientMessageId: `cli-u-${i}`,
      role: "USER",
      content: `Question ${i}: Can you explain section ${i} in detail with all shlokas?`,
      tokenUsageInput: null,
      tokenUsageOutput: null,
      latencyMs: null,
      model: null,
      retrievedChunkIds: [],
      createdAt: new Date(baseTime + i * 60000),
      deletedAt: null,
    } as any);

    messages.push({
      id: `msg-a-${i}`,
      sessionId: "test-sess",
      clientMessageId: `cli-a-${i}`,
      role: "ASSISTANT",
      content: `Assistant detailed explanation for turn ${i}: ` + "Sanskrit commentary, astrological breakdowns, planetary significations, and comprehensive pedagogical guidance. ".repeat(25), // ~3,000 chars each!
      tokenUsageInput: 5000,
      tokenUsageOutput: 750,
      latencyMs: 3000,
      model: "gemini-2.5-flash-lite",
      retrievedChunkIds: ["chunk-1"],
      createdAt: new Date(baseTime + i * 60000 + 30000),
      deletedAt: null,
    } as any);
  }

  console.log("--- TEST 2: Turn 7 (After 6 long historical turns without summary) ---");
  const turn7Result = builder.build(
    "How does Shiksha relate to Vyakarana?",
    mockLessonContext,
    messages,
    [],
    null,
    null,
    { sectionNumber: 4 }
  );

  const turn7HistoryChars = turn7Result.conversationHistory.length;
  const turn7TokensEst = Math.round((turn1StaticChars + turn7HistoryChars) / 4) + 2800;
  console.log(`✅ Turn 7 conversationHistory chars: ${turn7HistoryChars} (~${Math.round(turn7HistoryChars / 4)} tokens)`);
  console.log(`✅ Turn 7 Estimated Total Prompt Tokens: ~${turn7TokensEst} tokens`);
  
  if (turn7HistoryChars > 3500) {
    throw new Error(`Expected conversationHistory to be bounded below ~3,500 chars, got ${turn7HistoryChars}`);
  }
  if (!turn7Result.conversationHistory.includes("[truncated for token optimization]")) {
    throw new Error("Expected long assistant replies inside history to be truncated");
  }
  console.log("🎯 Sliding window and character budget truncation verified!\n");

  console.log("--- TEST 3: Turn 8 (With Rolling Session Summary active) ---");
  const summaryText = "Learner mastered Purusha body map and Vedanga concepts 1 to 4. Needs reinforcement on Nirayana coordinate offsets.";
  const turn8Result = builder.build(
    "Explain Nirayana calculation offset.",
    mockLessonContext,
    messages,
    [],
    summaryText,
    null,
    { sectionNumber: 5 }
  );

  const turn8HistoryChars = turn8Result.conversationHistory.length;
  const turn8TokensEst = Math.round((turn8Result.lessonContext.length + turn8HistoryChars) / 4) + 2800;
  console.log(`✅ Turn 8 conversationHistory chars (Summary + Sliding Window): ${turn8HistoryChars} (~${Math.round(turn8HistoryChars / 4)} tokens)`);
  console.log(`✅ Turn 8 Estimated Total Prompt Tokens: ~${turn8TokensEst} tokens`);
  if (!turn8Result.conversationHistory.includes("[Session Summary of previous conversation]")) {
    throw new Error("Expected session summary to be prepended in conversation history");
  }
  console.log("🎯 Rolling session summary + sliding window verified!\n");

  console.log("==================================================================");
  console.log("🏆 ALL TOKEN OPTIMIZATION TEST CASES PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runTokenOptimizationVerification();
