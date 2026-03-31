import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
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
  cacheStore: UpstashCacheStore;
}

interface TelegramBotCommand {
  command: string;
  description: string;
}

interface QuestionnaireDraft {
  skinType: string | null;
  concerns: string[];
  avoidFragrance: boolean | null;
  preferGentle: boolean | null;
}

type QuestionnaireStep = "skinType" | "concern" | "fragrance" | "gentle";

interface QuestionnaireSession {
  step: QuestionnaireStep;
  draft: QuestionnaireDraft;
  startedAt: string;
}

interface Option {
  label: string;
  value: string;
}

interface RecommendationSession {
  queryText: string;
  products: ProductMatch[];
  mode: "catalog" | "compare" | "answer";
  createdAt: string;
}

type RecommendationSessionMode = RecommendationSession["mode"];

type BotMetricName =
  | "unsafe_intent_blocked"
  | "empty_result"
  | "followup_links_miss"
  | "followup_compare_miss"
  | "qdrant_retrieval_failure"
  | "knowledge_failure"
  | "telegram_update_failure"
  | "feedback_helpful"
  | "feedback_not_relevant"
  | "feedback_more_requested";

const BOT_METRIC_NAMES: BotMetricName[] = [
  "unsafe_intent_blocked",
  "empty_result",
  "followup_links_miss",
  "followup_compare_miss",
  "qdrant_retrieval_failure",
  "knowledge_failure",
  "telegram_update_failure",
  "feedback_helpful",
  "feedback_not_relevant",
  "feedback_more_requested"
];

const runtimeCache = new Map<string, BotRuntime>();
const KNOWLEDGE_REFRESH_MESSAGE = "Извините, мои знания сейчас обновляются. Попробуйте спросить чуть позже.";
const QUESTIONNAIRE_TTL_SECONDS = 60 * 60;
const RECOMMENDATION_TTL_SECONDS = 60 * 60;
const RESPONSE_CACHE_VERSION = "2026-04-01-domain-v35";

const MENU_HOME = "Главное меню";
const MENU_PICK_CARE = "Подобрать уход";
const MENU_ASK_PRODUCT = "Спросить про продукт";
const MENU_SHOW_PROFILE = "Мой профиль";
const MENU_RESET_PROFILE = "Стереть профиль";
const CANCEL_LABEL = "Отмена";
const YES_LABEL = "Да";
const NO_LABEL = "Нет";
const FEEDBACK_HELPFUL_LABEL = "Подошло";
const FEEDBACK_NOT_RELEVANT_LABEL = "Не по теме";
const FEEDBACK_MORE_LABEL = "Еще варианты";
const FEEDBACK_HELPFUL = "feedback:helpful";
const FEEDBACK_NOT_RELEVANT = "feedback:not_relevant";
const FEEDBACK_MORE = "feedback:more";

const BOT_COMMANDS: TelegramBotCommand[] = [
  { command: "start", description: "Открыть главное меню" },
  { command: "quiz", description: "Пройти короткий опрос" },
  { command: "profile", description: "Показать профиль кожи" },
  { command: "reset", description: "Стереть профиль и память" }
];

const SKIN_TYPE_OPTIONS: Option[] = [
  { label: "Сухая", value: "dry" },
  { label: "Нормальная", value: "normal" },
  { label: "Комбинированная", value: "combination" },
  { label: "Жирная", value: "oily" },
  { label: "Чувствительная", value: "sensitive" },
  { label: "Не уверена", value: "unknown" }
];

const CONCERN_OPTIONS: Option[] = [
  { label: "Увлажнение", value: "dryness" },
  { label: "Высыпания", value: "breakouts" },
  { label: "Восстановление барьера", value: "barrier_support" },
  { label: "Пигментация", value: "pigmentation" },
  { label: "Анти-эйдж", value: "anti_age" },
  { label: "Очищение", value: "cleansing" }
];

function createKeyboard(rows: string[][]): Keyboard {
  const keyboard = new Keyboard();
  rows.forEach((row, index) => {
    for (const item of row) {
      keyboard.text(item);
    }
    if (index < rows.length - 1) {
      keyboard.row();
    }
  });
  return keyboard.resized();
}

function createMainMenuKeyboard(): Keyboard {
  return createKeyboard([
    [MENU_HOME, MENU_PICK_CARE],
    [MENU_SHOW_PROFILE, MENU_ASK_PRODUCT],
    [MENU_RESET_PROFILE]
  ]);
}

function createQuestionKeyboard(options: Option[]): Keyboard {
  const rows = options.map((option) => [option.label]);
  rows.push([CANCEL_LABEL]);
  return createKeyboard(rows);
}

function createBooleanKeyboard(): Keyboard {
  return createKeyboard([[YES_LABEL, NO_LABEL], [CANCEL_LABEL]]);
}

function createRecommendationFeedbackKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(FEEDBACK_HELPFUL_LABEL, FEEDBACK_HELPFUL)
    .text(FEEDBACK_NOT_RELEVANT_LABEL, FEEDBACK_NOT_RELEVANT)
    .row()
    .text(FEEDBACK_MORE_LABEL, FEEDBACK_MORE);
}

function findOptionValue(options: Option[], label: string): string | null {
  const normalized = label.trim().toLowerCase();
  const match = options.find((option) => option.label.toLowerCase() === normalized);
  return match?.value ?? null;
}

function formatSkinType(value: string | null): string {
  switch (value) {
    case "dry":
      return "сухая";
    case "normal":
      return "нормальная";
    case "combination":
      return "комбинированная";
    case "oily":
      return "жирная";
    case "sensitive":
      return "чувствительная";
    case "unknown":
      return "не уверена";
    default:
      return "не указан";
  }
}

function formatConcern(value: string): string {
  switch (value) {
    case "dryness":
      return "увлажнение";
    case "breakouts":
      return "высыпания";
    case "barrier_support":
      return "восстановление барьера";
    case "pigmentation":
      return "пигментация";
    case "anti_age":
      return "anti-age";
    case "cleansing":
      return "очищение";
    case "targeted_treatment":
      return "точечный уход";
    default:
      return value;
  }
}

function formatConcernList(values: string[]): string {
  if (values.length === 0) {
    return "не указаны";
  }
  return values.map(formatConcern).join(", ");
}

function hasMeaningfulProfile(profile: UserProfile | null): profile is UserProfile {
  if (!profile) {
    return false;
  }
  return Boolean(
    profile.skinType ||
      profile.concerns.length > 0 ||
      profile.avoidFragrance ||
      profile.selfReportedCondition ||
      profile.preferGentle === false
  );
}

function normalizeConcernTokens(text: string): string[] {
  const normalized = text.toLowerCase();
  const concerns = new Set<string>();

  if (/(акне|высып|прыщ|черн)/.test(normalized)) {
    concerns.add("breakouts");
  }
  if (/(чувств|барьер|раздраж|покрас|дермат|розаце|экзем|псориаз)/.test(normalized)) {
    concerns.add("barrier_support");
  }
  if (/(сух|обезвож|стянут|увлаж)/.test(normalized)) {
    concerns.add("dryness");
  }
  if (/(пигмент|пятн|постакне|тон)/.test(normalized)) {
    concerns.add("pigmentation");
  }
  if (/(возраст|морщ|anti-age|лифт)/.test(normalized)) {
    concerns.add("anti_age");
  }
  if (/(очищ|умыва|пенк|гель)/.test(normalized)) {
    concerns.add("cleansing");
  }
  if (/(сыворот|точеч|серум|актив)/.test(normalized)) {
    concerns.add("targeted_treatment");
  }

  return [...concerns];
}

function buildMemorySummary(profile: UserProfile | null, matches: ProductMatch[], userMessage: string): string {
  const topProducts = matches.slice(0, 2).map((product) => product.name).join(", ") || "пока без рекомендаций";
  return [
    `Последний запрос: ${userMessage}`,
    `Тип кожи: ${formatSkinType(profile?.skinType ?? null)}`,
    `Жалобы: ${formatConcernList(profile?.concerns ?? [])}`,
    `Self-reported condition: ${profile?.selfReportedCondition ?? "не указано"}`,
    `Последние релевантные продукты: ${topProducts}`
  ].join(" | ");
}

function extractLastQueryFromMemorySummary(memorySummary: MemorySummary | null): string | null {
  const summary = memorySummary?.summary;
  if (!summary) {
    return null;
  }

  const match = summary.match(/Последний запрос:\s*([^|]+)/i);
  return match?.[1]?.trim() ?? null;
}

async function createCacheKey(profile: UserProfile | null, messageText: string): Promise<string> {
  const activeProfile = hasMeaningfulProfile(profile) ? profile : null;
  const encoder = new TextEncoder();
  const raw = JSON.stringify({
    version: RESPONSE_CACHE_VERSION,
    messageText,
    skinType: activeProfile?.skinType ?? null,
    concerns: activeProfile?.concerns ?? [],
    avoidFragrance: activeProfile?.avoidFragrance ?? false,
    preferGentle: activeProfile?.preferGentle ?? false,
    selfReportedCondition: activeProfile?.selfReportedCondition ?? null
  });
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `cache:reply:${hash.slice(0, 40)}`;
}

function buildSearchInput(profile: UserProfile | null, messageText: string, limit: number) {
  const activeProfile = hasMeaningfulProfile(profile) ? profile : null;
  return {
    queryText: messageText,
    skinTypes:
      activeProfile?.skinType && !["unknown", "normal"].includes(activeProfile.skinType) ? [activeProfile.skinType] : [],
    concerns: [...(activeProfile?.concerns ?? []), ...normalizeConcernTokens(messageText)],
    excludeFragrance: activeProfile?.avoidFragrance ?? /без\s+отдуш|fragrance free|без parfum/i.test(messageText),
    requireGentle:
      activeProfile?.preferGentle ?? /(чувств|экзем|псориаз|дерматит|розацеа|мягк|деликат)/i.test(messageText),
    limit
  };
}

function getRequestedProductCount(text: string): number {
  const normalized = normalizeForIntent(text);
  if (/(весь список|всю линейк|все варианты|полный список|таблиц)/i.test(normalized)) {
    return 15;
  }
  const numericMatch = normalized.match(/(?:топ|список|напиши|подбери|покажи|дай)\s+(\d{1,2})/i);
  if (numericMatch) {
    return Math.max(1, Math.min(Number.parseInt(numericMatch[1] ?? "3", 10), 15));
  }
  if (/(10\s+баль|оценк.*10|рейтинг)/i.test(normalized)) {
    return 10;
  }
  if (
    isCatalogWideIntent(text) ||
    isGenericHairListIntent(text) ||
    isGenericBodyListIntent(text) ||
    isGenericFeetListIntent(text)
  ) {
    return 6;
  }
  return 3;
}

function isCatalogWideIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /((что|какие).*(есть|у belita)|вся линейк|вся база|список|топ|напиши\s+\d+|подбери\s+\d+|покажи\s+\d+|оценк|рейтинг)/i.test(
    normalized
  );
}

function shouldUseStoredProfile(messageText: string): boolean {
  if (isCompareIntent(messageText)) {
    return false;
  }
  return !isCatalogWideIntent(messageText);
}

function needsBroadCatalogScan(text: string): boolean {
  return (
    isCatalogWideIntent(text) ||
    isGenericHairListIntent(text) ||
    isGenericBodyListIntent(text) ||
    isGenericFeetListIntent(text)
  );
}

function isCompareIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /^(сравни|сравнение)/i.test(normalized) && /\sи\s/.test(normalized);
}

function extractCompareSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(?:сравни|сравнение)\s+(.+?)(?:\s+для\s+.+)?$/i);
  const source = match?.[1] ?? normalized;
  return source
    .split(/\s+и\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .slice(0, 2);
}

function isContinuationRequest(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /^(напиши|нпаиши|покажи|дай|сделай|выведи)/i.test(normalized) || /(весь список|полный список|таблиц|кратко|коротко|еще варианты|ещё варианты)/i.test(normalized);
}

function hasConcreteProductContext(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(belita|витекс|белит|крем|сыворот|тоник|маск|умывал|спрей|ног|лиц|волос|рук|тело|пигмент|барьер|сух|чувств|акне|высып|spf|спф)/i.test(
    normalized
  );
}

function resolveSearchMessage(messageText: string, memorySummary: MemorySummary | null): string {
  if (hasConcreteProductContext(messageText)) {
    return messageText;
  }

  if (!isContinuationRequest(messageText)) {
    return messageText;
  }

  const lastQuery = extractLastQueryFromMemorySummary(memorySummary);
  if (!lastQuery) {
    return messageText;
  }

  return `${lastQuery}\n${messageText}`;
}

function formatStartMessage(): string {
  return [
    "Привет! Я BELITA Skin Match.",
    "Помогаю подобрать косметику Belita/Vitex по составу, типу кожи и контексту запроса.",
    "",
    "Важно: я не врач и не ставлю диагнозы.",
    "Можно сразу написать вопрос про продукт или пройти короткий профиль, чтобы подбор был точнее."
  ].join("\n");
}

function questionnaireSessionKey(telegramId: string): string {
  return `session:questionnaire:${telegramId}`;
}

function recommendationSessionKey(telegramId: string): string {
  return `session:recommendation:${telegramId}`;
}

function recommendationSessionModeKey(telegramId: string, mode: RecommendationSessionMode): string {
  return `session:recommendation:${mode}:${telegramId}`;
}

function processedUpdateKey(updateId: number): string {
  return `telegram:update:${updateId}`;
}

function extractUpdateChatId(update: Update): number | null {
  if (update.message?.chat?.id) {
    return update.message.chat.id;
  }
  if (update.callback_query?.message?.chat?.id) {
    return update.callback_query.message.chat.id;
  }
  if (update.edited_message?.chat?.id) {
    return update.edited_message.chat.id;
  }
  return null;
}

function extractUpdateSummary(update: Update): Record<string, unknown> {
  return {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    hasCallbackQuery: Boolean(update.callback_query),
    messageText: update.message?.text ?? null,
    callbackData: update.callback_query?.data ?? null,
    chatId: extractUpdateChatId(update)
  };
}

function metricKey(name: BotMetricName, bucket: "total" | "daily"): string {
  if (bucket === "daily") {
    const date = new Date().toISOString().slice(0, 10);
    return `metrics:bot:${date}:${name}`;
  }
  return `metrics:bot:total:${name}`;
}

function getMetricLabel(name: BotMetricName): string {
  switch (name) {
    case "unsafe_intent_blocked":
      return "unsafe intent blocked";
    case "empty_result":
      return "empty result";
    case "followup_links_miss":
      return "follow-up links miss";
    case "followup_compare_miss":
      return "follow-up compare miss";
    case "qdrant_retrieval_failure":
      return "qdrant retrieval failure";
    case "knowledge_failure":
      return "knowledge failure";
    case "telegram_update_failure":
      return "telegram update failure";
    case "feedback_helpful":
      return "feedback helpful";
    case "feedback_not_relevant":
      return "feedback not relevant";
    case "feedback_more_requested":
      return "feedback more requested";
  }
}

function isAdminContext(env: Env, ctx: Context): boolean {
  const adminId = env.ADMIN_CHAT_ID?.trim();
  if (!adminId) {
    return false;
  }

  const chatId = String(ctx.chat?.id ?? "");
  const fromId = String(ctx.from?.id ?? "");
  return chatId === adminId || fromId === adminId;
}

async function buildMetricsReply(cacheStore: UpstashCacheStore): Promise<string> {
  const rows = await Promise.all(
    BOT_METRIC_NAMES.map(async (name) => {
      const [daily, total] = await Promise.all([
        cacheStore.getJson<number>(metricKey(name, "daily")).catch(() => 0),
        cacheStore.getJson<number>(metricKey(name, "total")).catch(() => 0)
      ]);
      return {
        name,
        daily: Number(daily ?? 0),
        total: Number(total ?? 0)
      };
    })
  );

  const lines = rows.map((row) => `- ${getMetricLabel(row.name)}: today ${row.daily}, total ${row.total}`);
  return [
    "Bot quality metrics:",
    ...lines
  ].join("\n");
}

async function recordBotMetric(
  cacheStore: UpstashCacheStore,
  name: BotMetricName,
  context: Record<string, unknown> = {}
): Promise<void> {
  console.log("bot_metric", {
    name,
    ...context
  });

  await Promise.all([
    cacheStore.increment(metricKey(name, "total")).catch((error) => {
      console.error("Metric total increment failed", error);
    }),
    cacheStore.increment(metricKey(name, "daily")).catch((error) => {
      console.error("Metric daily increment failed", error);
    })
  ]);
}

async function sendUpdateFailureFallback(bot: Bot<Context>, update: Update): Promise<void> {
  const chatId = extractUpdateChatId(update);
  if (!chatId) {
    return;
  }

  await bot.api.sendMessage(
    chatId,
    "Сейчас на моей стороне был краткий сбой. Попробуйте повторить запрос еще раз через несколько секунд.",
    {
      reply_markup: createMainMenuKeyboard()
    }
  );
}

async function saveFeedbackEvent(
  cacheStore: UpstashCacheStore,
  telegramId: string,
  feedbackType: "helpful" | "not_relevant" | "more",
  session: RecommendationSession | null
): Promise<void> {
  const key = `feedback:event:${telegramId}:${Date.now()}`;
  await cacheStore.setJson(
    key,
    {
      telegramId,
      feedbackType,
      createdAt: new Date().toISOString(),
      queryText: session?.queryText ?? null,
      mode: session?.mode ?? null,
      productIds: session?.products.map((product) => product.id) ?? [],
      productNames: session?.products.map((product) => product.name) ?? []
    },
    60 * 60 * 24 * 30
  );
}

async function handleFeedbackSignal(
  ctx: Context,
  cacheStore: UpstashCacheStore,
  telegramId: string,
  feedbackType: "helpful" | "not_relevant" | "more",
  session: RecommendationSession | null
): Promise<void> {
  const metricName: BotMetricName =
    feedbackType === "helpful"
      ? "feedback_helpful"
      : feedbackType === "not_relevant"
        ? "feedback_not_relevant"
        : "feedback_more_requested";

  await recordBotMetric(cacheStore, metricName, {
    telegramId,
    queryText: session?.queryText ?? null,
    mode: session?.mode ?? null
  }).catch((error) => console.error("Metric write failed", error));

  await saveFeedbackEvent(cacheStore, telegramId, feedbackType, session).catch((error) =>
    console.error("Feedback event save failed", error)
  );

  await ctx.reply(buildFeedbackReply(feedbackType, session), {
    reply_markup: createMainMenuKeyboard()
  });
}

function createQuestionnaireDraft(profile: UserProfile | null): QuestionnaireDraft {
  return {
    skinType: profile?.skinType ?? null,
    concerns: profile?.concerns ?? [],
    avoidFragrance: profile?.avoidFragrance ?? null,
    preferGentle: hasMeaningfulProfile(profile) ? profile.preferGentle : null
  };
}

function formatQuestionPrompt(step: QuestionnaireStep): { text: string; keyboard: Keyboard } {
  switch (step) {
    case "skinType":
      return {
        text: "1/4 Какой у вас тип кожи?",
        keyboard: createQuestionKeyboard(SKIN_TYPE_OPTIONS)
      };
    case "concern":
      return {
        text: "2/4 Какая сейчас главная задача ухода?",
        keyboard: createQuestionKeyboard(CONCERN_OPTIONS)
      };
    case "fragrance":
      return {
        text: "3/4 Хотите исключить продукты с отдушкой, если это возможно?",
        keyboard: createBooleanKeyboard()
      };
    case "gentle":
      return {
        text: "4/4 Нужен максимально деликатный уход?",
        keyboard: createBooleanKeyboard()
      };
  }
}

function formatProfileSummary(profile: UserProfile | QuestionnaireDraft | null): string {
  if (!profile) {
    return "Профиль пока пуст. Нажмите «Подобрать уход», и я задам 4 коротких вопроса.";
  }

  const skinType = formatSkinType(profile.skinType ?? null);
  const concerns = formatConcernList(profile.concerns ?? []);
  const fragrance = profile.avoidFragrance === true ? "без отдушек по возможности" : "отдушка допустима";
  const gentle = profile.preferGentle === true ? "деликатный уход в приоритете" : "без жесткого ограничения на мягкость";

  return [
    `Тип кожи: ${skinType}`,
    `Главная задача: ${concerns}`,
    `Ограничения: ${fragrance}`,
    `Стратегия: ${gentle}`
  ].join("\n");
}

async function startQuestionnaire(
  ctx: Context,
  cacheStore: UpstashCacheStore,
  telegramId: string,
  profile: UserProfile | null
): Promise<void> {
  const session: QuestionnaireSession = {
    step: "skinType",
    draft: createQuestionnaireDraft(profile),
    startedAt: new Date().toISOString()
  };

  await cacheStore.setJson(questionnaireSessionKey(telegramId), session, QUESTIONNAIRE_TTL_SECONDS);

  const prompt = formatQuestionPrompt(session.step);
  await ctx.reply(
    [
      "Сделаем короткий профиль для более точного подбора.",
      "Всего 4 вопроса, потом сразу сможем перейти к рекомендациям."
    ].join("\n"),
    { reply_markup: prompt.keyboard }
  );
  await ctx.reply(prompt.text, { reply_markup: prompt.keyboard });
}

async function showProfile(ctx: Context, profile: UserProfile | null): Promise<void> {
  if (!hasMeaningfulProfile(profile)) {
    await ctx.reply("Профиль пока не заполнен. Нажмите «Подобрать уход», и я соберу базовый контекст.", {
      reply_markup: createMainMenuKeyboard()
    });
    return;
  }

  await ctx.reply(`Ваш текущий профиль:\n${formatProfileSummary(profile)}`, {
    reply_markup: createMainMenuKeyboard()
  });
}

async function resetProfileData(
  ctx: Context,
  telegramId: string,
  profile: UserProfile | null,
  userRepository: TursoUserRepository,
  cacheStore: UpstashCacheStore
): Promise<void> {
  if (!profile) {
    await ctx.reply("Профиль уже пуст. Можете заново пройти подбор, когда захотите.", {
      reply_markup: createMainMenuKeyboard()
    });
    return;
  }

  await userRepository.resetProfile(profile.userId);
  await clearQuestionnaire(cacheStore, telegramId);
  await Promise.all([
    cacheStore.delete(recommendationSessionKey(telegramId)),
    cacheStore.delete(recommendationSessionModeKey(telegramId, "catalog")),
    cacheStore.delete(recommendationSessionModeKey(telegramId, "compare")),
    cacheStore.delete(recommendationSessionModeKey(telegramId, "answer"))
  ]);

  await ctx.reply(
    [
      "Данные о коже и сохраненные предпочтения удалены.",
      "Если захотите, можно заново пройти короткий опрос через «Подобрать уход»."
    ].join("\n"),
    { reply_markup: createMainMenuKeyboard() }
  );
}

async function saveRecommendationSession(
  cacheStore: UpstashCacheStore,
  telegramId: string,
  queryText: string,
  products: ProductMatch[],
  mode: RecommendationSessionMode
): Promise<void> {
  const session: RecommendationSession = {
    queryText,
    products,
    mode,
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    cacheStore.setJson(recommendationSessionKey(telegramId), session, RECOMMENDATION_TTL_SECONDS),
    cacheStore.setJson(recommendationSessionModeKey(telegramId, mode), session, RECOMMENDATION_TTL_SECONDS)
  ]);
}

async function getRecommendationSession(
  cacheStore: UpstashCacheStore,
  telegramId: string,
  preferredModes: RecommendationSessionMode[]
): Promise<RecommendationSession | null> {
  const keys = [
    ...preferredModes.map((mode) => recommendationSessionModeKey(telegramId, mode)),
    recommendationSessionKey(telegramId)
  ];

  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const session = await cacheStore.getJson<RecommendationSession>(key);
    if (session) {
      return session;
    }
  }
  return null;
}

async function clearQuestionnaire(cacheStore: UpstashCacheStore, telegramId: string): Promise<void> {
  await cacheStore.delete(questionnaireSessionKey(telegramId));
}

async function saveQuestionnaireSession(
  cacheStore: UpstashCacheStore,
  telegramId: string,
  session: QuestionnaireSession
): Promise<void> {
  await cacheStore.setJson(questionnaireSessionKey(telegramId), session, QUESTIONNAIRE_TTL_SECONDS);
}

async function completeQuestionnaire(
  ctx: Context,
  telegramId: string,
  session: QuestionnaireSession,
  profile: UserProfile | null,
  userRepository: TursoUserRepository,
  cacheStore: UpstashCacheStore
): Promise<void> {
  if (!profile) {
    throw new Error(`Cannot complete questionnaire without user profile for telegramId ${telegramId}`);
  }

  const finalProfile = {
    skinType: session.draft.skinType,
    concerns: session.draft.concerns,
    avoidFragrance: session.draft.avoidFragrance ?? false,
    preferGentle: session.draft.preferGentle ?? false,
    selfReportedCondition: profile.selfReportedCondition
  };

  await userRepository.saveProfile(profile.userId, finalProfile);
  await userRepository.saveMemorySummary(
    profile.userId,
    [
      "Профиль обновлен через опросник",
      `Тип кожи: ${formatSkinType(finalProfile.skinType)}`,
      `Главная задача: ${formatConcernList(finalProfile.concerns)}`
    ].join(" | ")
  );
  await clearQuestionnaire(cacheStore, telegramId);

  await ctx.reply(
    [
      "Профиль сохранен.",
      formatProfileSummary(finalProfile),
      "",
      "Теперь можете написать запрос в свободной форме, например:",
      "`нужен мягкий крем для сухой чувствительной кожи без отдушек`"
    ].join("\n"),
    { reply_markup: createMainMenuKeyboard(), parse_mode: "Markdown" }
  );
}

async function handleQuestionnaireAnswer(
  ctx: Context,
  messageText: string,
  telegramId: string,
  session: QuestionnaireSession,
  profile: UserProfile | null,
  userRepository: TursoUserRepository,
  cacheStore: UpstashCacheStore
): Promise<boolean> {
  if (messageText === CANCEL_LABEL) {
    await clearQuestionnaire(cacheStore, telegramId);
    await ctx.reply("Опросник остановлен. Можете вернуться к нему в любой момент.", {
      reply_markup: createMainMenuKeyboard()
    });
    return true;
  }

  if (session.step === "skinType") {
    const skinType = findOptionValue(SKIN_TYPE_OPTIONS, messageText);
    if (!skinType) {
      const prompt = formatQuestionPrompt("skinType");
      await ctx.reply("Пожалуйста, выберите тип кожи кнопкой ниже.", { reply_markup: prompt.keyboard });
      return true;
    }

    session.draft.skinType = skinType;
    session.step = "concern";
    await saveQuestionnaireSession(cacheStore, telegramId, session);
    const prompt = formatQuestionPrompt(session.step);
    await ctx.reply(prompt.text, { reply_markup: prompt.keyboard });
    return true;
  }

  if (session.step === "concern") {
    const concern = findOptionValue(CONCERN_OPTIONS, messageText);
    if (!concern) {
      const prompt = formatQuestionPrompt("concern");
      await ctx.reply("Выберите, пожалуйста, одну основную задачу ухода кнопкой ниже.", {
        reply_markup: prompt.keyboard
      });
      return true;
    }

    session.draft.concerns = [concern];
    session.step = "fragrance";
    await saveQuestionnaireSession(cacheStore, telegramId, session);
    const prompt = formatQuestionPrompt(session.step);
    await ctx.reply(prompt.text, { reply_markup: prompt.keyboard });
    return true;
  }

  if (session.step === "fragrance") {
    if (messageText !== YES_LABEL && messageText !== NO_LABEL) {
      const prompt = formatQuestionPrompt("fragrance");
      await ctx.reply("Здесь лучше выбрать «Да» или «Нет».", { reply_markup: prompt.keyboard });
      return true;
    }

    session.draft.avoidFragrance = messageText === YES_LABEL;
    session.step = "gentle";
    await saveQuestionnaireSession(cacheStore, telegramId, session);
    const prompt = formatQuestionPrompt(session.step);
    await ctx.reply(prompt.text, { reply_markup: prompt.keyboard });
    return true;
  }

  if (messageText !== YES_LABEL && messageText !== NO_LABEL) {
    const prompt = formatQuestionPrompt("gentle");
    await ctx.reply("Нужно выбрать «Да» или «Нет».", { reply_markup: prompt.keyboard });
    return true;
  }

  session.draft.preferGentle = messageText === YES_LABEL;
  await completeQuestionnaire(ctx, telegramId, session, profile, userRepository, cacheStore);
  return true;
}

function buildProductHelpMessage(): string {
  return [
    "Напишите, какой продукт или тип ухода вас интересует.",
    "Чем подробнее запрос, тем точнее подбор.",
    "",
    "Примеры:",
    "- `нужен мягкий крем для сухой кожи`",
    "- `подбери умывалку для кожи с высыпаниями`",
    "- `что взять у Belita для пигментации`"
  ].join("\n");
}

function isIntimateZoneQuery(text: string): boolean {
  return /(анал|анус|жоп|задниц|поп|промежност|периан|интим)/i.test(text);
}

function hasMedicalRedFlags(text: string): boolean {
  return /(зуд|горит|жжет|жжение|боль|болит|кров|трещ|выдел|воспал|отек|сып|инфекц)/i.test(text);
}

function buildIntimateMedicalBoundaryReply(): string {
  return [
    "Я не могу подбирать косметику Belita/Vitex для анальной или интимной зоны и не могу советовать, чем мазать при зуде, жжении или боли.",
    "Это уже не безопасный косметический сценарий и здесь лучше не экспериментировать с случайными средствами.",
    "",
    "Что лучше сделать:",
    "1. обратиться к проктологу, дерматологу или врачу общей практики;",
    "2. не наносить на эту зону маски, пилинги, кремы для лица или другие неспециализированные средства;",
    "3. если есть сильная боль, кровь, трещины, выраженное жжение или ухудшение, не откладывать очную консультацию.",
    "",
    "Я могу помочь только с подбором Belita/Vitex для лица, тела, рук, ног или волос."
  ].join("\n");
}

function normalizeForIntent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productSearchText(product: ProductMatch): string {
  return normalizeForIntent([product.name, product.category ?? "", product.purpose ?? "", product.line ?? ""].join(" "));
}

function productPrimaryText(product: ProductMatch): string {
  return normalizeForIntent([product.name, product.purpose ?? "", product.line ?? ""].join(" "));
}

function isCleanserIntent(text: string): boolean {
  return /(умывал|очищ|пенк|мицел|демаки|гидрофил|молочко)/.test(normalizeForIntent(text));
}

function isCreamIntent(text: string): boolean {
  return /(крем)/.test(normalizeForIntent(text));
}

function isMakeupIntent(text: string): boolean {
  return /(тональ|bb крем|bb|вв крем|вв|cc крем|cc|консил|пудр|румян|макияж|покрытие|кушон)/.test(normalizeForIntent(text));
}

function isCleanserProduct(product: ProductMatch): boolean {
  return /(очищ|умыван|пенк|мицел|демаки|гидрофил|молочко)/.test(productSearchText(product));
}

function isCreamProduct(product: ProductMatch): boolean {
  return /(крем)/.test(productSearchText(product));
}

function isDecorativeFaceProduct(product: ProductMatch): boolean {
  return /(тональ|bb крем|bb |вв крем|вв |cc крем|cc |dd крем|dd |dd-крем|ee крем|ee |ee-крем|ее крем|ее |ее-крем|консил|пудр|румян|кушон|макияж)/.test(productPrimaryText(product));
}

function isStrictCreamProduct(product: ProductMatch): boolean {
  return /(крем|cream)/.test(productPrimaryText(product)) && !isDecorativeFaceProduct(product);
}

function isSprayProduct(product: ProductMatch): boolean {
  return /(спрей|мист)/.test(productPrimaryText(product));
}

function isEyeAreaProduct(product: ProductMatch): boolean {
  return /(вокруг глаз|кожи вокруг глаз|для глаз|\bвек\b|и век|eye)/.test(productPrimaryText(product));
}

function isHighlightProduct(product: ProductMatch): boolean {
  return /(хайлайтер|highlighter|сияние|glow)/.test(productPrimaryText(product));
}

function isBlemishProduct(product: ProductMatch): boolean {
  return /(несовершен|blemish|problem|матов|поры|пор)/.test(productPrimaryText(product));
}

function isGenericHairListIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(что|какие).*(для волос|по волосам)|для волос есть|по волосам есть/.test(normalized);
}

function isGenericBodyListIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(что|какие).*(для тела|по телу)|для тела есть|по телу есть/.test(normalized);
}

function isGenericFeetListIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(что|какие).*(для ног|для стоп)|для ног есть|для стоп есть/.test(normalized);
}

function isHairColoringIntent(text: string): boolean {
  return /(краск|осветл|блонд|окраш|тонир)/.test(normalizeForIntent(text));
}

function isHairCareProduct(product: ProductMatch): boolean {
  return /(волос|шампун|бальзам|кондиционер|маска для волос|спрей для волос|сыворотка для волос|масло для волос|уход за волосами)/.test(
    productSearchText(product)
  );
}

function isHairColoringProduct(product: ProductMatch): boolean {
  return /(краск|осветляющ|blond|оттеноч)/.test(productSearchText(product));
}

function isHairWashProduct(product: ProductMatch): boolean {
  return /(шампун)/.test(productSearchText(product));
}

function isHairLeaveInProduct(product: ProductMatch): boolean {
  return /(спрей|сыворот|филлер|несмыва|leave in)/.test(productSearchText(product));
}

function isHairOilProduct(product: ProductMatch): boolean {
  return /(масло)/.test(productSearchText(product));
}

function isBodyCareProduct(product: ProductMatch): boolean {
  return /(тел[ао]|телу|гель для душа|лосьон|баттер|скраб|масло для тел|крем для тел|дезодорант|бальзам крем|бальзам-крем|после бани|для лица и тел|молочко для тел)/.test(
    productSearchText(product)
  );
}

function isBodyFragranceProduct(product: ProductMatch): boolean {
  return /(мист|парфюм|шиммер)/.test(productSearchText(product));
}

function isDecorativeBodyProduct(product: ProductMatch): boolean {
  return /(шиммер|золотым блеском|блеск|автобронзант|sparkle|glitter)/.test(productSearchText(product));
}

function isBodyWashProduct(product: ProductMatch): boolean {
  return /(гель для душа|масло для душа|пена для душа|крем очищающий для тел)/.test(productSearchText(product));
}

function isBodyCreamProduct(product: ProductMatch): boolean {
  return /(баттер|лосьон|крем для тел|бальзам крем|бальзам-крем|молочко для тел|для лица и тел|гель уход 7 в 1)/.test(
    productSearchText(product)
  );
}

function isBodyOilProduct(product: ProductMatch): boolean {
  return /(масло для тел|арома масло|сухое масло.*тел|масло увлажняющее.*тел)/.test(productSearchText(product));
}

function isBodyScrubProduct(product: ProductMatch): boolean {
  return /(скраб|пилинг для тела|salt scrub)/.test(productSearchText(product));
}

function isFeetCareProduct(product: ProductMatch): boolean {
  return /(ног|стоп|пятк|мозол|обув)/.test(productSearchText(product));
}

function isNailProduct(product: ProductMatch): boolean {
  return /(ногтей|кутикул|лак|снятия лака)/.test(productSearchText(product));
}

function hasAgeSpecificIntent(text: string): boolean {
  return /(anti age|анти эйдж|анти-эйдж|морщ|омолож|лифт|упруг|\b(?:25|30|35|40|45|50|55|60|65)\b(?=\s*(?:для|днев|ноч|день|лифт|омолож|кож|чувств)))/i.test(
    normalizeForIntent(text)
  );
}

function isAgeSpecificProduct(product: ProductMatch): boolean {
  const rawName = product.name.toLowerCase();
  const normalized = productSearchText(product);
  return Boolean(
    /(25\+|30\+|35\+|40\+|45\+|50\+|55\+|60\+|65\+)/i.test(rawName) ||
      /(anti age|омолож|морщ|лифт|упруг)/i.test(normalized) ||
      /\b(?:25|30|35|40|45|50|55|60|65)\b(?=\s*(?:для|днев|ноч|день|лифт|омолож|кож|чувств))/i.test(normalized)
  );
}

function isSerumIntent(text: string): boolean {
  return /(сыворот|серум|концентрат)/.test(normalizeForIntent(text));
}

function isTonerIntent(text: string): boolean {
  return /(тоник|тонер|лосьон)/.test(normalizeForIntent(text));
}

function isMaskIntent(text: string): boolean {
  return /(маск)/.test(normalizeForIntent(text));
}

function isExfoliationIntent(text: string): boolean {
  return /(пилинг|пилинги|скраб|отшелуш|эксфолиа|энзимн)/.test(normalizeForIntent(text));
}

function isSerumProduct(product: ProductMatch): boolean {
  return /(сыворот|серум|концентрат)/.test(productSearchText(product));
}

function isTonerProduct(product: ProductMatch): boolean {
  return /(тоник|тонер|лосьон)/.test(productSearchText(product));
}

function isMaskProduct(product: ProductMatch): boolean {
  return /(маск)/.test(productSearchText(product));
}

function isExfoliatingProduct(product: ProductMatch): boolean {
  return /(пилинг|скраб|энзимн)/.test(productSearchText(product)) || product.flags.includes("has_acids");
}

function isBabyCareQuery(text: string): boolean {
  return /(младен|новорож|груднич|малыш|ребен|ребён|детск|baby|крошка)/i.test(normalizeForIntent(text));
}

function isBabyCareProduct(product: ProductMatch): boolean {
  return /(детск|baby|крошка|младен|новорож|малыш|для детей|для младенцев)/i.test(productSearchText(product));
}

function needsUltraGentle(messageText: string, profile: UserProfile | null): boolean {
  const normalized = normalizeForIntent(messageText);
  return Boolean(
    profile?.preferGentle ||
      /(псориаз|экзем|дерматит|розацеа|купероз|чувств|раздраж|барьер|атоп)/.test(normalized)
  );
}

function isHarshProduct(product: ProductMatch): boolean {
  return (
    product.flags.includes("has_acids") ||
    product.flags.includes("has_retinoid") ||
    product.flags.includes("has_drying_alcohol")
  );
}

function prefersLowFragranceQuery(text: string): boolean {
  return /(чувств|сух|барьер|раздраж|реактив|атоп)/i.test(normalizeForIntent(text));
}

function isGenericCatalogCreamListIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  if (!isCatalogWideIntent(text) || !isCreamIntent(text)) {
    return false;
  }
  if (hasAgeSpecificIntent(text)) {
    return false;
  }
  return !/(чувств|сух|жир|комб|барьер|высып|акне|пигмент|купероз|розаце|атоп|чист|увлаж|spf|спф)/i.test(normalized);
}

function isSensitiveDryFaceBrowseIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  if (hasAgeSpecificIntent(text) || isCompareIntent(text)) {
    return false;
  }
  return /(лиц|кож)/.test(normalized) && /(чувств|сух|барьер|атоп|раздраж|реактив)/.test(normalized);
}

function isPigmentationBrowseIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(пигмент|пятн|осветл|депигмент|постакне|тон кожи)/.test(normalized);
}

function isBarrierCreamBrowseIntent(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(барьер|восстановлен|атоп|раздраж|реактив|чувств)/.test(normalized) && /(крем|лиц|кож)/.test(normalized);
}

function needsDeepFaceBrowsePool(text: string): boolean {
  return (
    isSensitiveDryFaceBrowseIntent(text) ||
    isPigmentationBrowseIntent(text) ||
    isBarrierCreamBrowseIntent(text) ||
    /(восстановлен.*барьер|барьер.*лица|сух.*чувств.*лица)/.test(normalizeForIntent(text))
  );
}

function isSensitiveDryFaceCoreProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  const hasSensitiveDrySignals = /((чувств|сух|атоп|барьер|смягча|комфорт|oil крем|крем масло|крем баттер|panthenol urea|pharmacos|dead sea))/.test(
    text
  );

  return hasSensitiveDrySignals && isStrictCreamProduct(product) && !isAgeSpecificProduct(product) && !isExfoliatingProduct(product);
}

function isAntiAgeSpecialistProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  return /(антивозраст|против возрастных изменений|омолож|морщ|лифт|упруг|prestige|luxcare|filler|филлер|q10|collagen|retinol|dermage)/.test(
    text
  );
}

function hasExplicitBarrierText(product: ProductMatch): boolean {
  const text = productSearchText(product);
  return /(барьер|восстанов|атоп|чувств|реактив|раздраж|комфорт|смягча|успока|купероз|капилляро|panthenol urea|oil крем|крем масло|dead sea|pharmacos|ceraderma|atopicontrol|sensitivity control|nutrition control|hydro комфорт|hydroderm|sos уход|непогоды)/.test(
    text
  );
}

function isBarrierNoiseSpecialistProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  return Boolean(
    isDecorativeFaceProduct(product) ||
      isCleanserProduct(product) ||
      isSprayProduct(product) ||
      isEyeAreaProduct(product) ||
      isHighlightProduct(product) ||
      isExfoliatingProduct(product) ||
      isSerumProduct(product) ||
      isAntiAgeSpecialistProduct(product) ||
      /(постпилинг|post peel|праймер|экран|screen|антипигмент|витамин c|vitamin c|несовершен|матов|поры|массаж|cold|мороз|стартер|детокс|флюид)/.test(
        text
      )
  );
}

function isBarrierSupportProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");
  return (
    product.flags.includes("has_barrier_support") ||
    product.flags.includes("has_soothing_agents") ||
    /(барьер|восстанов|чувств|атоп|комфорт|эмолент|calm|soothing)/.test(text) ||
    /(ceramide|церамид|panthenol|пантенол|squalane|сквалан|allantoin|аллантоин|betaine|бетаин|urea|мочевин)/.test(
      ingredients
    )
  );
}

function isPigmentationProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");
  return (
    /(пигмент|осветл|депигмент|тон кожи|витамин c|vitamin c|anti spot|постакне)/.test(text) ||
    /(niacinamide|ниацинамид|vitamin c|аскорб|azel|азелаин|арбутин|kojic|койев|tranex|транекс|glycol|гликол)/.test(
      ingredients
    )
  );
}

function isExplicitPigmentationCareProduct(product: ProductMatch): boolean {
  const text = normalizeForIntent([product.name, product.purpose ?? "", product.line ?? ""].join(" "));
  if (isDecorativeFaceProduct(product) || isBlemishProduct(product) || isEyeAreaProduct(product) || isHighlightProduct(product)) {
    return false;
  }
  return /(депигмент|anti spot|против пигментации|антипигмент|осветляющ|пигментных пятен)/.test(
    text
  );
}

function isDedicatedPigmentationCareProduct(product: ProductMatch): boolean {
  return isExplicitPigmentationCareProduct(product) && !isAgeSpecificProduct(product);
}

function isFirstLinePigmentationCareProduct(product: ProductMatch): boolean {
  return isDedicatedPigmentationCareProduct(product) && !isAntiAgeSpecialistProduct(product);
}

function isSupportivePigmentationCareProduct(product: ProductMatch): boolean {
  if (
    isDecorativeFaceProduct(product) ||
    isBlemishProduct(product) ||
    isCleanserProduct(product) ||
    isSprayProduct(product) ||
    isEyeAreaProduct(product) ||
    isHighlightProduct(product)
  ) {
    return false;
  }

  if (isExplicitPigmentationCareProduct(product)) {
    return true;
  }

  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");

  if (isAgeSpecificProduct(product) || isAntiAgeSpecialistProduct(product)) {
    return false;
  }

  if (/(купероз|покрас|anti acne|анти акне|акне контроль)/.test(text)) {
    return false;
  }

  return (
    /(витамин c|vitamin c|ниацинамид|niacinamide|постакне|сияние кожи|сияние лица|ровный тон|bright|brightening|radiance|пигмент)/.test(
      text
    ) ||
    /(niacinamide|ниацинамид|vitamin c|аскорб|arbutin|арбутин|tranex|транекс|kojic|койев|azel|азелаин)/.test(ingredients)
  );
}

function isPrimaryBarrierCareProduct(product: ProductMatch): boolean {
  if (!isStrictCreamProduct(product) || isBarrierNoiseSpecialistProduct(product)) {
    return false;
  }

  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");

  if (isAgeSpecificProduct(product) && !hasExplicitBarrierText(product)) {
    return false;
  }

  return (
    hasExplicitBarrierText(product) ||
    ((product.flags.includes("has_barrier_support") || product.flags.includes("has_soothing_agents")) &&
      /(сух|чувств|атоп|реактив|раздраж|комфорт|восстанов|защит|смягча|успока|купероз)/.test(text)) ||
    (/(ceramide|церамид|panthenol|пантенол|squalane|сквалан|urea|мочевин|allantoin|аллантоин)/.test(ingredients) &&
      /(сух|чувств|атоп|реактив|раздраж|комфорт|восстанов|защит|смягча|успока|купероз)/.test(text))
  );
}

function isDedicatedBarrierCareProduct(product: ProductMatch): boolean {
  if (!isPrimaryBarrierCareProduct(product) || isAgeSpecificProduct(product)) {
    return false;
  }

  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");

  return (
    /(барьер|восстанавлива|атоп|чувств|реактив|комфорт|смягчающ|успокаивающ|купероз|капилляро|oil крем|panthenol urea|pharmacos|dead sea|крем масло)/.test(
      text
    ) ||
    (/(ceramide|церамид|panthenol|пантенол|squalane|сквалан|urea|мочевин|allantoin|аллантоин)/.test(ingredients) &&
      /(сух|чувств|атоп|раздраж|восстанов|комфорт)/.test(text))
  );
}

function isSupportiveBarrierCareProduct(product: ProductMatch): boolean {
  if (!isStrictCreamProduct(product) || isBarrierNoiseSpecialistProduct(product) || isAgeSpecificProduct(product)) {
    return false;
  }

  if (isPrimaryBarrierCareProduct(product)) {
    return true;
  }

  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");
  return (
    (/(увлаж|moist|aqua|hyaluron|гиалур|эмолент|защит|calm|soothing|пробиотик)/.test(text) &&
      /(glycerin|глицерин|betaine|бетаин|hyaluron|гиалур|urea|мочевин|lecithin|лецитин|panthenol|пантенол|allantoin|аллантоин|squalane|сквалан)/.test(
        ingredients
      )) ||
    /(увлажняющ|суперувлаж|аква|крем сорбет|крем баттер)/.test(text)
  );
}

function isGeneralFaceCreamSpecialistProduct(product: ProductMatch): boolean {
  const text = productSearchText(product);
  return (
    isDecorativeFaceProduct(product) ||
    isEyeAreaProduct(product) ||
    isExfoliatingProduct(product) ||
    /(маск|mask|men|муж|постпилинг|post peel|поры|минимайзер|несовершен|матир|анти акне|anti acne|acne|cold|холод|мороз|массаж|праймер|экран|screen|филлер|filler|корректир|капилляро|купероз|dermage|антипигмент|стартер|фактор|сыворот|серум|совершенств|сияни)/.test(
      text
    )
  );
}

function isGeneralDailyFaceCreamProduct(product: ProductMatch): boolean {
  if (
    !isStrictCreamProduct(product) ||
    isGeneralFaceCreamSpecialistProduct(product) ||
    isCleanserProduct(product) ||
    isExfoliatingProduct(product) ||
    isSprayProduct(product)
  ) {
    return false;
  }

  if (isAgeSpecificProduct(product)) {
    return false;
  }

  const theme = detectCatalogTheme(product);
  return theme === "barrier" || theme === "hydration" || theme === "universal";
}

type CatalogTheme =
  | "universal"
  | "barrier"
  | "hydration"
  | "spf"
  | "night"
  | "anti_age"
  | "pigmentation"
  | "blemish"
  | "eye_face"
  | "other";

function detectCatalogTheme(product: ProductMatch): CatalogTheme {
  const text = productSearchText(product);
  const ingredients = product.ingredients.map((item) => item.toLowerCase()).join(", ");
  const daySignals = /(утрен|дневн|day|день)/.test(text);
  const nightSignals = /(ночн|night)/.test(text);

  if (isDedicatedPigmentationCareProduct(product)) return "pigmentation";
  if (/(несовершен|акне|blemish|problem)/.test(text)) return "blemish";
  if (/(spf|спф|uv|защит)/.test(text)) return "spf";
  if (nightSignals && !daySignals) return "night";
  if (/(вокруг глаз|глаз)/.test(text)) return "eye_face";
  if (/(морщ|лифт|омолож|пептид|prestige|luxcare|filler|collagen|q10|retinol|40\+|45\+|50\+|60\+|65\+)/.test(text)) {
    return "anti_age";
  }
  if (
    product.flags.includes("has_barrier_support") ||
    /(атоп|чувств|комфорт|барьер|soothing|calm|эмолент|squalane|сквалан|ceramide|церамид)/.test(text + " " + ingredients)
  ) {
    return "barrier";
  }
  if (/(увлаж|hyaluron|гиалур|aqua|moist|betaine|бетаин|glycerin|глицерин)/.test(text + " " + ingredients)) {
    return "hydration";
  }
  if (/(день ночь|24ч|дневн|ежедневн|универс)/.test(text)) return "universal";
  return "other";
}

function getCatalogThemeLabel(theme: CatalogTheme): string {
  switch (theme) {
    case "barrier":
      return "барьер и чувствительность";
    case "hydration":
      return "увлажнение";
    case "spf":
      return "дневной с SPF";
    case "night":
      return "ночной уход";
    case "anti_age":
      return "anti-age";
    case "pigmentation":
      return "тон и пигментация";
    case "blemish":
      return "несовершенства";
    case "eye_face":
      return "лицо и зона вокруг глаз";
    case "universal":
      return "универсальный";
    default:
      return "общий уход";
  }
}

function diversifyCatalogMatches(messageText: string, matches: ProductMatch[], limit: number): ProductMatch[] {
  if (isGenericHairListIntent(messageText)) {
    const pool = matches.filter((product) => isHairCareProduct(product) && !isHairColoringProduct(product));
    const selected: ProductMatch[] = [];
    const addFirst = (items: ProductMatch[]) => {
      const next = items.find((item) => !selected.some((picked) => picked.id === item.id));
      if (next) selected.push(next);
    };
    addFirst(pool.filter(isHairWashProduct));
    addFirst(pool.filter(isHairLeaveInProduct));
    addFirst(pool.filter(isHairOilProduct));
    for (const product of pool) {
      if (!selected.some((picked) => picked.id === product.id)) {
        selected.push(product);
      }
      if (selected.length >= limit) break;
    }
    const fallback = matches.filter(isHairCareProduct);
    return (selected.length > 0 ? selected : fallback.length > 0 ? fallback : matches).slice(0, limit);
  }

  if (isGenericBodyListIntent(messageText)) {
    const pool = matches.filter((product) => isBodyCareProduct(product) && !isBodyFragranceProduct(product));
    const selected: ProductMatch[] = [];
    const addFirst = (items: ProductMatch[]) => {
      const next = items.find((item) => !selected.some((picked) => picked.id === item.id));
      if (next) selected.push(next);
    };
    addFirst(pool.filter(isBodyCreamProduct));
    addFirst(pool.filter(isBodyWashProduct));
    addFirst(pool.filter(isBodyOilProduct));
    for (const product of pool) {
      if (!selected.some((picked) => picked.id === product.id)) {
        selected.push(product);
      }
      if (selected.length >= limit) break;
    }
    const fallback = matches.filter(isBodyCareProduct);
    return (selected.length > 0 ? selected : fallback.length > 0 ? fallback : matches).slice(0, limit);
  }

  if (isGenericFeetListIntent(messageText)) {
    const feetCare = matches.filter((product) => isFeetCareProduct(product) && !isNailProduct(product));
    const fallback = matches.filter(isFeetCareProduct);
    return (feetCare.length > 0 ? feetCare : fallback.length > 0 ? fallback : matches).slice(0, limit);
  }

  if (isSensitiveDryFaceBrowseIntent(messageText)) {
    const pool = matches.filter((product) => isStrictCreamProduct(product) && !isAgeSpecificProduct(product) && !isExfoliatingProduct(product));
    const selected: ProductMatch[] = [];
    const addFirst = (items: ProductMatch[]) => {
      const next = items.find((item) => !selected.some((picked) => picked.id === item.id));
      if (next) selected.push(next);
    };

    addFirst(pool.filter((product) => isSensitiveDryFaceCoreProduct(product) && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => isSensitiveDryFaceCoreProduct(product)));
    addFirst(pool.filter((product) => product.flags.includes("has_barrier_support") && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => product.flags.includes("has_soothing_agents") && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => !product.flags.includes("has_fragrance")));

    for (const product of pool) {
      if (!selected.some((picked) => picked.id === product.id)) {
        selected.push(product);
      }
      if (selected.length >= limit) break;
    }

    return (selected.length > 0 ? selected : matches).slice(0, limit);
  }

  if (isPigmentationBrowseIntent(messageText)) {
    const pool = matches.filter((product) => !isExfoliatingProduct(product) && (isMakeupIntent(messageText) || !isDecorativeFaceProduct(product)));
    const selected: ProductMatch[] = [];
    const addFirst = (items: ProductMatch[]) => {
      const next = items.find((item) => !selected.some((picked) => picked.id === item.id));
      if (next) selected.push(next);
    };

    addFirst(pool.filter((product) => isDedicatedPigmentationCareProduct(product) && isStrictCreamProduct(product)));
    addFirst(pool.filter((product) => isDedicatedPigmentationCareProduct(product) && isSerumProduct(product)));
    addFirst(pool.filter((product) => isExplicitPigmentationCareProduct(product) && isStrictCreamProduct(product)));
    addFirst(pool.filter((product) => isExplicitPigmentationCareProduct(product) && isSerumProduct(product)));
    addFirst(pool.filter((product) => isSupportivePigmentationCareProduct(product) && isStrictCreamProduct(product)));
    addFirst(pool.filter((product) => isSupportivePigmentationCareProduct(product) && isSerumProduct(product)));
    addFirst(pool.filter((product) => isExplicitPigmentationCareProduct(product)));
    addFirst(pool.filter((product) => isSupportivePigmentationCareProduct(product)));

    for (const product of pool) {
      if (!selected.some((picked) => picked.id === product.id)) {
        selected.push(product);
      }
      if (selected.length >= limit) break;
    }

    return (selected.length > 0 ? selected : matches).slice(0, limit);
  }

  if (isBarrierCreamBrowseIntent(messageText)) {
    const pool = matches.filter((product) => !isExfoliatingProduct(product) && !isDecorativeFaceProduct(product));
    const selected: ProductMatch[] = [];
    const addFirst = (items: ProductMatch[]) => {
      const next = items.find((item) => !selected.some((picked) => picked.id === item.id));
      if (next) selected.push(next);
    };

    addFirst(pool.filter((product) => isDedicatedBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => isDedicatedBarrierCareProduct(product)));
    addFirst(pool.filter((product) => isPrimaryBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => isPrimaryBarrierCareProduct(product)));
    addFirst(pool.filter((product) => isSupportiveBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
    addFirst(pool.filter((product) => isSupportiveBarrierCareProduct(product)));

    for (const product of pool) {
      if (!selected.some((picked) => picked.id === product.id)) {
        selected.push(product);
      }
      if (selected.length >= limit) break;
    }

    return (selected.length > 0 ? selected : matches).slice(0, limit);
  }

  if (!isGenericCatalogCreamListIntent(messageText)) {
    return matches.slice(0, limit);
  }

  const selected: ProductMatch[] = [];
  const usedIds = new Set<string>();
  const themeCounts = new Map<CatalogTheme, number>();

  for (const product of matches) {
    const theme = detectCatalogTheme(product);
    const count = themeCounts.get(theme) ?? 0;
    if (count >= 2) {
      continue;
    }
    selected.push(product);
    usedIds.add(product.id);
    themeCounts.set(theme, count + 1);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const product of matches) {
    if (usedIds.has(product.id)) {
      continue;
    }
    selected.push(product);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function reprioritizeMatches(messageText: string, matches: ProductMatch[]): ProductMatch[] {
  const lowFragranceWanted = prefersLowFragranceQuery(messageText);
  const ageSpecificAllowed = hasAgeSpecificIntent(messageText);
  const genericHairList = isGenericHairListIntent(messageText);
  const genericBodyList = isGenericBodyListIntent(messageText);
  const genericFeetList = isGenericFeetListIntent(messageText);
  const hairColoringAllowed = isHairColoringIntent(messageText);
  const genericCreamList = isGenericCatalogCreamListIntent(messageText);
  const pigmentationWanted = isPigmentationBrowseIntent(messageText);
  const barrierCreamWanted = isBarrierCreamBrowseIntent(messageText);

  return [...matches].sort((left, right) => {
    const scoreProduct = (product: ProductMatch): number => {
      let bonus = 0;

      if (lowFragranceWanted) {
        if (!product.flags.includes("has_fragrance")) bonus += 8;
        if (product.flags.includes("gentle_fit")) bonus += 5;
        if (product.flags.includes("has_barrier_support")) bonus += 5;
        if (product.flags.includes("has_soothing_agents")) bonus += 4;
        if (product.flags.includes("has_humectants")) bonus += 3;
      }

      if (!ageSpecificAllowed && isAgeSpecificProduct(product)) {
        bonus -= 7;
      }

      if (lowFragranceWanted && isAgeSpecificProduct(product)) {
        bonus -= 6;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && isAgeSpecificProduct(product)) {
        bonus -= 18;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && isSerumProduct(product)) {
        bonus -= 10;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && isStrictCreamProduct(product)) {
        bonus += 8;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && isSensitiveDryFaceCoreProduct(product)) {
        bonus += 12;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && product.flags.includes("has_barrier_support")) {
        bonus += 7;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && product.flags.includes("has_soothing_agents")) {
        bonus += 6;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && !product.flags.includes("has_fragrance")) {
        bonus += 6;
      }

      if (isSensitiveDryFaceBrowseIntent(messageText) && product.flags.includes("has_fragrance")) {
        bonus -= 8;
      }

      if (pigmentationWanted) {
        if (isFirstLinePigmentationCareProduct(product)) bonus += 38;
        else if (isDedicatedPigmentationCareProduct(product)) bonus += 30;
        else if (isExplicitPigmentationCareProduct(product)) bonus += 18;
        else if (isSupportivePigmentationCareProduct(product)) bonus += 14;
        else if (isPigmentationProduct(product)) bonus += 4;
        if (isStrictCreamProduct(product)) bonus += 8;
        if (isSerumProduct(product) && (isExplicitPigmentationCareProduct(product) || isSupportivePigmentationCareProduct(product))) bonus += 4;
        if (!isExplicitPigmentationCareProduct(product) && isAgeSpecificProduct(product)) bonus -= 20;
        if (isAntiAgeSpecialistProduct(product) && !isFirstLinePigmentationCareProduct(product)) bonus -= 18;
        if (!isMakeupIntent(messageText) && isDecorativeFaceProduct(product)) bonus -= 28;
        if (isCleanserProduct(product)) bonus -= 24;
        if (isSprayProduct(product)) bonus -= 18;
        if (isEyeAreaProduct(product)) bonus -= 14;
        if (isHighlightProduct(product)) bonus -= 14;
        if (isBlemishProduct(product) && !isExplicitPigmentationCareProduct(product)) bonus -= 18;
        if (!isSupportivePigmentationCareProduct(product) && !isExplicitPigmentationCareProduct(product)) bonus -= 18;
      }

      if (barrierCreamWanted) {
        if (isDedicatedBarrierCareProduct(product)) bonus += 30;
        else if (isPrimaryBarrierCareProduct(product)) bonus += 24;
        else if (isSupportiveBarrierCareProduct(product)) bonus += 12;
        else if (isBarrierSupportProduct(product)) bonus += 6;
        if (isStrictCreamProduct(product)) bonus += 6;
        if (product.flags.includes("has_fragrance")) bonus -= 8;
        if (isAgeSpecificProduct(product) && !isPrimaryBarrierCareProduct(product)) bonus -= 18;
        if (isBarrierNoiseSpecialistProduct(product)) bonus -= 20;
        if (isDecorativeFaceProduct(product)) bonus -= 20;
      }

      if (genericCreamList) {
        const theme = detectCatalogTheme(product);
        if (isGeneralDailyFaceCreamProduct(product)) bonus += 16;
        else if (isStrictCreamProduct(product)) bonus += 2;
        if (theme === "barrier") bonus += 7;
        if (theme === "hydration") bonus += 6;
        if (theme === "universal") bonus += 5;
        if (theme === "spf") bonus -= 2;
        if (theme === "pigmentation") bonus -= 4;
        if (theme === "night") bonus -= 2;
        if (theme === "anti_age") bonus -= 8;
        if (isAgeSpecificProduct(product)) bonus -= 10;
        if (isAntiAgeSpecialistProduct(product)) bonus -= 10;
        if (product.flags.includes("has_fragrance")) bonus -= 3;
        if (!isStrictCreamProduct(product)) bonus -= 22;
        if (isGeneralFaceCreamSpecialistProduct(product)) bonus -= 24;
        if (isDecorativeFaceProduct(product)) bonus -= 30;
      }

      if (isExfoliatingProduct(product)) {
        bonus -= 8;
      }

      if (genericHairList) {
        if (isHairCareProduct(product)) bonus += 8;
        if (!hairColoringAllowed && isHairColoringProduct(product)) bonus -= 12;
      }

      if (genericBodyList) {
        if (isBodyCareProduct(product)) bonus += 8;
        if (isBodyFragranceProduct(product)) bonus -= 10;
        if (isBodyCreamProduct(product)) bonus += 7;
        if (isBodyWashProduct(product)) bonus += 5;
        if (isBodyOilProduct(product)) bonus += 2;
        if (isBodyScrubProduct(product)) bonus -= 7;
        if (isDecorativeBodyProduct(product)) bonus -= 12;
      }

      if (genericFeetList) {
        if (isFeetCareProduct(product)) bonus += 10;
        if (isNailProduct(product)) bonus -= 12;
      }

      return bonus;
    };

    const diff = scoreProduct(right) - scoreProduct(left);
    if (diff !== 0) {
      return diff;
    }
    return right.score - left.score;
  });
}

function refineMatches(
  profile: UserProfile | null,
  messageText: string,
  matches: ProductMatch[],
  limit: number
): ProductMatch[] {
  let refined = [...matches];
  const compareIntent = isCompareIntent(messageText);

  if (isBabyCareQuery(messageText)) {
    refined = refined.filter(isBabyCareProduct);
  }

  if (!compareIntent && isCleanserIntent(messageText)) {
    const cleansers = refined.filter(isCleanserProduct);
    if (cleansers.length > 0) {
      refined = cleansers;
    }
  }

  if (!compareIntent && isCreamIntent(messageText)) {
    const creams = refined.filter(isStrictCreamProduct);
    const fallbackCreams = refined.filter(isCreamProduct);
    if (creams.length > 0) {
      refined = creams;
    } else if (fallbackCreams.length > 0) {
      refined = fallbackCreams;
    }
  }

  if (!compareIntent && isPigmentationBrowseIntent(messageText) && !isMakeupIntent(messageText)) {
    const nonDecorative = refined.filter((product) => !isDecorativeFaceProduct(product));
    if (nonDecorative.length > 0) {
      refined = nonDecorative;
    }

    const curatedPigmentation = refined.filter(
      (product) =>
        isDedicatedPigmentationCareProduct(product) ||
        isExplicitPigmentationCareProduct(product) ||
        isSupportivePigmentationCareProduct(product)
    );
    if (curatedPigmentation.length > 0) {
      refined = curatedPigmentation;
    }

    const nonAntiAgePigmentation = refined.filter(
      (product) => !isAntiAgeSpecialistProduct(product) || isExplicitPigmentationCareProduct(product)
    );
    if (nonAntiAgePigmentation.length >= 2) {
      refined = nonAntiAgePigmentation;
    }

    const focusedPigmentation = refined.filter((product) => isDedicatedPigmentationCareProduct(product));
    if (focusedPigmentation.length >= 2) {
      refined = focusedPigmentation;
    }

    const firstLinePigmentation = refined.filter((product) => isFirstLinePigmentationCareProduct(product));
    if (firstLinePigmentation.length >= 2) {
      refined = firstLinePigmentation;
    }

    const nonCleanserPigmentation = refined.filter(
      (product) =>
        !isCleanserProduct(product) &&
        !isSprayProduct(product) &&
        !isEyeAreaProduct(product) &&
        !isHighlightProduct(product)
    );
    if (nonCleanserPigmentation.length > 0) {
      refined = nonCleanserPigmentation;
    }

    const explicitPigmentation = refined.filter((product) => isExplicitPigmentationCareProduct(product));
    if (explicitPigmentation.length >= 2) {
      refined = explicitPigmentation;
    } else {
      const supportivePigmentation = refined.filter((product) => isSupportivePigmentationCareProduct(product));
      if (supportivePigmentation.length >= 2) {
        refined = supportivePigmentation;
      }
    }

    const nonAgeSpecificPigmentation = refined.filter(
      (product) => !isAgeSpecificProduct(product) || isExplicitPigmentationCareProduct(product)
    );
    if (nonAgeSpecificPigmentation.length >= 2) {
      refined = nonAgeSpecificPigmentation;
    }
  }

  if (!compareIntent && isBarrierCreamBrowseIntent(messageText)) {
    const creamsOnly = refined.filter(isStrictCreamProduct);
    if (creamsOnly.length > 0) {
      refined = creamsOnly;
    }

    const nonNoiseBarrier = refined.filter((product) => !isBarrierNoiseSpecialistProduct(product));
    if (nonNoiseBarrier.length >= 2) {
      refined = nonNoiseBarrier;
    }

    const primaryBarrier = refined.filter(isDedicatedBarrierCareProduct);
    if (primaryBarrier.length >= 2) {
      refined = primaryBarrier;
    } else {
      const supportiveBarrier = refined.filter(isPrimaryBarrierCareProduct);
      if (supportiveBarrier.length >= 2) {
        refined = supportiveBarrier;
      } else {
        const widerBarrier = refined.filter(isSupportiveBarrierCareProduct);
        if (widerBarrier.length >= 2) {
          refined = widerBarrier;
        }
      }
    }

    const nonAgeSpecificBarrier = refined.filter(
      (product) => !isAgeSpecificProduct(product) || isDedicatedBarrierCareProduct(product)
    );
    if (nonAgeSpecificBarrier.length >= 2) {
      refined = nonAgeSpecificBarrier;
    }
  }

  if (!compareIntent && profile?.avoidFragrance) {
    const fragranceFree = refined.filter((product) => !product.flags.includes("has_fragrance"));
    if (fragranceFree.length > 0) {
      refined = fragranceFree;
    }
  }

  if (!compareIntent && prefersLowFragranceQuery(messageText) && !isCatalogWideIntent(messageText)) {
    const lowFragrance = refined.filter((product) => !product.flags.includes("has_fragrance"));
    if (lowFragrance.length > 0) {
      refined = lowFragrance;
    }
  }

  if (
    !compareIntent &&
    !hasAgeSpecificIntent(messageText) &&
    prefersLowFragranceQuery(messageText) &&
    !isCatalogWideIntent(messageText)
  ) {
    const nonAgeSpecific = refined.filter((product) => !isAgeSpecificProduct(product));
    if (nonAgeSpecific.length > 0) {
      refined = nonAgeSpecific;
    }
  }

  if (!compareIntent && needsUltraGentle(messageText, profile)) {
    const gentleOnly = refined.filter((product) => !isHarshProduct(product));
    if (gentleOnly.length > 0) {
      refined = gentleOnly;
    }

    if (!isExfoliationIntent(messageText)) {
      const nonExfoliating = refined.filter((product) => !isExfoliatingProduct(product));
      if (nonExfoliating.length > 0) {
        refined = nonExfoliating;
      }
    }

    if (!isCreamIntent(messageText) && !isCleanserIntent(messageText) && !isSerumIntent(messageText) && !isTonerIntent(messageText) && !isMaskIntent(messageText)) {
      const comfortProducts = refined.filter(
        (product) => isStrictCreamProduct(product) || isSerumProduct(product) || isTonerProduct(product)
      );
      if (comfortProducts.length > 0) {
        refined = comfortProducts;
      }
    }
  }

  if (!compareIntent && isSensitiveDryFaceBrowseIntent(messageText)) {
    const nonAgeSpecific = refined.filter((product) => !isAgeSpecificProduct(product));
    if (nonAgeSpecific.length > 0) {
      refined = nonAgeSpecific;
    }

    const creamsOnly = refined.filter(isStrictCreamProduct);
    if (creamsOnly.length > 0) {
      refined = creamsOnly;
    }

  }

  if (!compareIntent && isGenericCatalogCreamListIntent(messageText)) {
    const creamsOnly = refined.filter(
      (product) => isStrictCreamProduct(product) && !isCleanserProduct(product) && !isExfoliatingProduct(product) && !isSprayProduct(product)
    );
    if (creamsOnly.length > 0) {
      refined = creamsOnly;
    }

    const generalCreams = refined.filter(isGeneralDailyFaceCreamProduct);
    if (generalCreams.length >= 4) {
      refined = generalCreams;
    } else {
      const nonSpecialistCreams = refined.filter((product) => !isGeneralFaceCreamSpecialistProduct(product));
      if (nonSpecialistCreams.length >= 4) {
        refined = nonSpecialistCreams;
      }
    }
  }

  refined = compareIntent ? refined : reprioritizeMatches(messageText, refined);
  return refined.slice(0, limit);
}

function isScoredListIntent(text: string): boolean {
  return /(оценк|рейтинг|10\s*баль|10-?бал)/i.test(normalizeForIntent(text));
}

function formatScoreValue(product: ProductMatch, index: number): string {
  let score = 9.4 - index * 0.3;
  if (product.flags.includes("gentle_fit")) score += 0.2;
  if (product.flags.includes("has_barrier_support")) score += 0.2;
  if (product.flags.includes("has_humectants")) score += 0.1;
  if (product.flags.includes("has_fragrance")) score -= 0.4;
  if (product.flags.includes("has_acids")) score -= 0.5;
  if (product.flags.includes("has_retinoid")) score -= 0.6;
  if (product.flags.includes("has_drying_alcohol")) score -= 0.5;
  const clamped = Math.max(6.5, Math.min(9.8, score));
  return clamped.toFixed(1);
}

function buildProductReason(product: ProductMatch): string {
  const parts: string[] = [];
  const text = product.ingredients.map((item) => item.toLowerCase()).join(", ");

  if (/glycerin|глицерин|betaine|бетаин|hyaluron|гиалур|urea|мочевин|panthenol|пантенол|squalane|сквалан|allantoin|аллантоин/.test(text)) {
    parts.push("есть увлажняющие и смягчающие компоненты");
  }
  if (product.flags.includes("has_barrier_support")) {
    parts.push("есть барьерная поддержка");
  }
  if (product.flags.includes("has_soothing_agents")) {
    parts.push("есть успокаивающие компоненты");
  }
  if (product.flags.includes("gentle_fit")) {
    parts.push("формула выглядит деликатной");
  }

  if (parts.length === 0) {
    parts.push("выглядит уместно по формату и задаче запроса");
  }

  return parts.join(", ");
}

function buildProductLimitations(product: ProductMatch): string {
  const parts: string[] = [];
  const text = productSearchText(product);

  if (product.flags.includes("has_fragrance")) parts.push("есть отдушка");
  if (product.flags.includes("has_acids") || isExfoliatingProduct(product)) parts.push("не лучший вариант при раздражении или жжении");
  if (product.flags.includes("has_retinoid")) parts.push("может быть лишним для реактивной кожи");
  if (/spf|спф/.test(text)) parts.push("это скорее дневной вариант с защитой, а не базовый восстанавливающий крем");

  return parts.length > 0 ? parts.join("; ") : "критичных ограничений по этому запросу не видно";
}

function buildProductLinks(products: ProductMatch[]): string {
  const links = products.filter((product) => Boolean(product.sourceUrl));
  if (links.length === 0) {
    return "";
  }
  return ["Ссылки на продукты:", ...links.map((product, index) => `${index + 1}. ${product.name}: ${product.sourceUrl}`)].join("\n");
}

function scoreSegmentMatch(segment: string, product: ProductMatch): number {
  const normalizedSegment = normalizeForIntent(segment);
  const normalizedName = productSearchText(product);
  if (!normalizedSegment) {
    return 0;
  }

  let score = 0;
  if (normalizedName.includes(normalizedSegment)) {
    score += 100;
  }

  const tokens = normalizedSegment.split(" ").filter((token) => token.length >= 3);
  for (const token of tokens) {
    if (normalizedName.includes(token)) {
      score += 15;
    }
  }

  return score;
}

function pickComparisonProducts(messageText: string, matches: ProductMatch[]): ProductMatch[] {
  if (!isCompareIntent(messageText) || matches.length < 2) {
    return matches.slice(0, 2);
  }

  const segments = extractCompareSegments(messageText);
  if (segments.length < 2) {
    return matches.slice(0, 2);
  }

  const selected: ProductMatch[] = [];
  const usedIds = new Set<string>();

  for (const segment of segments) {
    const ranked = [...matches]
      .map((product) => ({ product, score: scoreSegmentMatch(segment, product) }))
      .sort((left, right) => right.score - left.score);

    const picked = ranked.find((entry) => entry.score > 0 && !usedIds.has(entry.product.id))?.product;
    if (picked) {
      selected.push(picked);
      usedIds.add(picked.id);
    }
  }

  if (selected.length >= 2) {
    return selected.slice(0, 2);
  }

  for (const product of matches) {
    if (usedIds.has(product.id)) {
      continue;
    }
    selected.push(product);
    if (selected.length >= 2) {
      break;
    }
  }

  return selected.slice(0, 2);
}

function buildComparisonVerdict(left: ProductMatch, right: ProductMatch): string {
  const leftFragranceFree = !left.flags.includes("has_fragrance");
  const rightFragranceFree = !right.flags.includes("has_fragrance");

  if (leftFragranceFree && !rightFragranceFree) {
    return `${left.name} выглядит более мягким вариантом, если приоритет у чувствительности и минимизации отдушки.`;
  }

  if (rightFragranceFree && !leftFragranceFree) {
    return `${right.name} выглядит более мягким вариантом, если приоритет у чувствительности и минимизации отдушки.`;
  }

  const leftBarrier = Number(left.flags.includes("has_barrier_support")) + Number(left.flags.includes("has_soothing_agents"));
  const rightBarrier = Number(right.flags.includes("has_barrier_support")) + Number(right.flags.includes("has_soothing_agents"));
  if (leftBarrier > rightBarrier) {
    return `${left.name} выглядит сильнее именно как барьерный и успокаивающий вариант.`;
  }
  if (rightBarrier > leftBarrier) {
    return `${right.name} выглядит сильнее именно как барьерный и успокаивающий вариант.`;
  }

  return "Оба варианта можно рассматривать, но выбирать стоит по чувствительности к отдушке и желаемой насыщенности текстуры.";
}

function buildCompareReply(messageText: string, products: ProductMatch[]): string {
  const selected = pickComparisonProducts(messageText, products);
  if (selected.length < 2) {
    return buildCatalogWideReply(messageText, products.slice(0, 2));
  }

  const [left, right] = selected;
  const lines = [
    `Сравнил два варианта для этого запроса: ${left.name} и ${right.name}.`,
    "",
    `1. ${left.name}`,
    `Почему подходит: ${buildProductReason(left)}`,
    `Ограничения: ${buildProductLimitations(left)}`,
    "",
    `2. ${right.name}`,
    `Почему подходит: ${buildProductReason(right)}`,
    `Ограничения: ${buildProductLimitations(right)}`,
    "",
    `Итог: ${buildComparisonVerdict(left, right)}`,
    buildProductLinks(selected)
  ];

  return lines.filter(Boolean).join("\n");
}

function buildCatalogWideReply(messageText: string, matches: ProductMatch[]): string {
  const scored = isScoredListIntent(messageText);
  const genericCreamList = isGenericCatalogCreamListIntent(messageText);
  const compactMode = matches.length > 5;
  const intro = scored
    ? "Ниже относительная экспертная оценка внутри текущего каталога Belita/Vitex по вашему запросу. Это не лабораторный рейтинг, а практическая сортировка по уместности."
    : "Подобрал лучшие варианты из текущего каталога Belita/Vitex по вашему запросу.";

  const body = matches.map((product, index) => {
    const themeLabel = genericCreamList ? ` [${getCatalogThemeLabel(detectCatalogTheme(product))}]` : "";
    if (compactMode) {
      const scoreLabel = scored ? ` — ${formatScoreValue(product, index)}/10` : "";
      return `${index + 1}. ${product.name}${themeLabel}${scoreLabel}`;
    }

    const lines = [`${index + 1}. ${product.name}${themeLabel}`];
    if (scored) {
      lines.push(`Оценка: ${formatScoreValue(product, index)}/10`);
    }
    lines.push(`Почему в списке: ${buildProductReason(product)}`);
    lines.push(`Ограничения: ${buildProductLimitations(product)}`);
    return lines.join("\n");
  });

  const links = compactMode ? "" : buildProductLinks(matches);
  const outro = compactMode
    ? "Если хотите, я могу следующим сообщением дать ссылки и короткий разбор по любым 3 позициям из списка."
    : "";
  return [intro, "", ...body, links, outro].filter(Boolean).join("\n\n");
}

function buildBabyCareNoMatchReply(): string {
  return [
    "Я не хочу советовать взрослые средства для младенца или маленького ребенка, если в каталоге не вижу явно детского подходящего варианта.",
    "Поэтому в таком запросе я лучше не буду подставлять кремы или умывалки для взрослой кожи \"по аналогии\".",
    "",
    "Что могу сделать безопаснее:",
    "1. подобрать только детские продукты Belita/Vitex, если они есть в текущем каталоге;",
    "2. помочь с уходом для взрослой кожи лица, тела, рук или волос;",
    "3. если речь о раздражении, сыпи или жжении у младенца, лучше не экспериментировать и обсудить это с педиатром."
  ].join("\n");
}

function isShortAcknowledgement(text: string): boolean {
  return /^(да|даа+|нет|нету|неа|ага|угу|ок|окей|понял|поняла)$/i.test(text.trim());
}

function isLinksFollowUp(text: string): boolean {
  return /^(ссылк[аи]?|ссылки дай|дай ссылки|дай ссылк|покажи ссылки|нужны ссылки)$/i.test(normalizeForIntent(text));
}

function extractRequestedProductNumbers(text: string): number[] {
  const matches = [...normalizeForIntent(text).matchAll(/\b(\d{1,2})\b/g)];
  const numbers = matches
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 20);
  return [...new Set(numbers)];
}

function isIndexedCompareFollowUp(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /^(сравни|сравнение|разбери|разбор|поясни|объясни)/i.test(normalized) && extractRequestedProductNumbers(text).length >= 1;
}

function isCompositionFollowUp(text: string): boolean {
  const normalized = normalizeForIntent(text);
  return /(состав|составы|inci|ингредиент)/i.test(normalized);
}

function isAbusiveMessage(text: string): boolean {
  return /(туп|идиот|дебил|ау|че тупой|ты ч[её])/i.test(text.toLowerCase());
}

function buildAcknowledgementReply(): string {
  return [
    "Понял.",
    "Если выбирать без дополнительных особенностей кожи, начните с первого варианта из последней рекомендации.",
    "Если хотите, я могу сделать следующий шаг:",
    "1. подобрать более бюджетную альтернативу;",
    "2. подобрать умывание к этому крему;",
    "3. подобрать сыворотку или ночной уход."
  ].join("\n");
}

function buildBoundaryReply(): string {
  return [
    "Я помогу с подбором Belita/Vitex, но давайте продолжим спокойно.",
    "Можете написать, что именно не подошло в последнем ответе:",
    "- не тот тип продукта;",
    "- не та зона ухода;",
    "- нужны более мягкие варианты;",
    "- нужны более бюджетные варианты."
  ].join("\n");
}

function buildLinksReply(session: RecommendationSession | null): string | null {
  if (!session || session.products.length === 0) {
    return null;
  }

  const links = buildProductLinks(session.products);
  if (!links) {
    return null;
  }

  return [
    `Ссылки на последние подобранные товары по запросу «${session.queryText}»:`,
    links
  ].join("\n\n");
}

function buildFeedbackReply(
  feedbackType: "helpful" | "not_relevant" | "more",
  session: RecommendationSession | null
): string {
  switch (feedbackType) {
    case "helpful":
      return "Спасибо, это полезный сигнал. Я учту, что такая подборка оказалась удачной.";
    case "not_relevant":
      return [
        "Спасибо, это важный сигнал.",
        "Напишите, что именно не попало в задачу: зона ухода, тип продукта, тип кожи или цель ухода."
      ].join("\n");
    case "more":
      if (!session || session.products.length === 0) {
        return "Если хотите больше вариантов, сначала попросите подобрать товары по нужной задаче.";
      }
      return [
        `Могу расширить подборку по запросу «${session.queryText}».`,
        "Напишите `напиши весь список кратко` или уточните задачу, например: `покажи более мягкие варианты`."
      ].join("\n");
  }
}

function parseFeedbackMessage(text: string): "helpful" | "not_relevant" | "more" | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === FEEDBACK_HELPFUL_LABEL.toLowerCase()) {
    return "helpful";
  }
  if (normalized === FEEDBACK_NOT_RELEVANT_LABEL.toLowerCase()) {
    return "not_relevant";
  }
  if (normalized === FEEDBACK_MORE_LABEL.toLowerCase()) {
    return "more";
  }
  return null;
}

function getPreferredSessionModesForMessage(messageText: string): RecommendationSessionMode[] {
  if (isLinksFollowUp(messageText)) {
    return ["catalog", "answer", "compare"];
  }
  if (isCompositionFollowUp(messageText)) {
    return ["compare", "catalog", "answer"];
  }
  if (isIndexedCompareFollowUp(messageText)) {
    return ["catalog", "compare", "answer"];
  }
  return ["catalog", "answer", "compare"];
}

function formatIngredientList(product: ProductMatch): string {
  if (product.ingredients.length === 0) {
    return "Полный состав в текущей базе не найден.";
  }
  return product.ingredients.join(", ");
}

function buildCompositionReply(session: RecommendationSession | null): string | null {
  if (!session || session.products.length === 0) {
    return null;
  }

  const products = session.products.slice(0, 2);
  const intro =
    products.length >= 2
      ? `Полные составы по последнему сравнению «${session.queryText}»:`
      : `Полный состав по последней выбранной позиции «${session.queryText}»:`;

  const blocks = products.map((product, index) =>
    [`${index + 1}. ${product.name}`, `Состав: ${formatIngredientList(product)}`].join("\n")
  );

  return [intro, "", ...blocks, buildProductLinks(products)].filter(Boolean).join("\n\n");
}

function buildSelectedProductsReply(session: RecommendationSession | null, messageText: string): string | null {
  if (!session || session.products.length === 0) {
    return null;
  }

  const requestedNumbers = extractRequestedProductNumbers(messageText);
  const indexes = extractRequestedProductNumbers(messageText)
    .map((value) => value - 1)
    .filter((value) => value >= 0 && value < session.products.length);

  if (indexes.length === 0) {
    return null;
  }

  const selected = indexes
    .map((index) => session.products[index])
    .filter((product, index, array) => array.findIndex((item) => item.id === product.id) === index);

  if (selected.length === 0) {
    return null;
  }

  if (requestedNumbers.length >= 2 && selected.length < 2) {
    return null;
  }

  if (selected.length === 1) {
    const [product] = selected;
    return [
      `Разбираю позицию ${indexes[0] + 1}: ${product.name}.`,
      "",
      `Почему подходит: ${buildProductReason(product)}`,
      `Ограничения: ${buildProductLimitations(product)}`,
      buildProductLinks([product])
    ]
      .filter(Boolean)
      .join("\n");
  }

  const [left, right] = selected;
  return [
    `Сравнил позиции ${indexes[0] + 1} и ${indexes[1] + 1} из последней подборки: ${left.name} и ${right.name}.`,
    "",
    `1. ${left.name}`,
    `Почему подходит: ${buildProductReason(left)}`,
    `Ограничения: ${buildProductLimitations(left)}`,
    "",
    `2. ${right.name}`,
    `Почему подходит: ${buildProductReason(right)}`,
    `Ограничения: ${buildProductLimitations(right)}`,
    "",
    `Итог: ${buildComparisonVerdict(left, right)}`,
    buildProductLinks([left, right])
  ]
    .filter(Boolean)
    .join("\n");
}

function selectProductsFromSession(session: RecommendationSession | null, messageText: string): ProductMatch[] {
  if (!session || session.products.length === 0) {
    return [];
  }

  const requestedNumbers = extractRequestedProductNumbers(messageText);
  const indexes = extractRequestedProductNumbers(messageText)
    .map((value) => value - 1)
    .filter((value) => value >= 0 && value < session.products.length);

  const selected = indexes
    .map((index) => session.products[index])
    .filter((product, index, array) => array.findIndex((item) => item.id === product.id) === index);

  if (requestedNumbers.length >= 2 && selected.length < 2) {
    return [];
  }

  return selected;
}

async function configureTelegramBotUi(bot: Bot<Context>): Promise<void> {
  await bot.api.setMyCommands(BOT_COMMANDS);
  await bot.api.setChatMenuButton({
    menu_button: {
      type: "commands"
    }
  });
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
      const response = await ctx.reply(formatStartMessage(), {
        reply_markup: createMainMenuKeyboard()
      });
      console.log("Handled /start successfully", {
        updateId: ctx.update.update_id,
        messageId: response.message_id
      });
    } catch (error) {
      console.error("Start handler reply failed", error);
      throw error;
    }
  });

  bot.command("profile", async (ctx) => {
    const telegramId = String(ctx.from?.id ?? ctx.chat.id);
    try {
      const profile = await userRepository.createUserIfMissing({
        telegramId,
        firstName: ctx.from?.first_name ?? null,
        username: ctx.from?.username ?? null
      });
      await showProfile(ctx, profile);
    } catch (error) {
      console.error("Profile command failed", error);
      await ctx.reply("Сейчас не получилось открыть профиль. Попробуйте чуть позже.", {
        reply_markup: createMainMenuKeyboard()
      });
    }
  });

  bot.command("quiz", async (ctx) => {
    const telegramId = String(ctx.from?.id ?? ctx.chat.id);
    try {
      const profile = await userRepository.createUserIfMissing({
        telegramId,
        firstName: ctx.from?.first_name ?? null,
        username: ctx.from?.username ?? null
      });
      await startQuestionnaire(ctx, cacheStore, telegramId, profile);
    } catch (error) {
      console.error("Quiz command failed", error);
      await ctx.reply("Сейчас не получилось запустить опросник. Попробуйте чуть позже.", {
        reply_markup: createMainMenuKeyboard()
      });
    }
  });

  bot.command("reset", async (ctx) => {
    const telegramId = String(ctx.from?.id ?? ctx.chat.id);
    try {
      const profile = await userRepository.createUserIfMissing({
        telegramId,
        firstName: ctx.from?.first_name ?? null,
        username: ctx.from?.username ?? null
      });
      await resetProfileData(ctx, telegramId, profile, userRepository, cacheStore);
    } catch (error) {
      console.error("Reset command failed", error);
      await ctx.reply("Сейчас не получилось стереть профиль. Попробуйте чуть позже.", {
        reply_markup: createMainMenuKeyboard()
      });
    }
  });

  bot.command("metrics", async (ctx) => {
    if (!isAdminContext(env, ctx)) {
      await ctx.reply("Эта команда доступна только администратору.", {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    try {
      const reply = await buildMetricsReply(cacheStore);
      await ctx.reply(reply, {
        reply_markup: createMainMenuKeyboard()
      });
    } catch (error) {
      console.error("Metrics command failed", error);
      await ctx.reply("Сейчас не получилось прочитать bot metrics. Попробуйте чуть позже.", {
        reply_markup: createMainMenuKeyboard()
      });
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (![FEEDBACK_HELPFUL, FEEDBACK_NOT_RELEVANT, FEEDBACK_MORE].includes(data)) {
      return;
    }

    const telegramId = String(ctx.from?.id ?? ctx.chat?.id ?? "");
    let recommendationSession: RecommendationSession | null = null;

    try {
      recommendationSession = await getRecommendationSession(cacheStore, telegramId, ["catalog", "answer", "compare"]);
    } catch (error) {
      console.error("Recommendation session access failed in callback", error);
    }

    const feedbackType =
      data === FEEDBACK_HELPFUL ? "helpful" : data === FEEDBACK_NOT_RELEVANT ? "not_relevant" : "more";

    await ctx.answerCallbackQuery({
      text: feedbackType === "helpful" ? "Сохранено" : feedbackType === "not_relevant" ? "Понял" : "Покажу, как расширить подбор"
    }).catch((error) => console.error("Callback answer failed", error));

    await handleFeedbackSignal(ctx, cacheStore, telegramId, feedbackType, recommendationSession);
  });

  bot.on("message:text", async (ctx) => {
    const messageText = ctx.message.text.trim();
    if (!messageText) {
      await ctx.reply("Напишите, пожалуйста, запрос текстом: тип кожи, проблему или желаемый эффект.");
      return;
    }

    if (messageText.startsWith("/")) {
      return;
    }

    const telegramId = String(ctx.from?.id ?? ctx.chat.id);
    let profile: UserProfile | null = null;
    let memorySummary: MemorySummary | null = null;
    let recommendationSession: RecommendationSession | null = null;

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
      recommendationSession = await getRecommendationSession(cacheStore, telegramId, getPreferredSessionModesForMessage(messageText));
    } catch (error) {
      console.error("Recommendation session access failed", error);
    }

    try {
      const questionnaireSession = await cacheStore.getJson<QuestionnaireSession>(questionnaireSessionKey(telegramId));
      if (questionnaireSession) {
        const handled = await handleQuestionnaireAnswer(
          ctx,
          messageText,
          telegramId,
          questionnaireSession,
          profile,
          userRepository,
          cacheStore
        );
        if (handled) {
          return;
        }
      }
    } catch (error) {
      console.error("Questionnaire flow failed", error);
      await ctx.reply("Не удалось обработать ответ в опроснике. Попробуйте начать заново.", {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    if (messageText === MENU_PICK_CARE) {
      await startQuestionnaire(ctx, cacheStore, telegramId, profile);
      return;
    }

    if (messageText === MENU_HOME) {
      await ctx.reply(formatStartMessage(), {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    if (messageText === MENU_SHOW_PROFILE) {
      await showProfile(ctx, profile);
      return;
    }

    if (messageText === MENU_RESET_PROFILE) {
      await resetProfileData(ctx, telegramId, profile, userRepository, cacheStore);
      return;
    }

    if (messageText === MENU_ASK_PRODUCT) {
      await ctx.reply(buildProductHelpMessage(), {
        reply_markup: createMainMenuKeyboard(),
        parse_mode: "Markdown"
      });
      return;
    }

    const feedbackMessage = parseFeedbackMessage(messageText);
    if (feedbackMessage) {
      await handleFeedbackSignal(ctx, cacheStore, telegramId, feedbackMessage, recommendationSession);
      return;
    }

    if (isAbusiveMessage(messageText)) {
      await ctx.reply(buildBoundaryReply(), {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    if (isShortAcknowledgement(messageText)) {
      await ctx.reply(buildAcknowledgementReply(), {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    if (isLinksFollowUp(messageText)) {
      const linksReply = buildLinksReply(recommendationSession);
      if (linksReply) {
        await ctx.reply(linksReply, {
          reply_markup: createMainMenuKeyboard()
        });
      } else {
        await recordBotMetric(cacheStore, "followup_links_miss", {
          telegramId,
          messageText
        }).catch((error) => console.error("Metric write failed", error));
        await ctx.reply("Пока не вижу последней подборки, к которой можно показать ссылки. Сначала попросите подобрать товары.", {
          reply_markup: createMainMenuKeyboard()
        });
      }
      return;
    }

    if (isCompositionFollowUp(messageText)) {
      const compositionReply = buildCompositionReply(recommendationSession);
      if (compositionReply) {
        await ctx.reply(compositionReply, {
          reply_markup: createMainMenuKeyboard()
        });
      } else {
        await recordBotMetric(cacheStore, "followup_compare_miss", {
          telegramId,
          messageText,
          reason: "composition_without_session"
        }).catch((error) => console.error("Metric write failed", error));
        await ctx.reply("Пока не вижу последней подборки, для которой можно показать составы. Сначала попросите подобрать или сравнить товары.", {
          reply_markup: createMainMenuKeyboard()
        });
      }
      return;
    }

    if (isIndexedCompareFollowUp(messageText)) {
      const selectedReply = buildSelectedProductsReply(recommendationSession, messageText);
      if (selectedReply) {
        const selectedProducts = selectProductsFromSession(recommendationSession, messageText);
        if (selectedProducts.length > 0) {
          await saveRecommendationSession(cacheStore, telegramId, messageText, selectedProducts, "compare").catch((error) =>
            console.error("Recommendation session save failed", error)
          );
        }
        await ctx.reply(selectedReply, {
          reply_markup: createMainMenuKeyboard()
        });
      } else {
        await recordBotMetric(cacheStore, "followup_compare_miss", {
          telegramId,
          messageText,
          reason: "indexed_compare_without_session"
        }).catch((error) => console.error("Metric write failed", error));
        await ctx.reply("Не вижу подходящей последней подборки для такого сравнения. Сначала попросите подобрать товары списком.", {
          reply_markup: createMainMenuKeyboard()
        });
      }
      return;
    }

    if (isIntimateZoneQuery(messageText) && hasMedicalRedFlags(messageText)) {
      await recordBotMetric(cacheStore, "unsafe_intent_blocked", {
        telegramId,
        messageText
      }).catch((error) => console.error("Metric write failed", error));
      await ctx.reply(buildIntimateMedicalBoundaryReply(), {
        reply_markup: createMainMenuKeyboard()
      });
      return;
    }

    try {
      const effectiveMessageText = resolveSearchMessage(messageText, memorySummary);
      const cacheKeyForReply = await createCacheKey(profile, effectiveMessageText);
      const cachedAnswer = await cacheStore.getJson<string>(cacheKeyForReply).catch(() => null);

      const requestedProductCount = getRequestedProductCount(effectiveMessageText);
      const effectiveProfile = shouldUseStoredProfile(effectiveMessageText) ? profile : null;
      const retrievalLimit = needsDeepFaceBrowsePool(effectiveMessageText)
        ? 48
        : needsBroadCatalogScan(effectiveMessageText)
          ? 24
          : Math.max(resultLimit, Math.min(requestedProductCount * 3, 24));
      const searchInput = buildSearchInput(effectiveProfile, effectiveMessageText, retrievalLimit);
      let matches: ProductMatch[] = [];
      try {
        matches = await qdrant.searchProducts(searchInput);
        const refinementLimit = needsBroadCatalogScan(effectiveMessageText) ? retrievalLimit : requestedProductCount;
        matches = refineMatches(effectiveProfile, effectiveMessageText, matches, refinementLimit);
        matches = diversifyCatalogMatches(effectiveMessageText, matches, requestedProductCount);
      } catch (error) {
        console.error("Qdrant retrieval failed, continuing without RAG context", error);
        await recordBotMetric(cacheStore, "qdrant_retrieval_failure", {
          telegramId,
          messageText: effectiveMessageText
        }).catch((metricError) => console.error("Metric write failed", metricError));
      }

      if (matches.length === 0) {
        await recordBotMetric(cacheStore, "empty_result", {
          telegramId,
          messageText: effectiveMessageText
        }).catch((error) => console.error("Metric write failed", error));
      }

      if (isBabyCareQuery(effectiveMessageText) && matches.length === 0) {
        const answer = buildBabyCareNoMatchReply();
        await cacheStore
          .setJson(cacheKeyForReply, answer, parseIntegerEnv(env.CACHE_TTL_SECONDS, 300))
          .catch((error) => console.error("Upstash cache write failed", error));
        await ctx.reply(answer, {
          reply_markup: createMainMenuKeyboard()
        });
        return;
      }

      if (isCompareIntent(effectiveMessageText)) {
        const selectedComparison = pickComparisonProducts(effectiveMessageText, matches);
        const answer = cachedAnswer ?? buildCompareReply(effectiveMessageText, matches);
        if (!cachedAnswer) {
          await cacheStore
            .setJson(cacheKeyForReply, answer, parseIntegerEnv(env.CACHE_TTL_SECONDS, 300))
            .catch((error) => console.error("Upstash cache write failed", error));
        }
        if (selectedComparison.length > 0) {
          await saveRecommendationSession(cacheStore, telegramId, effectiveMessageText, selectedComparison, "compare").catch((error) =>
            console.error("Recommendation session save failed", error)
          );
        }

        if (profile) {
          const summary = buildMemorySummary(profile, matches, effectiveMessageText);
          await userRepository
            .saveMemorySummary(profile.userId, summary)
            .catch((error) => console.error("Turso memory summary save failed", error));
        }

        await ctx.reply(answer, {
          reply_markup: createRecommendationFeedbackKeyboard()
        });
        return;
      }

      if (isCatalogWideIntent(effectiveMessageText)) {
        const answer = cachedAnswer ?? buildCatalogWideReply(effectiveMessageText, matches);
        if (!cachedAnswer) {
          await cacheStore
            .setJson(cacheKeyForReply, answer, parseIntegerEnv(env.CACHE_TTL_SECONDS, 300))
            .catch((error) => console.error("Upstash cache write failed", error));
        }
        if (matches.length > 0) {
          await saveRecommendationSession(cacheStore, telegramId, effectiveMessageText, matches, "catalog").catch((error) =>
            console.error("Recommendation session save failed", error)
          );
        }

        if (profile) {
          const summary = buildMemorySummary(profile, matches, effectiveMessageText);
          await userRepository
            .saveMemorySummary(profile.userId, summary)
            .catch((error) => console.error("Turso memory summary save failed", error));
        }

        await ctx.reply(answer, {
          reply_markup: createRecommendationFeedbackKeyboard()
        });
        return;
      }

      const answer =
        cachedAnswer ??
        (await llmClient.generateAnswer({
          userMessage: effectiveMessageText,
          userProfile: hasMeaningfulProfile(effectiveProfile) ? effectiveProfile : null,
          memorySummary,
          productMatches: matches,
          maxProducts: requestedProductCount
        }));

      if (!cachedAnswer) {
        await cacheStore
          .setJson(cacheKeyForReply, answer, parseIntegerEnv(env.CACHE_TTL_SECONDS, 300))
          .catch((error) => console.error("Upstash cache write failed", error));
      }
      if (matches.length > 0) {
        await saveRecommendationSession(cacheStore, telegramId, effectiveMessageText, matches.slice(0, requestedProductCount), "answer").catch(
          (error) => console.error("Recommendation session save failed", error)
        );
      }

      if (profile) {
        const summary = buildMemorySummary(profile, matches, effectiveMessageText);
        await userRepository
          .saveMemorySummary(profile.userId, summary)
          .catch((error) => console.error("Turso memory summary save failed", error));
      }

      await ctx.reply(answer, {
        reply_markup: createRecommendationFeedbackKeyboard()
      });
    } catch (error) {
      console.error("Knowledge or LLM flow failed", error);
      await recordBotMetric(cacheStore, "knowledge_failure", {
        telegramId,
        messageText
      }).catch((metricError) => console.error("Metric write failed", metricError));
      await ctx.reply(KNOWLEDGE_REFRESH_MESSAGE, {
        reply_markup: createMainMenuKeyboard()
      });
    }
  });

  const runtime: BotRuntime = {
    bot,
    cacheStore,
    bootstrap: Promise.all([
      userRepository.ensureSchema().catch((error) => {
        console.error("Turso bootstrap failed, bot will continue in degraded mode", error);
      }),
      configureTelegramBotUi(bot).catch((error) => {
        console.error("Telegram command UI bootstrap failed", error);
      }),
      bot.init().catch((error) => {
        console.error("grammY bot.init failed, continuing without cached bot info", error);
      })
    ])
      .then(() => undefined)
      .catch((error) => {
        runtimeCache.delete(cacheKey);
        throw error;
      })
  };

  runtimeCache.set(cacheKey, runtime);
  return runtime;
}

export async function handleTelegramUpdate(env: Env, update: Update): Promise<void> {
  const runtime = getBotRuntime(env);
  await runtime.bootstrap;
  const dedupeKey = processedUpdateKey(update.update_id);
  const reserved = await runtime.cacheStore
    .setIfAbsentJson(
      dedupeKey,
      {
        status: "processing",
        updateId: update.update_id,
        createdAt: new Date().toISOString()
      },
      60 * 10
    )
    .catch((error) => {
      console.error("Update dedupe reserve failed", error);
      return true;
    });

  if (!reserved) {
    console.log("Skipping duplicate or inflight Telegram update", extractUpdateSummary(update));
    return;
  }

  console.log("Received Telegram update", extractUpdateSummary(update));

  try {
    await runtime.bot.handleUpdate(update);
    await runtime.cacheStore
      .setJson(
        dedupeKey,
        {
          status: "done",
          updateId: update.update_id,
          handledAt: new Date().toISOString()
        },
        60 * 60 * 24
      )
      .catch((error) => {
        console.error("Update dedupe write failed", error);
      });
  } catch (error) {
    console.error("Unhandled Telegram update processing failure", {
      ...extractUpdateSummary(update),
      error
    });

    await recordBotMetric(runtime.cacheStore, "telegram_update_failure", extractUpdateSummary(update)).catch((metricError) => {
      console.error("Metric write failed", metricError);
    });

    await sendUpdateFailureFallback(runtime.bot, update).catch((fallbackError) => {
      console.error("Telegram update failure fallback send failed", fallbackError);
    });

    await runtime.cacheStore
      .setJson(
        dedupeKey,
        {
          status: "failed",
          updateId: update.update_id,
          failedAt: new Date().toISOString()
        },
        60 * 10
      )
      .catch((cacheError) => {
        console.error("Update failure state write failed", cacheError);
      });
  }
}
