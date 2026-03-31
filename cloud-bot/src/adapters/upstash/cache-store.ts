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

  async setIfAbsentJson<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, value, { ex: ttlSeconds, nx: true });
    return result === "OK";
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async increment(key: string, amount = 1): Promise<number> {
    const value = await this.redis.incrby(key, amount);
    return Number(value ?? 0);
  }
}
