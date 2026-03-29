import { parseIntegerEnv, requireEnv, type Env } from "../../env";
import type { ProductMatch, QdrantSearchInput } from "../../types";

interface QdrantPointPayload {
  product_id?: number | string;
  name?: string;
  brand?: string;
  line?: string | null;
  category?: string | null;
  purpose?: string | null;
  ingredients?: string[];
  flags?: string[];
  skin_types?: string[];
  concerns?: string[];
  source_url?: string | null;
}

interface QdrantSearchPoint {
  id: string | number;
  score?: number;
  payload?: QdrantPointPayload;
}

interface QdrantSearchResponse {
  result?: QdrantSearchPoint[];
}

interface QdrantQueryResponse {
  result?: {
    points?: QdrantSearchPoint[];
  };
}

interface QdrantScrollResponse {
  result?: {
    points?: QdrantSearchPoint[];
  };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQueryTokens(queryText: string): string[] {
  const stopwords = new Set([
    "для",
    "или",
    "как",
    "что",
    "это",
    "мне",
    "нужен",
    "нужна",
    "нужно",
    "подбери",
    "подберите",
    "хочу",
    "есть",
    "без",
    "the",
    "and"
  ]);

  return [...new Set(normalizeSearchText(queryText).split(" ").filter((token) => token.length >= 3 && !stopwords.has(token)))];
}

function buildFilter(input: QdrantSearchInput): Record<string, unknown> | undefined {
  const must: Record<string, unknown>[] = [];

  if (input.skinTypes.length > 0) {
    must.push({
      key: "skin_types",
      match: { any: input.skinTypes }
    });
  }

  if (input.concerns.length > 0) {
    must.push({
      key: "concerns",
      match: { any: input.concerns }
    });
  }

  if (input.excludeFragrance) {
    must.push({
      key: "is_fragrance_free",
      match: { value: true }
    });
  }

  if (input.requireGentle) {
    must.push({
      key: "gentle_fit",
      match: { value: true }
    });
  }

  return must.length > 0 ? { must } : undefined;
}

function normalizePoint(point: QdrantSearchPoint): ProductMatch | null {
  const payload = point.payload;
  if (!payload?.name) {
    return null;
  }

  return {
    id: String(payload.product_id ?? point.id),
    score: Number(point.score ?? 0),
    name: payload.name,
    brand: payload.brand ?? "Belita/Vitex",
    line: payload.line ?? null,
    category: payload.category ?? null,
    purpose: payload.purpose ?? null,
    ingredients: Array.isArray(payload.ingredients) ? payload.ingredients.map((value) => String(value)) : [],
    flags: Array.isArray(payload.flags) ? payload.flags.map((value) => String(value)) : [],
    skinTypes: Array.isArray(payload.skin_types) ? payload.skin_types.map((value) => String(value)) : [],
    concerns: Array.isArray(payload.concerns) ? payload.concerns.map((value) => String(value)) : [],
    sourceUrl: payload.source_url ?? null
  };
}

function computeLexicalScore(product: ProductMatch, queryText: string): number {
  const tokens = extractQueryTokens(queryText);
  if (tokens.length === 0) {
    return 0;
  }

  const searchable = {
    name: normalizeSearchText(product.name),
    line: normalizeSearchText(product.line ?? ""),
    category: normalizeSearchText(product.category ?? ""),
    purpose: normalizeSearchText(product.purpose ?? ""),
    flags: normalizeSearchText(product.flags.join(" ")),
    ingredients: normalizeSearchText(product.ingredients.join(" "))
  };

  let score = 0;
  for (const token of tokens) {
    if (searchable.name.includes(token)) score += 5;
    if (searchable.category.includes(token)) score += 4;
    if (searchable.purpose.includes(token)) score += 3;
    if (searchable.line.includes(token)) score += 2;
    if (searchable.flags.includes(token)) score += 2;
    if (searchable.ingredients.includes(token)) score += 1;
  }

  if (/крем/.test(queryText.toLowerCase()) && /крем/.test(searchable.category)) {
    score += 3;
  }

  return score;
}

export class QdrantClientAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly collection: string;
  private readonly defaultLimit: number;
  private readonly queryModel: string;

  constructor(env: Env) {
    this.baseUrl = requireEnv("QDRANT_URL", env.QDRANT_URL).replace(/\/+$/, "");
    this.apiKey = requireEnv("QDRANT_KEY", env.QDRANT_KEY);
    this.collection = env.QDRANT_COLLECTION || "product_knowledge";
    this.defaultLimit = parseIntegerEnv(env.QDRANT_TOP_K, 4);
    this.queryModel = env.QDRANT_QUERY_MODEL || "BAAI/bge-small-en-v1.5";
  }

  async searchProducts(input: QdrantSearchInput): Promise<ProductMatch[]> {
    const limit = input.limit > 0 ? input.limit : this.defaultLimit;
    const filter = buildFilter(input);

    if (Array.isArray(input.queryVector) && input.queryVector.length > 0) {
      const response = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey
        },
        body: JSON.stringify({
          vector: input.queryVector,
          limit,
          with_payload: true,
          filter
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant vector search failed: ${response.status} ${errorText}`);
      }

      const payload = (await response.json()) as QdrantSearchResponse;
      return (payload.result ?? []).map(normalizePoint).filter((item): item is ProductMatch => item !== null);
    }

    const response = await fetch(`${this.baseUrl}/collections/${this.collection}/points/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey
      },
      body: JSON.stringify({
        query: {
          text: input.queryText,
          model: this.queryModel
        },
        limit,
        with_payload: true,
        filter
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Qdrant text query failed, trying lexical fallback: ${response.status} ${errorText}`);
      return this.scrollFallbackSearch(input, filter, limit);
    }

    const payload = (await response.json()) as QdrantQueryResponse;
    return (payload.result?.points ?? [])
      .map(normalizePoint)
      .filter((item): item is ProductMatch => item !== null);
  }

  private async scrollFallbackSearch(
    input: QdrantSearchInput,
    filter: Record<string, unknown> | undefined,
    limit: number
  ): Promise<ProductMatch[]> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collection}/points/scroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey
      },
      body: JSON.stringify({
        limit: Math.max(limit * 8, 24),
        with_payload: true,
        with_vector: false,
        filter
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant scroll fallback failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as QdrantScrollResponse;
    const scored = (payload.result?.points ?? [])
      .map(normalizePoint)
      .filter((item): item is ProductMatch => item !== null)
      .map((product) => ({
        ...product,
        score: computeLexicalScore(product, input.queryText)
      }))
      .filter((product) => product.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return scored;
  }
}
