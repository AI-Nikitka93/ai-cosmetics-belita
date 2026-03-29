import { createClient, type Client as LibsqlClient } from "@libsql/client";

import type { Env } from "../../env";
import type { MemorySummary, UserProfile } from "../../types";

const DEFAULT_MEMORY_SUMMARY = "Пользователь еще не заполнил профиль. Учитывай только текущее сообщение.";

const schemaPromises = new Map<string, Promise<void>>();

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(rawValue: unknown): string[] {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value));
    }
  } catch {
    return [];
  }

  return [];
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return String(value ?? "").trim() === "1";
}

export class TursoUserRepository {
  private readonly client: LibsqlClient;
  private readonly schemaKey: string;

  constructor(private readonly env: Env) {
    this.client = createClient({
      url: env.TURSO_URL,
      authToken: env.TURSO_TOKEN
    });
    this.schemaKey = env.TURSO_URL;
  }

  async ensureSchema(): Promise<void> {
    if (!schemaPromises.has(this.schemaKey)) {
      const schemaPromise = (async () => {
        try {
          await this.client.batch(
            [
              `
              CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT NOT NULL UNIQUE,
                first_name TEXT,
                username TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              )
              `,
              `
              CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                skin_type TEXT,
                concerns_json TEXT NOT NULL DEFAULT '[]',
                avoid_fragrance INTEGER NOT NULL DEFAULT 0,
                prefer_gentle INTEGER NOT NULL DEFAULT 1,
                self_reported_condition TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
              )
              `,
              `
              CREATE TABLE IF NOT EXISTS memory_summaries (
                user_id TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
              )
              `
            ],
            "write"
          );
        } catch (error) {
          schemaPromises.delete(this.schemaKey);
          console.error("Turso schema initialization failed", error);
          throw error;
        }
      })();

      schemaPromises.set(this.schemaKey, schemaPromise);
    }

    await schemaPromises.get(this.schemaKey);
  }

  async createUserIfMissing(input: {
    telegramId: string;
    firstName: string | null;
    username: string | null;
  }): Promise<UserProfile> {
    await this.ensureSchema();

    const userId = `tg:${input.telegramId}`;
    const timestamp = nowIso();

    await this.client.execute({
      sql: `
        INSERT INTO users (id, telegram_id, first_name, username, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
          first_name = excluded.first_name,
          username = excluded.username,
          updated_at = excluded.updated_at
      `,
      args: [userId, input.telegramId, input.firstName, input.username, timestamp, timestamp]
    });

    await this.client.execute({
      sql: `
        INSERT INTO user_profiles (user_id, updated_at)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `,
      args: [userId, timestamp]
    });

    await this.client.execute({
      sql: `
        INSERT INTO memory_summaries (user_id, summary, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `,
      args: [userId, DEFAULT_MEMORY_SUMMARY, timestamp]
    });

    const profile = await this.getProfile(input.telegramId);
    if (!profile) {
      throw new Error(`Failed to load profile after upsert for telegram user ${input.telegramId}`);
    }
    return profile;
  }

  async getProfile(telegramId: string): Promise<UserProfile | null> {
    await this.ensureSchema();

    const result = await this.client.execute({
      sql: `
        SELECT
          u.id,
          u.telegram_id,
          u.first_name,
          u.username,
          p.skin_type,
          p.concerns_json,
          p.avoid_fragrance,
          p.prefer_gentle,
          p.self_reported_condition
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.telegram_id = ?
        LIMIT 1
      `,
      args: [telegramId]
    });

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: String(row.id),
      telegramId: String(row.telegram_id),
      firstName: row.first_name ? String(row.first_name) : null,
      username: row.username ? String(row.username) : null,
      skinType: row.skin_type ? String(row.skin_type) : null,
      concerns: parseJsonArray(row.concerns_json),
      avoidFragrance: toBoolean(row.avoid_fragrance),
      preferGentle: toBoolean(row.prefer_gentle),
      selfReportedCondition: row.self_reported_condition ? String(row.self_reported_condition) : null
    };
  }

  async getMemorySummary(telegramId: string): Promise<MemorySummary | null> {
    await this.ensureSchema();

    const result = await this.client.execute({
      sql: `
        SELECT
          u.id AS user_id,
          m.summary,
          m.updated_at
        FROM users u
        LEFT JOIN memory_summaries m ON m.user_id = u.id
        WHERE u.telegram_id = ?
        LIMIT 1
      `,
      args: [telegramId]
    });

    const row = result.rows[0];
    if (!row || !row.summary) {
      return null;
    }

    return {
      userId: String(row.user_id),
      summary: String(row.summary),
      updatedAt: String(row.updated_at ?? nowIso())
    };
  }

  async saveMemorySummary(userId: string, summary: string): Promise<void> {
    await this.ensureSchema();

    await this.client.execute({
      sql: `
        INSERT INTO memory_summaries (user_id, summary, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          summary = excluded.summary,
          updated_at = excluded.updated_at
      `,
      args: [userId, summary, nowIso()]
    });
  }
}
