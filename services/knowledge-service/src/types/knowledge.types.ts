export interface KnowledgeEntry {
  id: string;
  termKey: string;
  domain: string;
  category: string;
  title: string;
  sanskrit: string | null;
  summary: string;
  description: string;
  howToRead: string | null;
  significance: string | null;
  examples: KnowledgeExample[];
  relatedTerms: string[];
  tags: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeExample {
  title: string;
  content: string;
}

export interface KnowledgeStats {
  total: number;
  byDomain: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface BatchQuery {
  keys: string[];
}

export interface SearchQuery {
  q: string;
  domain?: string;
  limit?: number;
}
