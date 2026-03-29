export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  QDRANT_URL: string;
  QDRANT_KEY: string;
  QDRANT_COLLECTION?: string;
  QDRANT_TOP_K?: string;
  QDRANT_QUERY_MODEL?: string;
  TURSO_URL: string;
  TURSO_TOKEN: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  ADMIN_CHAT_ID?: string;
  CACHE_TTL_SECONDS?: string;
}

export function parseIntegerEnv(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function requireEnv(name: keyof Env, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env binding: ${name}`);
  }
  return value;
}
