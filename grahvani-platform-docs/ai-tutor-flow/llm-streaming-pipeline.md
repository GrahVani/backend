# LLM Generation & Streaming Pipeline (Server-Sent Events)

This document explains Pipeline #4 of the AI Tutor Architecture: how the fully assembled prompt is sent to Google's Gemini LLM and how the response is streamed back to the user's browser in real-time.

## 1. The Challenge of AI Latency
When dealing with complex prompts and RAG, an LLM might take 5 to 15 seconds to generate a complete answer. If we used a standard HTTP request/response cycle, the user would stare at a spinning loading wheel for that entire duration. To make the Tutor feel like a real-time chat, we utilize **Server-Sent Events (SSE)**.

## 2. The Streaming Route
The frontend `TutorPanel.tsx` does not make a standard `fetch` call. It initiates a connection to the streaming endpoint in `tutor-service`:
`POST /sessions/:sessionId/messages/stream`

### Header Configuration
To keep the HTTP connection alive and prevent the browser from waiting for the request to close, the backend sets specific SSE headers in `tutor.routes.ts`:
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
```

## 3. The Generator Yield
The massive assembled prompt is sent to `GeminiClient.generateDetailedStream()`. 
Instead of waiting for the full string, this method uses a JavaScript **Async Generator** (`yield`). 

As Gemini computes the answer, it returns small chunks of text (tokens) to the backend. The backend immediately writes these chunks to the open HTTP connection:

```typescript
// From: tutor-service/src/services/tutor.orchestrator.ts
geminiRes = await this.geminiClient.generateDetailedStream(
    assembledPrompt,
    (chunkText) => {
        // Emit each token instantly to the frontend
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    },
    abortController.signal
);
```

## 4. Frontend Hydration
Back in the user's browser, the `useTutorStore.ts` listens to the incoming `data:` packets on the open stream. As each token arrives, it appends the text to the active message in the UI state. 

This creates the visual effect of the AI "typing out" its answer in real-time, completely masking the backend latency.

## 5. Graceful Disconnect
Once Gemini finishes generating the final token, the backend writes a special termination sequence:
```typescript
res.write(`data: [DONE]\n\n`);
res.end();
```
At this point, the backend saves the complete assistant message to the PostgreSQL database for chat history, and the HTTP connection is closed.
