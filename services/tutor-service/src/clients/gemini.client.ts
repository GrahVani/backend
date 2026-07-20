import { logger } from "../config/logger";
import { config } from "../config";
import { CircuitBreaker } from "../utils/circuit-breaker";

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  failureThreshold?: number;
  cooldownMs?: number;
}

export interface GeminiResponse {
  text: string;
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export class TutorLLMError extends Error {
  constructor(
    public readonly code:
      | "LLM_UNAVAILABLE"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR"
      | "VALIDATION_ERROR",
    message: string,
    public readonly originalError?: any,
  ) {
    super(message);
    this.name = "TutorLLMError";
  }
}

export class GeminiClient {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private retryCount: number;
  private retryDelayMs: number;
  private breaker: CircuitBreaker;

  constructor(options: GeminiClientOptions = {}) {
    this.apiKey = options.apiKey || config.geminiApiKey || "xxx";
    this.model = options.model || config.gemini.model || "gemini-2.5-flash-lite";
    this.timeoutMs = options.timeoutMs || config.gemini.timeoutMs;
    this.retryCount =
      options.retryCount !== undefined ? options.retryCount : config.gemini.retryCount;
    this.retryDelayMs =
      options.retryDelayMs !== undefined ? options.retryDelayMs : config.gemini.retryDelayMs;

    // Instantiate CircuitBreaker using configuration limits
    const failureThreshold = options.failureThreshold || config.gemini.failureThreshold;
    const cooldownMs = options.cooldownMs || config.gemini.cooldownMs;
    this.breaker = new CircuitBreaker({ failureThreshold, cooldownMs });
  }

  private isTransientError(err: any): boolean {
    const msg = err.message || "";
    if (msg.includes("CIRCUIT_BREAKER_OPEN")) {
      return false;
    }
    if (msg.includes("API error:")) {
      if (
        msg.includes("400") ||
        msg.includes("403") ||
        msg.includes("401") ||
        msg.includes("404")
      ) {
        return false;
      }
    }
    return true; // rate limit (429), server error (500), timeout, network exceptions are transient
  }

  private mapError(err: any): TutorLLMError {
    const msg = err.message || "";
    if (msg.includes("CIRCUIT_BREAKER_OPEN")) {
      return new TutorLLMError("LLM_UNAVAILABLE", "Circuit breaker is currently open", err);
    }
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return new TutorLLMError("LLM_UNAVAILABLE", "Request timed out", err);
    }
    if (msg.includes("API error:")) {
      if (msg.includes("429")) {
        return new TutorLLMError("RATE_LIMITED", "Gemini API rate limited", err);
      }
      if (msg.includes("400") || msg.includes("403") || msg.includes("401")) {
        return new TutorLLMError("VALIDATION_ERROR", "Validation or authentication failure", err);
      }
      if (msg.includes("500") || msg.includes("503") || msg.includes("504")) {
        return new TutorLLMError("INTERNAL_ERROR", "Gemini API internal error", err);
      }
    }
    return new TutorLLMError("LLM_UNAVAILABLE", "Gemini API request failed", err);
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.generateDetailed(prompt);
    return response.text;
  }

  async generateDetailed(prompt: string): Promise<GeminiResponse> {
    if (!this.apiKey || this.apiKey === "xxx") {
      if (process.env.NODE_ENV === "production") {
        logger.error("GEMINI_API_KEY is missing in production environment. Aborting request.");
        throw new TutorLLMError("VALIDATION_ERROR", "GEMINI_API_KEY is not set for production");
      }
      logger.warn("GEMINI_API_KEY is not set or set to 'xxx'. Falling back to mock response.");
      const mockText = this.getMockResponse(prompt);
      return {
        text: mockText,
        model: this.model,
        finishReason: "STOP",
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(mockText.length / 4),
        totalTokens: Math.ceil((prompt.length + mockText.length) / 4),
        latencyMs: 100,
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const makeCall = async (): Promise<GeminiResponse> => {
      let lastErr: any;

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt - 1) * this.retryDelayMs;
          logger.info({ attempt, delay }, "[GeminiClient] Retrying call with backoff");
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        const startTime = Date.now();

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1200,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const body = await response.text();
            throw new Error(
              `Gemini API error: ${response.status} ${response.statusText} - ${body}`,
            );
          }

          const json: any = await response.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            throw new Error(`Invalid response format from Gemini API: ${JSON.stringify(json)}`);
          }

          const latencyMs = Date.now() - startTime;
          const finishReason = json.candidates?.[0]?.finishReason || "STOP";

          const usage = json.usageMetadata || {};
          const inputTokens = usage.promptTokenCount || Math.ceil(prompt.length / 4);
          const outputTokens = usage.candidatesTokenCount || Math.ceil(text.length / 4);
          const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;

          return {
            text,
            model: this.model,
            finishReason,
            inputTokens,
            outputTokens,
            totalTokens,
            latencyMs,
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastErr = err;

          logger.warn({ attempt, error: err.message }, "[GeminiClient] Request attempt failed");

          // Stop retrying immediately if it is a non-transient error
          if (!this.isTransientError(err)) {
            logger.error(
              { error: err.message },
              "[GeminiClient] Non-transient error detected. Aborting retries.",
            );
            throw err;
          }
        }
      }
      throw lastErr;
    };

    try {
      return await this.breaker.execute(() => makeCall());
    } catch (err: any) {
      throw this.mapError(err);
    }
  }

  async generateDetailedStream(
    prompt: string,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<GeminiResponse> {
    if (!this.apiKey || this.apiKey === "xxx") {
      if (process.env.NODE_ENV === "production") {
        logger.error("GEMINI_API_KEY is missing in production environment. Aborting stream request.");
        throw new TutorLLMError("VALIDATION_ERROR", "GEMINI_API_KEY is not set for production");
      }
      logger.warn(
        "GEMINI_API_KEY is not set or set to 'xxx'. Falling back to mock response stream.",
      );
      const mockText = this.getMockResponse(prompt);
      const tokens = mockText.split(" ");
      const startTime = Date.now();

      for (let i = 0; i < tokens.length; i++) {
        if (signal?.aborted) {
          throw new Error("Stream aborted by user");
        }
        const suffix = i === tokens.length - 1 ? "" : " ";
        onToken(tokens[i] + suffix);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      return {
        text: mockText,
        model: this.model,
        finishReason: "STOP",
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(mockText.length / 4),
        totalTokens: Math.ceil((prompt.length + mockText.length) / 4),
        latencyMs: Date.now() - startTime,
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const makeStreamCall = async (): Promise<GeminiResponse> => {
      let lastErr: any;

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt - 1) * this.retryDelayMs;
          logger.info({ attempt, delay }, "[GeminiClient] Retrying call with backoff");
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        const startTime = Date.now();

        // Listen to external abort signal
        const onAbort = () => {
          controller.abort();
        };
        if (signal) {
          signal.addEventListener("abort", onAbort);
        }

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1200,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          if (signal) {
            signal.removeEventListener("abort", onAbort);
          }

          if (!response.ok) {
            const body = await response.text();
            throw new Error(
              `Gemini API error: ${response.status} ${response.statusText} - ${body}`,
            );
          }

          if (!response.body) {
            throw new Error("Empty response body from Gemini streaming endpoint");
          }

          let fullText = "";
          let lastUsage: any = null;
          const decoder = new TextDecoder();
          let buffer = "";

          if (typeof (response.body as any).getReader === "function") {
            const reader = (response.body as any).getReader();
            while (true) {
              if (signal?.aborted) {
                throw new Error("Stream aborted by user");
              }
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6).trim());
                    const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (token) {
                      fullText += token;
                      onToken(token);
                    }
                    if (parsed.usageMetadata) {
                      lastUsage = parsed.usageMetadata;
                    }
                  } catch {}
                }
              }
            }
          } else {
            for await (const chunk of response.body as any) {
              if (signal?.aborted) {
                throw new Error("Stream aborted by user");
              }
              buffer += decoder.decode(chunk, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6).trim());
                    const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (token) {
                      fullText += token;
                      onToken(token);
                    }
                    if (parsed.usageMetadata) {
                      lastUsage = parsed.usageMetadata;
                    }
                  } catch {}
                }
              }
            }
          }

          const latencyMs = Date.now() - startTime;
          const inputTokens = lastUsage?.promptTokenCount || Math.ceil(prompt.length / 4);
          const outputTokens = lastUsage?.candidatesTokenCount || Math.ceil(fullText.length / 4);
          const totalTokens = lastUsage?.totalTokenCount || inputTokens + outputTokens;

          return {
            text: fullText,
            model: this.model,
            finishReason: "STOP",
            inputTokens,
            outputTokens,
            totalTokens,
            latencyMs,
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (signal) {
            signal.removeEventListener("abort", onAbort);
          }
          lastErr = err;

          logger.warn(
            { attempt, error: err.message },
            "[GeminiClient] Request stream attempt failed",
          );

          if (!this.isTransientError(err)) {
            logger.error(
              { error: err.message },
              "[GeminiClient] Non-transient error detected in stream. Aborting.",
            );
            throw err;
          }
        }
      }
      throw lastErr;
    };

    try {
      return await this.breaker.execute(() => makeStreamCall());
    } catch (err: any) {
      throw this.mapError(err);
    }
  }

  private getMockResponse(prompt: string): string {
    return `[Mock Response]
As Gyaneshwara, I have reviewed your query and the lesson context.
Remember that Jyotiṣa is the eye of the Veda, and it helps us see the mapping of time and astronomical events. Let us study the Vedāṅga body map carefully to understand where the eyes are located in the symbolic Puruṣa.`;
  }
}
