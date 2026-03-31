import { readFileSync } from "node:fs";
import path from "node:path";

import { QdrantClientAdapter } from "../src/adapters/qdrant/qdrant-client";
import type { Env } from "../src/env";
import type { ProductMatch } from "../src/types";

type Scenario = {
  name: string;
  queryText: string;
  limit: number;
  validate: (products: ProductMatch[]) => string[];
};

function loadEnvFromDevVars(): Env {
  const envPath = path.resolve(process.cwd(), ".dev.vars");
  const raw = readFileSync(envPath, "utf8");
  const env = {} as Record<string, string>;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env as unknown as Env;
}

function textOf(product: ProductMatch): string {
  return [product.name, product.category ?? "", product.purpose ?? "", product.line ?? ""].join(" ").toLowerCase();
}

function ingredientsOf(product: ProductMatch): string {
  return product.ingredients.join(", ").toLowerCase();
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function isCreamLike(product: ProductMatch): boolean {
  const text = textOf(product);
  return text.includes("крем") || text.includes("cream");
}

function isEyeArea(product: ProductMatch): boolean {
  const text = textOf(product);
  return includesAny(text, ["вокруг глаз", "для глаз", " и век", " век ", "eye"]);
}

function isCleanserLike(product: ProductMatch): boolean {
  return includesAny(textOf(product), ["очищ", "умыван", "пенк", "мицел", "демаки", "гидрофил", "молочко"]);
}

function isDecorative(product: ProductMatch): boolean {
  return includesAny(textOf(product), [
    "тональ",
    "bb крем",
    "вв крем",
    "cc крем",
    "dd крем",
    "ee крем",
    "ее крем",
    "консил",
    "пудр",
    "кушон",
    "макияж"
  ]);
}

function isAgeHeavy(product: ProductMatch): boolean {
  const text = textOf(product);
  return (
    includesAny(text, ["морщ", "лифт", "омолож", "prestige", "luxcare", "filler", "филлер", "retinol", "collagen", "q10", "dermage"]) ||
    /\b(?:25|30|35|40|45|50|55|60|65)\+/.test(text)
  );
}

function isExplicitPigmentation(product: ProductMatch): boolean {
  return includesAny(textOf(product), [
    "депигмент",
    "anti spot",
    "антипигмент",
    "против пигментации",
    "осветляющ",
    "пигментных пятен"
  ]);
}

function isSupportivePigmentation(product: ProductMatch): boolean {
  const text = textOf(product);
  const ingredients = ingredientsOf(product);
  return (
    isExplicitPigmentation(product) ||
    includesAny(text, ["витамин c", "niacinamide", "ниацинамид", "постакне", "bright", "brightening", "radiance", "ровный тон"]) ||
    includesAny(ingredients, ["niacinamide", "ниацинамид", "vitamin c", "аскорб", "arbutin", "арбутин", "tranex", "транекс", "kojic", "койев", "azel", "азелаин"])
  );
}

function isBarrierLike(product: ProductMatch): boolean {
  const text = textOf(product);
  const ingredients = ingredientsOf(product);
  return (
    includesAny(text, [
      "барьер",
      "восстанов",
      "атоп",
      "чувств",
      "реактив",
      "раздраж",
      "комфорт",
      "смягча",
      "успока",
      "panthenol urea",
      "oil крем",
      "pharmacos",
      "atopicontrol",
      "nutrition control",
      "hydro комфорт",
      "hydroderm"
    ]) ||
    includesAny(ingredients, ["ceramide", "церамид", "panthenol", "пантенол", "squalane", "сквалан", "urea", "мочевин", "allantoin", "аллантоин"])
  );
}

function isSensitiveDryLike(product: ProductMatch): boolean {
  return includesAny(textOf(product), ["сух", "атоп", "чувств", "comfort", "комфорт", "oil крем", "крем баттер", "panthenol urea", "pharmacos"]);
}

function validatePigmentation(products: ProductMatch[]): string[] {
  const issues: string[] = [];
  const top3 = products.slice(0, 3);
  if (products.length < 3) {
    issues.push("Выдано меньше 3 товаров.");
  }
  if (top3.length > 0 && !isExplicitPigmentation(top3[0])) {
    issues.push("Первый товар не выглядит явным anti-pigment средством.");
  }
  if (top3.some((product) => isDecorative(product) || isCleanserLike(product) || isEyeArea(product))) {
    issues.push("В top-3 попал декоративный, очищающий или eye-area продукт.");
  }
  if (top3.filter(isSupportivePigmentation).length < 3) {
    issues.push("Top-3 не выглядит цельным anti-pigment shortlist.");
  }
  if (top3.some((product) => isAgeHeavy(product) && !isExplicitPigmentation(product))) {
    issues.push("В top-3 остался anti-age шум без явной anti-pigment специализации.");
  }
  return issues;
}

function validateBarrier(products: ProductMatch[]): string[] {
  const issues: string[] = [];
  const top5 = products.slice(0, 5);
  if (top5.length < 5) {
    issues.push("Выдано меньше 5 товаров.");
  }
  if (top5.slice(0, 3).filter(isBarrierLike).length < 3) {
    issues.push("Top-3 не выглядит как чистая barrier-подборка.");
  }
  if (top5.some((product) => isDecorative(product) || isCleanserLike(product) || isEyeArea(product))) {
    issues.push("В barrier shortlist попал нерелевантный specialist-шум.");
  }
  if (top5.some((product) => isAgeHeavy(product) && !isBarrierLike(product))) {
    issues.push("В barrier shortlist остался anti-age шум.");
  }
  return issues;
}

function validateSensitive(products: ProductMatch[]): string[] {
  const issues: string[] = [];
  const top4 = products.slice(0, 4);
  if (products.length < 4) {
    issues.push("Выдано меньше 4 товаров.");
  }
  if (!products.slice(0, 3).some((product) => product.name.includes("OIL-КРЕМ"))) {
    issues.push("OIL-КРЕМ не попал в top-3.");
  }
  if (top4.filter(isSensitiveDryLike).length < 4) {
    issues.push("Top-4 не выглядит достаточно dry/sensitive ориентированным.");
  }
  if (top4.some((product) => isDecorative(product) || isCleanserLike(product) || isEyeArea(product))) {
    issues.push("В sensitive dry shortlist попал нерелевантный продукт.");
  }
  return issues;
}

function validateGeneralFaceCreams(products: ProductMatch[]): string[] {
  const issues: string[] = [];
  if (products.length < 8) {
    issues.push("Выдано слишком мало face creams для обзорного списка.");
  }
  if (products.some((product) => !isCreamLike(product))) {
    issues.push("В общем cream-list есть товары без явного cream-формата.");
  }
  if (products.some((product) => isDecorative(product) || isCleanserLike(product) || isEyeArea(product))) {
    issues.push("В общем cream-list остались decorative/cleanser/eye-area товары.");
  }
  if (products.filter((product) => isAgeHeavy(product)).length > 2) {
    issues.push("В общем cream-list слишком много anti-age шума.");
  }
  return issues;
}

const scenarios: Scenario[] = [
  {
    name: "Pigmentation browse",
    queryText: "что взять у Belita для пигментации",
    limit: 6,
    validate: validatePigmentation
  },
  {
    name: "Barrier creams",
    queryText: "подбери 5 кремов Belita для восстановления барьера",
    limit: 5,
    validate: validateBarrier
  },
  {
    name: "Sensitive dry face",
    queryText: "что у Belita есть для чувствительной сухой кожи лица",
    limit: 6,
    validate: validateSensitive
  },
  {
    name: "General face creams",
    queryText: "Напиши 10 кремов для лица и оценку по 10 балльной системе каждого из них",
    limit: 10,
    validate: validateGeneralFaceCreams
  }
];

async function main(): Promise<void> {
  const env = loadEnvFromDevVars();
  const client = new QdrantClientAdapter(env);
  let failed = false;

  for (const scenario of scenarios) {
    const products = await client.searchProducts({
      queryText: scenario.queryText,
      skinTypes: [],
      concerns: [],
      excludeFragrance: false,
      requireGentle: false,
      limit: scenario.limit
    });

    const issues = scenario.validate(products);
    console.log(`\n=== ${scenario.name} ===`);
    console.log(`Query: ${scenario.queryText}`);
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name}`);
    });

    if (issues.length === 0) {
      console.log("Status: PASS");
    } else {
      failed = true;
      console.log("Status: FAIL");
      issues.forEach((issue) => console.log(`- ${issue}`));
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

await main();
