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

function sanitizeModelAnswer(rawAnswer: string): string {
  const withoutThinkBlocks = rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return withoutThinkBlocks || rawAnswer.trim();
}

function formatProducts(products: LLMAnswerInput["productMatches"]): string {
  if (products.length === 0) {
    return "Релевантные товары не найдены.";
  }

  return products
    .map((product, index) => {
      const ingredientText = product.ingredients.length > 0 ? product.ingredients.slice(0, 12).join(", ") : "нет списка ингредиентов";
      const flagText = product.flags.length > 0 ? product.flags.join(", ") : "нет флагов";
      return [
        `#${index + 1}: ${product.name}`,
        `Бренд: ${product.brand}`,
        `Линия: ${product.line ?? "не указана"}`,
        `Категория: ${product.category ?? "не указана"}`,
        `Назначение: ${product.purpose ?? "не указано"}`,
        `Ингредиенты: ${ingredientText}`,
        `Флаги: ${flagText}`,
        `URL: ${product.sourceUrl ?? "нет"}`
      ].join("\n");
    })
    .join("\n\n");
}

function buildUserContext(input: LLMAnswerInput): string {
  const profile = input.userProfile;
  const memory = input.memorySummary?.summary ?? "Память пока пуста.";

  return [
    `Сообщение пользователя: ${input.userMessage}`,
    "Профиль пользователя:",
    `- Имя: ${profile?.firstName ?? "не указано"}`,
    `- Тип кожи: ${profile?.skinType ?? "не указан"}`,
    `- Жалобы: ${profile?.concerns.join(", ") || "не указаны"}`,
    `- Избегать отдушек: ${profile?.avoidFragrance ? "да" : "нет"}`,
    `- Предпочитать деликатный уход: ${profile?.preferGentle ? "да" : "нет"}`,
    `- Self-reported condition: ${profile?.selfReportedCondition ?? "не указано"}`,
    `Память: ${memory}`,
    `RAG-контекст:\n${formatProducts(input.productMatches)}`
  ].join("\n");
}

function buildNoMatchesAnswer(input: LLMAnswerInput): string {
  const profile = input.userProfile;
  const hints: string[] = [];

  if (profile?.skinType) {
    hints.push(`тип кожи: ${profile.skinType}`);
  }
  if (profile?.concerns.length) {
    hints.push(`жалобы: ${profile.concerns.join(", ")}`);
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

    try {
      return await this.callGroq(content);
    } catch (primaryError) {
      if (!this.openRouterApiKey) {
        throw primaryError;
      }
      return this.callOpenRouter(content);
    }
  }

  private async callGroq(userContent: string): Promise<string> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 700,
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

  private async callOpenRouter(userContent: string): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openRouterApiKey}`
      },
      body: JSON.stringify({
        model: this.openRouterModel,
        temperature: 0.2,
        max_tokens: 700,
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
