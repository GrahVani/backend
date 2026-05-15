#!/usr/bin/env tsx
/**
 * Curriculum Lint CLI
 * Usage:
 *   npm run curriculum:lint -- <path/to/lesson.md>          # lint single file
 *   npm run curriculum:lint -- --dir <path/to/curriculum>   # lint entire directory
 *
 * Validates front matter, sections, and MCQ banks against all standards.
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { validateLessonFrontMatter } from "../src/validators/lesson.validator";
import { validateMcqBank } from "../src/validators/mcq.validator";
import { lintSections } from "../src/linter/section-linter";

interface LintReport {
  filePath: string;
  valid: boolean;
  frontMatterValid: boolean;
  sectionsValid: boolean;
  mcqValid: boolean;
  errors: string[];
  warnings: string[];
}

function printUsage() {
  console.log(`
Usage:
  npm run curriculum:lint -- <path/to/lesson.md>        # lint single lesson
  npm run curriculum:lint -- --dir <path/to/curriculum>  # lint all lessons in directory

Options:
  --json    Output as JSON
  --help    Show this help
`);
}

function parseArgs(): { target: string; isDir: boolean; asJson: boolean; curriculumRoot: string } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const isDir = args.includes("--dir");
  const asJson = args.includes("--json");
  const targetArg = args.find((a) => !a.startsWith("--"));
  const target = targetArg ? path.resolve(targetArg) : process.cwd();

  const scriptDir = path.dirname(__filename);
  const curriculumRoot = path.resolve(scriptDir, "..", "..", "..", "..", "curriculum");

  return { target, isDir, asJson, curriculumRoot };
}

function findLessonFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name.startsWith("lesson-")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function lintSingleFile(filePath: string, curriculumRoot: string): LintReport {
  const report: LintReport = {
    filePath,
    valid: true,
    frontMatterValid: true,
    sectionsValid: true,
    mcqValid: true,
    errors: [],
    warnings: [],
  };

  // Parse file
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (e: any) {
    report.valid = false;
    report.errors.push(`Failed to read file: ${e.message}`);
    return report;
  }

  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(raw);
  } catch (e: any) {
    report.valid = false;
    report.errors.push(`[front-matter] Failed to parse YAML: ${e.message}`);
    return report;
  }
  const frontMatter = parsed.data;
  const bodyMarkdown = parsed.content;

  // Validate front matter
  const fmResult = validateLessonFrontMatter(frontMatter);
  if (!fmResult.valid || fmResult.schemaErrors) {
    report.frontMatterValid = false;
    report.valid = false;
    if (fmResult.schemaErrors) {
      for (const issue of fmResult.schemaErrors.issues) {
        report.errors.push(`[front-matter.${issue.path.join(".")}] ${issue.message}`);
      }
    }
    report.errors.push(...fmResult.businessRuleErrors.map((e) => `[front-matter] ${e}`));
  }

  // Lint sections
  const lessonType = frontMatter?.lesson_type || "conceptual";
  const hasInteractive = frontMatter?.interactive?.enabled ?? false;
  const sectionResult = lintSections(bodyMarkdown, lessonType, hasInteractive);
  if (sectionResult.errors.length > 0) {
    report.sectionsValid = false;
    report.valid = false;
    report.errors.push(...sectionResult.errors.map((e) => `[sections] ${e}`));
  }
  report.warnings.push(...sectionResult.warnings.map((w) => `[sections] ${w}`));

  // Validate MCQ bank
  const mcqBankFile = frontMatter?.mcq_bank_file;
  if (mcqBankFile) {
    const bankPath = path.join(curriculumRoot, mcqBankFile);
    if (!fs.existsSync(bankPath)) {
      report.mcqValid = false;
      report.valid = false;
      report.errors.push(`[mcq] Bank file not found: ${bankPath}`);
    } else {
      try {
        const bankRaw = fs.readFileSync(bankPath, "utf-8");
        const bankJson = JSON.parse(bankRaw);
        const mcqResult = validateMcqBank(bankJson);
        if (!mcqResult.valid || mcqResult.businessRuleErrors.length > 0) {
          report.mcqValid = false;
          report.valid = false;
          report.errors.push(...mcqResult.businessRuleErrors.map((e) => `[mcq] ${e}`));
        }
        report.warnings.push(...mcqResult.warnings.map((w) => `[mcq] ${w}`));
      } catch (e: any) {
        report.mcqValid = false;
        report.valid = false;
        report.errors.push(`[mcq] Failed to parse bank: ${e.message}`);
      }
    }
  }

  return report;
}

async function main() {
  const { target, isDir, asJson, curriculumRoot } = parseArgs();

  const files = isDir ? findLessonFiles(target) : [target];

  if (files.length === 0) {
    console.error(`No lesson files found.`);
    process.exit(1);
  }

  const reports: LintReport[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of files) {
    const report = lintSingleFile(file, curriculumRoot);
    reports.push(report);
    totalErrors += report.errors.length;
    totalWarnings += report.warnings.length;
  }

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) {
      const status = report.valid ? "✅" : "❌";
      console.log(`\n${status} ${path.relative(process.cwd(), report.filePath)}`);

      if (report.errors.length > 0) {
        console.log(`   Errors:`);
        for (const err of report.errors) {
          console.log(`     • ${err}`);
        }
      }
      if (report.warnings.length > 0) {
        console.log(`   Warnings:`);
        for (const warn of report.warnings) {
          console.log(`     • ${warn}`);
        }
      }
      if (report.valid && report.warnings.length === 0) {
        console.log(`   Clean — no issues.`);
      }
    }

    console.log(`\n────────────────────────────────────────`);
    console.log(`Files linted: ${reports.length}`);
    console.log(`Files with errors: ${reports.filter((r) => !r.valid).length}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Total warnings: ${totalWarnings}`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
