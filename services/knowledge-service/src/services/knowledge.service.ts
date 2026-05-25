import { getPrismaClient } from "../config/database";
import { KnowledgeStats } from "../types/knowledge.types";

function prisma() {
  return getPrismaClient();
}

export const knowledgeService = {
  async getByTermKey(termKey: string) {
    return prisma().knowledgeEntry.findUnique({
      where: { termKey },
    });
  },

  async getBatch(keys: string[]) {
    return prisma().knowledgeEntry.findMany({
      where: { termKey: { in: keys } },
      orderBy: { sortOrder: "asc" },
    });
  },

  async getByDomain(domain: string) {
    return prisma().knowledgeEntry.findMany({
      where: { domain },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
  },

  async getByCategory(category: string) {
    return prisma().knowledgeEntry.findMany({
      where: { category },
      orderBy: { sortOrder: "asc" },
    });
  },

  async search(query: string, domain?: string, limit = 20) {
    const where: any = {
      OR: [
        { termKey: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } },
        { tags: { has: query.toLowerCase() } },
      ],
    };

    if (domain) {
      where.domain = domain;
    }

    return prisma().knowledgeEntry.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      take: limit,
    });
  },

  async getStats(): Promise<KnowledgeStats> {
    const [total, domainGroups, categoryGroups] = await Promise.all([
      prisma().knowledgeEntry.count(),
      prisma().knowledgeEntry.groupBy({
        by: ["domain"],
        _count: { _all: true },
      }),
      prisma().knowledgeEntry.groupBy({
        by: ["category"],
        _count: { _all: true },
      }),
    ]);

    const byDomain: Record<string, number> = {};
    for (const g of domainGroups) {
      byDomain[g.domain] = g._count._all;
    }

    const byCategory: Record<string, number> = {};
    for (const g of categoryGroups) {
      byCategory[g.category] = g._count._all;
    }

    return { total, byDomain, byCategory };
  },
};
