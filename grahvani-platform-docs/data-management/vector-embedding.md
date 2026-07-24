# Vector Embedding and Retrieval (RAG)

To enable the AI Tutor ("Gyaneshwara") to accurately answer questions based strictly on the Grahvani curriculum rather than generic internet knowledge, we employ a **Retrieval-Augmented Generation (RAG)** pipeline. This requires converting all our text into numerical representations called Vector Embeddings.

## 1. What is Embedded?

We embed several distinct types of content to ensure comprehensive searchability:
- **Lesson Content (`LessonEmbedding`)**: The actual paragraphs and sections of the learning modules.
- **MCQ Content (`McqEmbedding`)**: The questions, options, and explanations from the quiz bank.
- **Interactive Specs (`InteractiveSpecEmbedding`)**: Descriptions of dynamic visual components in the app.
- **Glossary (`KnowledgeEmbedding`)**: Specific Vedic astrological terms and definitions (e.g., Ayanamsa).

## 2. The Automatic Indexing Pipeline

Embeddings are not generated manually. The pipeline is fully automated and event-driven, operating in the background.

1. **The Event Trigger**: When the `learning-service` finishes importing a new or updated markdown lesson, it publishes a message to a Redis Pub/Sub channel (`EVENT_CHANNELS.LEARNING`) with the payload `curriculum.import.completed`.
2. **The Subscriber (`CurriculumSubscriber`)**: Inside the `tutor-service`, a background worker listens for this exact Redis message.
3. **The Indexer (`IndexingFacade`)**: Upon receiving the message, the subscriber triggers the `indexLesson()` function. This function reads the newly imported text and chunks it into smaller, manageable pieces (averaging ~700 tokens).
4. **The LLM Provider (`GeminiEmbeddingProvider`)**: The chunked text is sent to Google's Gemini API specifically using the `models/gemini-embedding-001` model via a batch request. Gemini returns a high-dimensional array of floats (the vector) for each chunk.
5. **Database Storage**: The vectors are saved into the `tutor-service` PostgreSQL database using `pgvector` extensions, allowing for lightning-fast mathematical similarity searches later.

## 3. The Retrieval Flow (Agent Role)

When a user asks a question in the Tutor Panel:
1. The user's question is passed to the `GeminiEmbeddingProvider` to generate a single query vector.
2. The `RetrievalService` executes a similarity search (Cosine Similarity via SQL queries) against the `LessonEmbedding`, `McqEmbedding`, and `KnowledgeEmbedding` tables to find the vectors that are mathematically closest to the user's question vector.
3. The original text corresponding to those top 3-5 closest vectors is extracted.
4. This text is injected directly into the LLM's system prompt as "Ground Truth Documentation".
5. The LLM agent (Gyaneshwara) reads this extracted text and synthesizes a final answer for the user, ensuring the response is historically accurate to the Grahvani curriculum and completely eliminates hallucination.
