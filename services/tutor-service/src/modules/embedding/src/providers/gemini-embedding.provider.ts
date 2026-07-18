import { config } from "../../../../config";
import { logger } from "../../../../config/logger";
import { EmbeddingProvider } from "./embedding.provider";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = config.geminiApiKey || "xxx";
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.apiKey || this.apiKey === "xxx") {
      logger.warn(
        "GEMINI_API_KEY is not set or set to 'xxx'. Falling back to mock text embedding.",
      );
      return this.getMockVector(text);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: {
            parts: [{ text }],
          },
          outputDimensionality: 1536,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Gemini Embeddings API error: ${response.status} ${response.statusText} - ${body}`,
        );
      }

      const json: any = await response.json();
      const values = json.embedding?.values;
      if (!values || !Array.isArray(values)) {
        throw new Error(
          `Invalid response format from Gemini Embeddings API: ${JSON.stringify(json)}`,
        );
      }
      return values;
    } catch (error: any) {
      logger.error({ error: error.message }, "Gemini single embedding generation failed");
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey || this.apiKey === "xxx") {
      logger.warn(
        "GEMINI_API_KEY is not set or set to 'xxx'. Falling back to mock batch embeddings.",
      );
      return texts.map((t) => this.getMockVector(t));
    }

    if (texts.length === 0) {
      return [];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${this.apiKey}`;

    try {
      let response: Response | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: "models/gemini-embedding-001",
              content: {
                parts: [{ text }],
              },
              outputDimensionality: 1536,
            })),
          }),
        });

        if (response.status === 429 && attempt < 3) {
          const delayMs = attempt * 5000;
          logger.warn({ attempt, delayMs }, "Gemini API rate limited (429). Waiting before retry...");
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        const body = response ? await response.text() : "No response";
        throw new Error(
          `Gemini Batch Embeddings API error: ${response?.status} ${response?.statusText} - ${body}`,
        );
      }

      const json: any = await response.json();
      const embeddings = json.embeddings;
      if (!embeddings || !Array.isArray(embeddings)) {
        throw new Error(
          `Invalid response format from Gemini Batch Embeddings API: ${JSON.stringify(json)}`,
        );
      }

      return embeddings.map((e: any) => {
        const values = e.values;
        if (!values || !Array.isArray(values)) {
          throw new Error("Missing values property in one of the batch embedding candidates");
        }
        return values;
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Gemini batch embedding generation failed");
      throw error;
    }
  }

  private getMockVector(text: string): number[] {
    const vector = Array.from({ length: 1536 }, () => 0.0);
    for (let i = 0; i < text.length; i++) {
      const idx = i % 1536;
      vector[idx] = (vector[idx] + text.charCodeAt(i)) / 255.0;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = vector[i] / magnitude;
      }
    }
    return vector;
  }
}
