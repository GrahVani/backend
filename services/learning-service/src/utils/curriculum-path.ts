/**
 * Robust curriculum root resolution.
 * Walks up from the caller's file location until it finds a `curriculum/` directory.
 * This works regardless of whether the code runs via tsx (src/) or compiled dist/.
 */
import * as fs from "fs";
import * as path from "path";

export function findCurriculumRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, "curriculum");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    dir = path.dirname(dir);
  }
  // In production Docker environments, the curriculum folder might not be mounted.
  // Instead of crashing the entire Node process on startup, return a fallback path.
  // The service methods (e.g. quiz.service.ts) use fs.existsSync() which will safely return false.
  return "/app/curriculum";
}

/** Cached curriculum root for runtime use */
export const CURRICULUM_ROOT = findCurriculumRoot(__dirname);
