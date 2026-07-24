# Retrieval-Augmented Generation (RAG) Pipeline

This document explains exactly how the `tutor-service` searches the database for relevant curriculum context when a user asks a question, acting as Pipeline #2 of the overall AI Tutor Architecture.

## 1. Generating the Query Vector
When the backend receives the user's question, it cannot search the database using raw text (e.g., using `LIKE '%text%'`), because semantic meaning would be lost. 

Instead, the `RetrievalService` takes the user's raw question string and passes it to the `GeminiEmbeddingProvider`. 
Google's `gemini-embedding-001` model analyzes the semantic meaning of the question and converts it into a high-dimensional mathematical vector (an array of floats).

```typescript
// From: tutor-service/src/modules/rag/src/services/retrieval.service.ts
const queryVector = await this.embeddingFacade.generateEmbedding(question);
const queryVectorStr = JSON.stringify(queryVector);
```

## 2. Concurrent pgvector Search
With the mathematical representation of the question ready, the `RetrievalService` queries the PostgreSQL database. We use the `pgvector` extension to perform **Cosine Similarity** searches.

Because relevant context could be anywhere in the curriculum, the system executes **four concurrent SQL queries** using `Promise.all()` to search across four distinct tables:
1. `LessonEmbedding`: The actual paragraphs of the lessons.
2. `McqEmbedding`: The quiz questions, options, and explanations.
3. `KnowledgeEmbedding`: The glossary of Vedic terms.
4. `InteractiveSpecEmbedding`: The documentation for visual UI components.

**The SQL Logic:**
The core of the search utilizes the pgvector operator `<=>` (Cosine Distance). By subtracting this distance from 1, we get a **Cosine Similarity Score**, where 1 is a perfect match and 0 is entirely unrelated.

Here is the exact `Prisma.$queryRaw` statement executed by the `RetrievalService` against the `LessonEmbedding` table:

```sql
SELECT 
    id, 
    content, 
    metadata, 
    1 - (vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector) as score
FROM app_tutor."LessonEmbedding"
WHERE "lessonSlug" = ${options.lessonSlug} AND vector IS NOT NULL
ORDER BY vector OPERATOR(public.<=>) ${queryVectorStr}::public.vector
LIMIT ${limit};
```

This exact syntax is repeated concurrently across `McqEmbedding`, `KnowledgeEmbedding`, and `InteractiveSpecEmbedding`.

## 3. Filtering and Deduplication
The database returns dozens of potential chunks of text. The `RetrievalService` must refine them before sending them to the LLM:
- **Min Score Threshold**: Any text chunk that has a similarity score lower than `0.55` is instantly discarded as irrelevant. This strict cut-off is the primary mechanism that prevents the AI from hallucinating based on unrelated context.
```typescript
const scoreVal = parseFloat(record.score);
if (scoreVal >= (options.minScore || 0.55)) {
    candidates.push({ ...record });
}
```
- **Deduplication**: Because identical concepts might appear multiple times (e.g. in a lesson and in a glossary), the service runs a `Set`-based deduplication filter across the content strings to ensure the LLM isn't reading duplicate paragraphs.

## 4. Ranking and Top K Selection
Finally, the remaining unique, relevant chunks are sorted in descending order by their similarity score. 
The system slices the array to return only the `Top K` (usually the top 5) most highly relevant chunks of text.

These pristine, historically accurate paragraphs are then passed forward into Pipeline #3 (Prompt Assembly) to act as the AI's "Ground Truth" memory.
