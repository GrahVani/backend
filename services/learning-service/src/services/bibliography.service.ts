/**
 * Bibliography Service
 * Based on 03-source-citation-standard.md §12
 *
 * Manages primary and modern source bibliography entries.
 * Validates that lesson citations resolve to known entries.
 */

import { Prisma, BibliographyEntry } from "@prisma/client";
import { prisma } from "../config/database";

export interface CitationValidationResult {
  valid: boolean;
  missingRefs: string[];
  foundRefs: Array<{
    ref: string;
    entry: { title: string; author?: string | null } | null;
  }>;
}

/**
 * Validates that all cited sources in a lesson exist in the bibliography.
 */
export async function validateLessonCitations(
  primarySources: Array<{ ref: string; note?: string }>,
  modernSources: Array<{ ref: string; note?: string }>
): Promise<CitationValidationResult> {
  const allRefs = [
    ...primarySources.map((s) => s.ref),
    ...modernSources.map((s) => s.ref),
  ];

  if (allRefs.length === 0) {
    return { valid: true, missingRefs: [], foundRefs: [] };
  }

  // Extract ref keys (e.g., "BPHS, Daśākramaprakaraṇa 46.1" → "BPHS")
  const refKeys = allRefs.map((ref) => {
    const match = ref.match(/^([^,]+)/);
    return match ? match[1].trim() : ref.trim();
  });

  const entries = await prisma.bibliographyEntry.findMany({
    where: { refKey: { in: refKeys } },
  });

  const entryMap = new Map(entries.map((e) => [e.refKey, e]));

  const missingRefs: string[] = [];
  const foundRefs: Array<{ ref: string; entry: { title: string; author?: string | null } | null }> = [];

  for (let i = 0; i < allRefs.length; i++) {
    const ref = allRefs[i];
    const key = refKeys[i];
    const entry = entryMap.get(key);
    if (!entry) {
      missingRefs.push(ref);
    }
    foundRefs.push({
      ref,
      entry: entry ? { title: entry.title, author: entry.author } : null,
    });
  }

  return {
    valid: missingRefs.length === 0,
    missingRefs,
    foundRefs,
  };
}

/**
 * Upserts a bibliography entry.
 */
export async function upsertBibliographyEntry(data: {
  refKey: string;
  entryType: "PRIMARY" | "MODERN";
  title: string;
  author?: string;
  year?: string;
  publisher?: string;
  isbn?: string;
  stream?: string;
  notes?: string;
  citedInModules?: string[];
}): Promise<BibliographyEntry> {
  return prisma.bibliographyEntry.upsert({
    where: { refKey: data.refKey },
    create: {
      refKey: data.refKey,
      entryType: data.entryType,
      title: data.title,
      author: data.author,
      year: data.year,
      publisher: data.publisher,
      isbn: data.isbn,
      stream: data.stream,
      notes: data.notes,
      citedInModules: data.citedInModules || [],
    },
    update: {
      entryType: data.entryType,
      title: data.title,
      author: data.author,
      year: data.year,
      publisher: data.publisher,
      isbn: data.isbn,
      stream: data.stream,
      notes: data.notes,
      citedInModules: data.citedInModules || [],
    },
  });
}

export async function getBibliography(filter?: { entryType?: "PRIMARY" | "MODERN"; stream?: string }): Promise<BibliographyEntry[]> {
  const where: Prisma.BibliographyEntryWhereInput = {};
  if (filter?.entryType) where.entryType = filter.entryType;
  if (filter?.stream) where.stream = filter.stream;

  return prisma.bibliographyEntry.findMany({
    where,
    orderBy: { refKey: "asc" },
  });
}
