import { Redis } from "@upstash/redis";

import type { Env } from "../../env";

export class UpstashCacheStore {
  private readonly redis: Redis;

  constructor(env: Env) {
    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.redis.get<T>(key);
    return value ?? null;
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
}
