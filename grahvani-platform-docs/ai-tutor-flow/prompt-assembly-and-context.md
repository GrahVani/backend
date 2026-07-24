# Prompt Assembly and Context Pipeline

This document explains Pipeline #3 of the AI Tutor Architecture: how the system gathers all the disparate pieces of context and weaves them together into the final System Prompt that the LLM understands.

## 1. Fetching the Persona
The `PromptService` inside the `tutor-service` does not hardcode the AI's persona. 
Instead, it queries the `PromptTemplate` table in the PostgreSQL database for the active `gyaneshwara` prompt. 

This template is written using **Handlebars (`{{...}}`) syntax**. It defines the AI as a compassionate Vedic Astrology tutor and sets the boundaries for its behavior. By storing this in the database, administrators can tweak the persona instantly without redeploying code.

## 2. Injecting Context
Once the raw Handlebars string is fetched, the `PromptService` acts as an assembler, injecting variables into the template:

### A. The Retrieval Context (RAG)
The Top K most relevant paragraphs retrieved by the `RetrievalService` (Pipeline #2) are concatenated into a single block of text and injected into a `<lesson_context>` XML tag within the prompt. 

*Instructions to the LLM:* "You must answer the user's question using ONLY the information provided in the `<lesson_context>`. If the answer is not there, admit you do not know."

### B. The Frontend Context
As detailed in `assessment-context-injection.md`, the frontend `useTutorStore.ts` Hydration process passes along the exact text the user is currently reading, plus any recent failed quiz attempts (`QuizAttemptContext`). This is injected into the `<user_current_state>` XML tags so the AI knows exactly what the user is looking at.

## 3. Applying the Assessment Policy
The final, crucial step of prompt assembly is enforcing the **Progressive Disclosure Policy**.

If the `QuizAttemptContext` is present (meaning the user just failed a quiz), the `PromptService` appends a strict rule block called `<assessment_policy>` to the very bottom of the system prompt (so it is freshest in the LLM's attention mechanism).

**The Policy dictates:**
1. Do not give away the direct answer to the quiz.
2. Analyze the user's incorrect choice and gently explain the flaw in that specific logic.
3. Use the Socratic Method to provide a hint that guides the user toward the correct choice without spoiling it.

## The Final Output
The assembled prompt is a massive, highly structured string containing the persona, the dynamic curriculum knowledge, the user's exact UI state, the quiz history, and strict behavioral guardrails. 

Here is a visual representation of what the final injected Handlebars template looks like right before it is sent to the LLM:

```xml
You are Gyaneshwara, a compassionate and expert tutor of Vedic Astrology...
[... Persona Rules ...]

<lesson_context>
  [Top K RAG Chunks injected here]
  "Jyotiṣa is a Vedāṅga... It is used for timing rituals..."
</lesson_context>

<user_current_state>
  [Frontend text injected here]
  "User is currently viewing Section 4: The Original Function of Jyotiṣa."
</user_current_state>

<!-- Injected dynamically ONLY if a quiz was failed -->
<assessment_policy>
  [QuizAttemptContext details injected here]
  "The user failed question ID 1. They incorrectly chose option B."
  
  CRITICAL TUTORING RULES:
  1. Do NOT provide the direct answer.
  2. Explain why option B is incorrect based on the <lesson_context>.
  3. Provide a Socratic hint to guide them toward the right logic.
</assessment_policy>
```

This massive string is passed to Pipeline #4 (LLM Generation & Streaming), resulting in a highly contextualized, accurate, and pedagogical response.
