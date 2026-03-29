declare namespace Cloudflare {
  interface Env {
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
}

interface Env extends Cloudflare.Env {}
