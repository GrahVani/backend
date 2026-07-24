# AI Tutorial Architecture (Master Flow)

This document provides the high-level architecture of the AI Tutor component ("Gyaneshwara"). 
The AI Tutor in Grahvani is not a simple "prompt-to-LLM" wrapper. It is a sophisticated multi-stage pipeline designed to eliminate hallucinations and personalize responses.

When a user asks a question in the `TutorPanel.tsx` UI, their request travels through **Four Distinct Pipelines** before they see an answer:

## 1. The Context Generation Pipeline (Frontend)
Before a question ever leaves the user's browser, the frontend enriches it with metadata.
The `useTutorStore.ts` intercepts the raw text and bundles it with:
- The exact text of the lesson section the user is currently looking at.
- Data regarding any recent failed quiz attempts.
- *Detailed deeply in:* [assessment-context-injection.md](./assessment-context-injection.md)

## 2. The RAG & Retrieval Pipeline (Backend)
When the `tutor-service` receives the enriched payload, it does not immediately send it to the LLM. 
It must first search the Grahvani database for verified, historically accurate curriculum text related to the user's question to act as "ground truth."
- The `RetrievalService` executes concurrent vector similarity searches (`pgvector`) across lessons, MCQs, and glossaries.
- *Detailed deeply in:* [rag-and-embedding-pipeline.md](./rag-and-embedding-pipeline.md)

## 3. The Prompt Assembly Pipeline (Backend)
Once the backend has the Frontend Context (from Pipeline 1) and the Retrieval Context (from Pipeline 2), it must merge them into a single, cohesive System Prompt.
- The `PromptService` fetches the `gyaneshwara` persona template from the database and injects all collected context, along with strict behavioral rules (like Progressive Disclosure).
- *Detailed deeply in:* [prompt-assembly-and-context.md](./prompt-assembly-and-context.md)

## 4. The Generation & Streaming Pipeline (LLM API)
Finally, the massively enriched prompt is sent to Google's Gemini API via the `GeminiClient`.
To ensure the UI feels instantaneous, the backend returns the LLM's response using **Server-Sent Events (SSE)**. 
- As Gemini generates tokens, the backend streams them chunk-by-chunk back to the frontend.
- `useTutorStore.ts` consumes this stream and visually types out the response in the Tutor Panel, providing a smooth, responsive tutoring experience.
