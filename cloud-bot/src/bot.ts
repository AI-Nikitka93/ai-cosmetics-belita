import { Bot, type Context } from "grammy";
import type { Update } from "grammy/types";

import { parseIntegerEnv, type Env } from "./env";
import { GroqClient } from "./adapters/llm/groq-client";
import { QdrantClientAdapter } from "./adapters/qdrant/qdrant-client";
import { TursoUserRepository } from "./adapters/turso/user-repository";
import { UpstashCacheStore } from "./adapters/upstash/cache-store";
import type { MemorySummary, ProductMatch, UserProfile } from "./types";

interface BotRuntime {
  bot: Bot<Context>;
  bootstrap: Promise<void>;
}

const runtimeCache = new Map<string, BotRuntime>();
const KNOWLEDGE_REFRESH_MESSAGE = "Извините, мои знания сейчас обновляются. Попробуйте спросить чуть позже.";

function normalizeConcernTokens(text: string): string[] {
  const normalized = text.toLowerCase();
  const concerns = new Set<string>();

  if (normalized.includes("акне") || normalized.includes("высып")) {
    concerns.add("acne_prone");
  }
  if (normalized.includes("чувств")) {
    concerns.add("sensitive");
  }
  if (normalized.includes("сух") || normalized.includes("обезвож")) {
    concerns.add("dry");
  }
  if (normalized.includes("барьер") || normalized.includes("раздраж")) {
    concerns.add("barrier");
  }
  if (normalized.includes("пигмент") || normalized.includes("пятн")) {
    concerns.add("pigment");
  }
  if (normalized.includes("возраст") || normalized.includes("морщ")) {
    concerns.add("anti_age");
  }

  return [...concerns];
}

function buildMemorySummary(profile: UserProfile | null, matches: ProductMatch[], userMessage: string): string {
  const topProducts = matches.slice(0, 2).map((product) => product.name).join(", ") || "пока без рекомендаций";
  return [
    `Последний запрос: ${userMessage}`,
    `Тип кожи: ${profile?.skinType ?? "не указан"}`,
    `Жалобы: ${profile?.concerns.join(", ") || "не указаны"}`,
    `Self-reported condition: ${profile?.selfReportedCondition ?? "не указано"}`,
    `Последние релевантные продукты: ${topProducts}`
  ].join(" | ");
}

async function createCacheKey(profile: UserProfile | null, messageText: string): Promise<string> {
  const encoder = new TextEncoder();
  const raw = JSON.stringify({
    messageText,
    skinType: profile?.skinType ?? null,
    concerns: profile?.concerns ?? [],
    avoidFragrance: profile?.avoidFragrance ?? false,
    preferGentle: profile?.preferGentle ?? true,
    selfReportedCondition: profile?.selfReportedCondition ?? null
  });
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `cache:reply:${hash.slice(0, 40)}`;
}

function buildSearchInput(profile: UserProfile | null, messageText: string, limit: number) {
  return {
    queryText: messageText,
    skinTypes: profile?.skinType ? [profile.skinType] : [],
    concerns: [...(profile?.concerns ?? []), ...normalizeConcernTokens(messageText)],
    excludeFragrance: profile?.avoidFragrance ?? /без\s+отдуш|fragrance free|без parfum/i.test(messageText),
    requireGentle:
      profile?.preferGentle ??
      /(чувств|экзем|псориаз|дерматит|розацеа|мягк|деликат)/i.test(messageText),
    limit
  };
}

function formatStartMessage(): string {
  return [
    "Привет! Я BELITA Skin Match.",
    "Помогаю подобрать косметику Belita/Vitex по составу, типу кожи и контексту запроса.",
    "",
    "Важно: я не врач и не ставлю диагнозы.",
    "Напишите свой запрос, например: `у меня чувствительная кожа и нужен мягкий крем без отдушек`."
  ].join("\n");
}

export function getBotRuntime(env: Env): BotRuntime {
  const cacheKey = [
    env.BOT_TOKEN,
    env.TURSO_URL,
    env.QDRANT_URL,
    env.UPSTASH_REDIS_REST_URL,
    env.GROQ_MODEL ?? "",
    env.OPENROUTER_MODEL ?? ""
  ].join("|");

  const existing = runtimeCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const userRepository = new TursoUserRepository(env);
  const cacheStore = new UpstashCacheStore(env);
  const qdrant = new QdrantClientAdapter(env);
  const llmClient = new GroqClient(env);
  const resultLimit = parseIntegerEnv(env.QDRANT_TOP_K, 4);

  const bot = new Bot<Context>(env.BOT_TOKEN);

  bot.catch((error) => {
    console.error("grammY update handling failed", error.error);
  });

  bot.command("start", async (ctx) => {
    try {
      console.log("Handling /start", {
        updateId: ctx.update.update_id,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id
      });
      const response = await ctx.reply(formatStartMessage());
      console.log("Handled /start successfully", {
        updateId: ctx.update.update_id,
        messageId: response.message_id
      });
    } catch (error) {
      console.error("Start handler reply failed", error);
      throw error;
    }
  });

  bot.on("message:text", async (ctx) => {
    const messageText = ctx.message.text.trim();
    if (!messageText) {
      await ctx.reply("Напишите, пожалуйста, запрос текстом: тип кожи, проблему или желаемый эффект.");
      return;
    }

    const telegramId = String(ctx.from?.id ?? ctx.chat.id);
    let profile: UserProfile | null = null;
    let memorySummary: MemorySummary | null = null;

    try {
      profile = await userRepository.createUserIfMissing({
        telegramId,
        firstName: ctx.from?.first_name ?? null,
        username: ctx.from?.username ?? null
      });
      memorySummary = await userRepository.getMemorySummary(telegramId);
    } catch (error) {
      console.error("Turso access failed, switching to stateless mode", error);
    }

    try {
      const cacheKeyForReply = await createCacheKey(profile, messageText);
      const cachedAnswer = await cacheStore.getJson<string>(cacheKeyForReply).catch(() => null);
      if (cachedAnswer) {
        await ctx.reply(cachedAnswer);
        return;
      }

      const searchInput = buildSearchInput(profile, messageText, resultLimit);
      let matches: ProductMatch[] = [];
      try {
        matches = await qdrant.searchProducts(searchInput);
      } catch (error) {
        console.error("Qdrant retrieval failed, continuing without RAG context", error);
      }

      const answer = await llmClient.generateAnswer({
        userMessage: messageText,
        userProfile: profile,
        memorySummary,
        productMatches: matches
      });

      await cacheStore
        .setJson(cacheKeyForReply, answer, parseIntegerEnv(env.CACHE_TTL_SECONDS, 300))
        .catch((error) => console.error("Upstash cache write failed", error));

      if (profile) {
        const summary = buildMemorySummary(profile, matches, messageText);
        await userRepository
          .saveMemorySummary(profile.userId, summary)
          .catch((error) => console.error("Turso memory summary save failed", error));
      }

      await ctx.reply(answer);
    } catch (error) {
      console.error("Knowledge or LLM flow failed", error);
      await ctx.reply(KNOWLEDGE_REFRESH_MESSAGE);
    }
  });

  const runtime: BotRuntime = {
    bot,
    bootstrap: Promise.all([
      userRepository.ensureSchema().catch((error) => {
        console.error("Turso bootstrap failed, bot will continue in degraded mode", error);
      }),
      bot.init().catch((error) => {
        console.error("grammY bot.init failed", error);
        throw error;
      })
    ]).then(() => undefined)
  };

  runtimeCache.set(cacheKey, runtime);
  return runtime;
}

export async function handleTelegramUpdate(env: Env, update: Update): Promise<void> {
  const runtime = getBotRuntime(env);
  await runtime.bootstrap;
  console.log("Received Telegram update", {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    messageText: update.message?.text ?? null
  });
  await runtime.bot.handleUpdate(update);
}
