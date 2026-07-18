import dotenv from "dotenv";
import path from "path";

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const serviceKey = process.env.INTERNAL_SERVICE_KEY || "dev-internal-key";
const port = process.env.PORT || 3013;

async function testInternalEndpoint() {
  const url = `http://localhost:${port}/internal/tutor/context/jyotisha-as-vedanga`;
  console.log(`Testing internal context retrieval API: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-internal-key": serviceKey,
      },
    });

    console.log(`Response Status: ${response.status}`);
    const json: any = await response.json();
    
    if (!response.ok) {
      console.error("Request failed:", JSON.stringify(json, null, 2));
      process.exit(1);
    }

    console.log("Success response data keys:", Object.keys(json.data));
    console.log("Lesson title:", json.data.lesson.title);
    console.log("Sections count:", json.data.sections.length);
    console.log("Interactive summary:", json.data.interactiveSummary);
    console.log("Knowledge entries count:", json.data.knowledge.length);

    if (!json.data.lesson.slug) throw new Error("Missing lesson slug!");
    if (json.data.sections.length === 0) throw new Error("No sections returned!");

    console.log("Internal context retrieval verified successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  }
}

testInternalEndpoint();
