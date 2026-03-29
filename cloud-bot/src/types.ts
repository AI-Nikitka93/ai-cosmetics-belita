export interface UserProfile {
  userId: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  skinType: string | null;
  concerns: string[];
  avoidFragrance: boolean;
  preferGentle: boolean;
  selfReportedCondition: string | null;
}

export interface MemorySummary {
  userId: string;
  summary: string;
  updatedAt: string;
}

export interface ProductMatch {
  id: string;
  score: number;
  name: string;
  brand: string;
  line: string | null;
  category: string | null;
  purpose: string | null;
  ingredients: string[];
  flags: string[];
  skinTypes: string[];
  concerns: string[];
  sourceUrl: string | null;
}

export interface QdrantSearchInput {
  queryText: string;
  skinTypes: string[];
  concerns: string[];
  excludeFragrance: boolean;
  requireGentle: boolean;
  limit: number;
  queryVector?: number[];
}

export interface LLMAnswerInput {
  userMessage: string;
  userProfile: UserProfile | null;
  memorySummary: MemorySummary | null;
  productMatches: ProductMatch[];
}
