import { requireEnv, type Env } from "../../env";
import { SYSTEM_PROMPT } from "../../prompts/system-prompt";
import type { LLMAnswerInput } from "../../types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const DEFAULT_PRODUCT_LIMIT = 3;
const MAX_PRODUCT_LIMIT = 10;

function getAnswerProductLimit(input: LLMAnswerInput): number {
  const requested = input.maxProducts ?? DEFAULT_PRODUCT_LIMIT;
  return Math.max(1, Math.min(requested, MAX_PRODUCT_LIMIT));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`«»„“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function translateSkinType(value: string): string {
  switch (value) {
    case "dry":
      return "сухая";
    case "oily":
      return "жирная";
    case "combination":
      return "комбинированная";
    case "sensitive":
      return "чувствительная";
    case "barrier_impaired":
      return "с нарушенным барьером";
    case "acne_prone":
      return "склонная к высыпаниям";
    default:
      return value;
  }
}

function translateConcern(value: string): string {
  switch (value) {
    case "dryness":
      return "увлажнение и сухость";
    case "barrier_support":
      return "восстановление барьера";
    case "breakouts":
      return "высыпания";
    case "pigmentation":
      return "пигментация";
    case "anti_age":
      return "anti-age";
    case "cleansing":
      return "очищение";
    case "targeted_treatment":
      return "точечный уход";
    case "texture":
      return "текстура кожи";
    default:
      return value;
  }
}

function formatHumanFlags(flags: string[]): string {
  const labels: string[] = [];

  if (flags.includes("fragrance_free")) labels.push("без отдушки");
  if (flags.includes("gentle_fit")) labels.push("мягкая формула");
  if (flags.includes("has_barrier_support")) labels.push("есть барьерная поддержка");
  if (flags.includes("has_soothing_agents")) labels.push("есть успокаивающие компоненты");
  if (flags.includes("has_humectants")) labels.push("есть увлажняющие компоненты");
  if (flags.includes("has_acids")) labels.push("есть кислоты");
  if (flags.includes("has_retinoid")) labels.push("есть ретиноид");
  if (flags.includes("has_drying_alcohol")) labels.push("есть риск пересушивания");

  return labels.length > 0 ? labels.join(", ") : "без явных спецпометок";
}

function formatHumanProfileList(values: string[], translator: (value: string) => string): string {
  if (values.length === 0) {
    return "не указаны";
  }
  return values.map(translator).join(", ");
}

function sanitizeModelAnswer(rawAnswer: string): string {
  const withoutThinkBlocks = rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const base = withoutThinkBlocks || rawAnswer.trim();
  const paragraphs = base
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  while (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1];
    if (/^(хотите|нужно ли|если хотите|могу также|могу подобрать)/i.test(last) || last.endsWith("?")) {
      paragraphs.pop();
      continue;
    }
    break;
  }

  return paragraphs
    .join("\n\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

function countRecommendedProducts(answer: string, limit: number): number {
  const contentBeforeLinks = answer.split(/ссылки на продукты:/i)[0] ?? answer;
  const matches = contentBeforeLinks.match(/^\d+\.\s+/gm);
  return Math.min(matches?.length ?? 0, limit);
}

function appendProductLinks(answer: string, products: LLMAnswerInput["productMatches"], limit: number): string {
  const normalizedAnswer = normalizeText(answer);
  const mentionedProducts = products.filter((product) => normalizedAnswer.includes(normalizeText(product.name)));
  const recommendedCount = countRecommendedProducts(answer, limit);
  const baseProducts =
    recommendedCount > 0
      ? mentionedProducts.length >= recommendedCount
        ? mentionedProducts.slice(0, recommendedCount)
        : products.slice(0, recommendedCount)
      : (mentionedProducts.length > 0 ? mentionedProducts : products).slice(0, limit);

  const linkProducts = baseProducts.filter((product) => Boolean(product.sourceUrl));

  const withLinks = linkProducts.map((product, index) => `${index + 1}. ${product.name}: ${product.sourceUrl}`);

  if (withLinks.length === 0) {
    return answer;
  }

  const existingLinkFound = withLinks.some((line) => answer.includes(line.split(": ").at(-1) ?? ""));
  if (existingLinkFound) {
    return answer;
  }

  return [answer, "Ссылки на продукты:", ...withLinks].join("\n");
}

function formatProducts(products: LLMAnswerInput["productMatches"], limit: number): string {
  if (products.length === 0) {
    return "Релевантные товары не найдены.";
  }

  return products
    .slice(0, limit)
    .map((product, index) => {
      const ingredientText = product.ingredients.length > 0 ? product.ingredients.slice(0, 8).join(", ") : "нет списка ингредиентов";
      return [
        `#${index + 1}: ${product.name}`,
        `Бренд: ${product.brand}`,
        `Линия: ${product.line ?? "не указана"}`,
        `Категория: ${product.category ?? "не указана"}`,
        `Назначение: ${product.purpose ?? "не указано"}`,
        `Подходит по признакам: ${formatHumanProfileList(product.skinTypes, translateSkinType)}`,
        `Задачи: ${formatHumanProfileList(product.concerns, translateConcern)}`,
        `Ингредиенты: ${ingredientText}`,
        `Сильные стороны и ограничения: ${formatHumanFlags(product.flags)}`,
        `URL: ${product.sourceUrl ?? "нет"}`
      ].join("\n");
    })
    .join("\n\n");
}

function buildUserContext(input: LLMAnswerInput): string {
  const profile = input.userProfile;
  const memory = input.memorySummary?.summary ?? "Память пока пуста.";
  const limit = getAnswerProductLimit(input);

  return [
    `Сообщение пользователя: ${input.userMessage}`,
    "Профиль пользователя:",
    `- Имя: ${profile?.firstName ?? "не указано"}`,
    `- Тип кожи: ${profile?.skinType ? translateSkinType(profile.skinType) : "не указан"}`,
    `- Жалобы: ${profile ? formatHumanProfileList(profile.concerns, translateConcern) : "не указаны"}`,
    `- Избегать отдушек: ${profile?.avoidFragrance ? "да" : "нет"}`,
    `- Предпочитать деликатный уход: ${profile?.preferGentle ? "да" : "нет"}`,
    `- Self-reported condition: ${profile?.selfReportedCondition ?? "не указано"}`,
    `Память: ${memory}`,
    `RAG-контекст:\n${formatProducts(input.productMatches, limit)}`
  ].join("\n");
}

function buildNoMatchesAnswer(input: LLMAnswerInput): string {
  const profile = input.userProfile;
  const hints: string[] = [];

  if (profile?.skinType) {
    hints.push(`тип кожи: ${translateSkinType(profile.skinType)}`);
  }
  if (profile?.concerns.length) {
    hints.push(`жалобы: ${formatHumanProfileList(profile.concerns, translateConcern)}`);
  }
  if (profile?.avoidFragrance) {
    hints.push("без отдушек");
  }
  if (profile?.selfReportedCondition) {
    hints.push(`self-reported condition: ${profile.selfReportedCondition}`);
  }

  const hintLine = hints.length > 0 ? `Уже вижу контекст: ${hints.join("; ")}.` : "";

  return [
    "Пока я не нашел точный товар в текущей базе Belita/Vitex под такой запрос.",
    hintLine,
    "Я не врач, но могу помочь сузить подбор безопаснее.",
    "Уточните, пожалуйста, 2 вещи:",
    "1. Для какой зоны нужен уход: лицо, руки, тело, детская кожа или интимно-чувствительная зона?",
    "2. Что важнее: увлажнение, защита от раздражения, восстановление барьера или средство без отдушек?",
    "После этого я подберу максимально близкий вариант из текущего каталога."
  ]
    .filter(Boolean)
    .join("\n");
}

export class GroqClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly openRouterApiKey?: string;
  private readonly openRouterModel: string;

  constructor(env: Env) {
    this.apiKey = requireEnv("GROQ_API_KEY", env.GROQ_API_KEY);
    this.model = env.GROQ_MODEL || "qwen/qwen3-32b";
    this.openRouterApiKey = env.OPENROUTER_API_KEY;
    this.openRouterModel = env.OPENROUTER_MODEL || "openrouter/free";
  }

  async generateAnswer(input: LLMAnswerInput): Promise<string> {
    if (input.productMatches.length === 0) {
      return buildNoMatchesAnswer(input);
    }

    const content = buildUserContext(input);
    const productLimit = getAnswerProductLimit(input);
    const maxTokens = productLimit > 5 ? 1600 : 950;

    try {
      const answer = await this.callGroq(content, maxTokens);
      return appendProductLinks(answer, input.productMatches, productLimit);
    } catch (primaryError) {
      if (!this.openRouterApiKey) {
        throw primaryError;
      }
      const answer = await this.callOpenRouter(content, maxTokens);
      return appendProductLinks(answer, input.productMatches, productLimit);
    }
  }

  private async callGroq(userContent: string, maxTokens: number): Promise<string> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("Groq returned an empty answer");
    }
    return sanitizeModelAnswer(answer);
  }

  private async callOpenRouter(userContent: string, maxTokens: number): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openRouterApiKey}`
      },
      body: JSON.stringify({
        model: this.openRouterModel,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("OpenRouter returned an empty answer");
    }
    return sanitizeModelAnswer(answer);
  }
}
