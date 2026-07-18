import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

import { GeminiClient, TutorLLMError } from "../src/clients/gemini.client";

async function testGeminiClient() {
  console.log("Starting Production Gemini Client Integration Verification...");

  const mockApiKey = "xxx";

  try {
    // 1. Successful generation & Token extraction check in Mock Mode
    console.log("Testing mock generation, latency, and tokens...");
    const client = new GeminiClient({ apiKey: mockApiKey });
    const response = await client.generateDetailed("Hello Guru");
    
    console.log("Mock Response:", response);
    if (!response.text.includes("Gyaneshwara")) {
      throw new Error("Expected answer to contain Gyaneshwara");
    }
    if (response.inputTokens <= 0 || response.outputTokens <= 0 || response.totalTokens <= 0) {
      throw new Error("Expected non-zero token metrics");
    }
    if (response.latencyMs !== 100) {
      throw new Error(`Expected mock latency to be 100ms, got ${response.latencyMs}`);
    }
    console.log("Mock generation metrics verified successfully!");

    // ==========================================
    // 2. Timeout and Error Mapping Test
    // ==========================================
    console.log("Testing Timeout abort execution and error mapping...");
    // Injecting invalid URL or forcing timeout via 1ms limit on real endpoint
    const timeoutClient = new GeminiClient({
      apiKey: "real-mock-trigger-key", // triggers real fetch call
      timeoutMs: 1
    });

    try {
      await timeoutClient.generateDetailed("This request must timeout");
      throw new Error("Expected timeout error was not thrown");
    } catch (err: any) {
      if (!(err instanceof TutorLLMError)) {
        throw new Error(`Expected TutorLLMError, got: ${err.name || err}`);
      }
      if (err.code !== "LLM_UNAVAILABLE") {
        throw new Error(`Expected error code LLM_UNAVAILABLE, got ${err.code}`);
      }
      console.log("Timeout mapping success:", err.message);
    }

    // ==========================================
    // 3. Retry and Transient Checks
    // ==========================================
    console.log("Testing Transient failure retries and Non-transient aborts...");
    
    let callCount = 0;
    const originalFetch = global.fetch;

    // Simulate transient server failures
    global.fetch = (async (url: string, options: any) => {
      callCount++;
      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => "Transient Server Error"
      };
    }) as any;

    const retryClient = new GeminiClient({
      apiKey: "test-transient-key",
      retryCount: 2,
      retryDelayMs: 100, // fast retries for test
      failureThreshold: 10 // prevent breaker from opening during this subtest
    });

    try {
      await retryClient.generateDetailed("Trigger transient retries");
      throw new Error("Expected transient error to fail");
    } catch (err: any) {
      if (callCount !== 3) { // 1 initial + 2 retries
        throw new Error(`Expected exactly 3 calls (1 initial + 2 retries), got ${callCount}`);
      }
      if (err.code !== "INTERNAL_ERROR") {
        throw new Error(`Expected mapped error code INTERNAL_ERROR, got ${err.code}`);
      }
      console.log("Transient retries executed successfully!");
    }

    // Reset calls count
    callCount = 0;

    // Simulate non-transient Validation failures (e.g. 400 Bad Request)
    global.fetch = (async (url: string, options: any) => {
      callCount++;
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Validation Failure Details"
      };
    }) as any;

    try {
      await retryClient.generateDetailed("Trigger validation failure");
      throw new Error("Expected validation error to fail");
    } catch (err: any) {
      if (callCount !== 1) {
        throw new Error(`Expected exactly 1 call (validation failures must not retry), got ${callCount}`);
      }
      if (err.code !== "VALIDATION_ERROR") {
        throw new Error(`Expected mapped error code VALIDATION_ERROR, got ${err.code}`);
      }
      console.log("Non-transient Validation errors aborted retries immediately!");
    }

    // ==========================================
    // 4. CircuitBreaker State Machine Test
    // ==========================================
    console.log("Testing CircuitBreaker transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)...");

    // Mock permanent server failure
    global.fetch = (async (url: string, options: any) => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Database crashed"
      };
    }) as any;

    const breakerClient = new GeminiClient({
      apiKey: "test-breaker-key",
      retryCount: 0, // no retries to isolate breaker transitions
      failureThreshold: 2, // open after 2 failures
      cooldownMs: 500 // cooldown fast
    });

    // 4.1 First Failure (CLOSED)
    try {
      await breakerClient.generateDetailed("Fail 1");
    } catch (err) {}
    
    // 4.2 Second Failure (Will exceed threshold and OPEN breaker)
    try {
      await breakerClient.generateDetailed("Fail 2");
    } catch (err) {}

    // 4.3 Third call should be rejected immediately (Circuit is OPEN)
    const breakerStart = Date.now();
    try {
      await breakerClient.generateDetailed("Blocked call");
      throw new Error("Expected blocked call to fail immediately");
    } catch (err: any) {
      const elapsed = Date.now() - breakerStart;
      if (elapsed > 50) {
        throw new Error(`Expected blocked call to reject instantly (<50ms), took ${elapsed}ms`);
      }
      if (err.code !== "LLM_UNAVAILABLE" || !err.message.includes("open")) {
        throw new Error(`Expected LLM_UNAVAILABLE open breaker error, got code: ${err.code}`);
      }
      console.log("CircuitBreaker immediately rejected request while OPEN!");
    }

    // 4.4 Wait for Cooldown to elapse (500ms)
    console.log("Waiting for cooldown timer to elapse...");
    await new Promise(resolve => setTimeout(resolve, 550));

    // 4.5 Restore fetch to succeed
    global.fetch = (async (url: string, options: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Recovered output" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 }
        })
      };
    }) as any;

    // First call after cooldown will be HALF_OPEN test request
    console.log("Executing test request in HALF_OPEN state...");
    const recoveryRes = await breakerClient.generateDetailed("Recover query");
    if (recoveryRes.text !== "Recovered output") {
      throw new Error("Expected recovery text response");
    }

    // Circuit Breaker should now be CLOSED and fully functional again
    const successRes = await breakerClient.generateDetailed("Direct query");
    if (successRes.text !== "Recovered output") {
      throw new Error("Expected clean direct response");
    }
    console.log("CircuitBreaker successfully closed and recovered!");

    // Restore original fetch
    global.fetch = originalFetch;

    console.log("All Production Gemini Client & Circuit Breaker verifications passed successfully!");
    process.exit(0);
  } catch (err: any) {
    console.error("Gemini client verification failed:", err.message || err);
    process.exit(1);
  }
}

testGeminiClient();
