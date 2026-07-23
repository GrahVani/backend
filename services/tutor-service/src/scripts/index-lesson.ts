import dotenv from "dotenv";
import path from "path";

// Load root and local .env
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { getContainer } from "../container";

async function main() {
  const lessonSlug = process.argv[2] || "jyotisha-as-vedanga";
  console.log(`\n======================================================`);
  console.log(`[Indexing Script] Indexing Lesson: "${lessonSlug}"`);
  console.log(`======================================================\n`);

  const container = getContainer();

  try {
    const stats = await container.indexingFacade.indexLesson(lessonSlug);
    console.log(`\n✅ Indexing completed successfully for "${lessonSlug}"!`);
    console.log(`Summary Statistics:`, JSON.stringify(stats, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ Error indexing lesson "${lessonSlug}":`, err.message || err);
    process.exit(1);
  }
}

main();
