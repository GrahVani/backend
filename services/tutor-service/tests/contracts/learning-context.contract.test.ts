import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), override: true });

import { config } from "../../src/config";

async function runContractTest() {
  console.log("Starting Learning Context API Contract Test...");
  const serviceUrl = config.services.learning || "http://localhost:3013";
  const serviceKey = config.internalServiceKey;

  if (!serviceKey) {
    console.error("INTERNAL_SERVICE_KEY environment variable is not defined!");
    process.exit(1);
  }

  const validSlug = "jyotisha-as-vedanga";
  const url = `${serviceUrl}/internal/tutor/context/${validSlug}`;

  try {
    console.log(`Sending GET request to ${url}...`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-internal-key": serviceKey,
        "Content-Type": "application/json",
      },
    });

    console.log(`Response Status: ${response.status}`);
    if (response.status !== 200) {
      throw new Error(`Expected HTTP status 200, got ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Expected content-type to be JSON, got '${contentType}'`);
    }

    const body: any = await response.json();
    console.log("Response Body Schema Validation:");

    // 1. Root structure validation
    if (body.success !== true) {
      throw new Error(`Expected success to be true, got ${body.success}`);
    }
    if (!body.data) {
      throw new Error("Missing 'data' property in response root");
    }

    const data = body.data;

    // 2. Data.lesson schema validation
    if (!data.lesson || typeof data.lesson !== "object") {
      throw new Error("Missing or invalid 'data.lesson' object");
    }
    if (typeof data.lesson.id !== "string") {
      throw new Error(`Expected lesson.id to be string, got ${typeof data.lesson.id}`);
    }
    if (typeof data.lesson.slug !== "string" || data.lesson.slug !== validSlug) {
      throw new Error(`Expected lesson.slug to be '${validSlug}', got '${data.lesson.slug}'`);
    }
    if (typeof data.lesson.title !== "string") {
      throw new Error(`Expected lesson.title to be string, got ${typeof data.lesson.title}`);
    }
    if (data.lesson.subtitle !== undefined && data.lesson.subtitle !== null && typeof data.lesson.subtitle !== "string") {
      throw new Error("Expected lesson.subtitle to be string, null, or undefined");
    }
    if (!Array.isArray(data.lesson.learningOutcomes)) {
      throw new Error("Expected lesson.learningOutcomes to be an array");
    }
    for (const item of data.lesson.learningOutcomes) {
      if (typeof item !== "string") {
        throw new Error(`Expected learningOutcomes item to be string, got ${typeof item}`);
      }
    }
    if (!Array.isArray(data.lesson.prerequisites)) {
      throw new Error("Expected lesson.prerequisites to be an array");
    }
    for (const item of data.lesson.prerequisites) {
      if (typeof item !== "string") {
        throw new Error(`Expected prerequisites item to be string, got ${typeof item}`);
      }
    }

    // 3. Data.sections schema validation
    if (!Array.isArray(data.sections)) {
      throw new Error("Expected data.sections to be an array");
    }
    console.log(`Validating ${data.sections.length} curriculum sections...`);
    for (let i = 0; i < data.sections.length; i++) {
      const sec = data.sections[i];
      if (typeof sec.sectionNumber !== "number") {
        throw new Error(`Expected sections[${i}].sectionNumber to be number, got ${typeof sec.sectionNumber}`);
      }
      if (typeof sec.sectionTitle !== "string") {
        throw new Error(`Expected sections[${i}].sectionTitle to be string, got ${typeof sec.sectionTitle}`);
      }
      if (typeof sec.sectionType !== "string") {
        throw new Error(`Expected sections[${i}].sectionType to be string, got ${typeof sec.sectionType}`);
      }
      if (typeof sec.content !== "string") {
        throw new Error(`Expected sections[${i}].content to be string, got ${typeof sec.content}`);
      }
    }

    // 4. Data.knowledge array validation
    if (!Array.isArray(data.knowledge)) {
      throw new Error("Expected data.knowledge to be an array");
    }

    // 5. Data.interactiveSummary validation
    if (data.interactiveSummary !== null && typeof data.interactiveSummary !== "object") {
      throw new Error("Expected data.interactiveSummary to be null or an object");
    }
    if (data.interactiveSummary) {
      if (typeof data.interactiveSummary.type !== "string") {
        throw new Error("Expected interactiveSummary.type to be string");
      }
      if (typeof data.interactiveSummary.fallback !== "string") {
        throw new Error("Expected interactiveSummary.fallback to be string");
      }
      if (typeof data.interactiveSummary.spec !== "object" && typeof data.interactiveSummary.spec !== "string") {
        throw new Error("Expected interactiveSummary.spec to be string or object");
      }
    }

    console.log("Positive contract tests passed successfully!");

    // 6. Negative contract validation (Non-existent slug)
    const invalidSlug = `non-existent-${Date.now()}`;
    const negativeUrl = `${serviceUrl}/internal/tutor/context/${invalidSlug}`;
    console.log(`Sending negative GET request to ${negativeUrl}...`);
    const negResponse = await fetch(negativeUrl, {
      method: "GET",
      headers: {
        "x-internal-key": serviceKey,
        "Content-Type": "application/json",
      },
    });

    console.log(`Negative Response Status: ${negResponse.status}`);
    if (negResponse.status !== 404) {
      throw new Error(`Expected negative HTTP status 404, got ${negResponse.status}`);
    }

    const negBody: any = await negResponse.json();
    if (!negBody.error || negBody.error.code !== "LESSON_NOT_FOUND") {
      throw new Error(`Expected error.code to be 'LESSON_NOT_FOUND', got '${negBody?.error?.code}'`);
    }
    if (typeof negBody.error.message !== "string") {
      throw new Error("Expected error.message to be string");
    }

    console.log("Negative contract tests passed successfully!");
    console.log("All Learning Context API Contract Tests Completed Successfully!");
  } catch (err: any) {
    console.error("Contract test validation failed with error:", err.message || err);
    process.exit(1);
  }
}

runContractTest();
