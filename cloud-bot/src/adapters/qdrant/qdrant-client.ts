import { parseIntegerEnv, requireEnv, type Env } from "../../env";
import type { ProductMatch, QdrantSearchInput } from "../../types";

interface QdrantPointPayload {
  product_id?: number | string;
  name?: string;
  brand?: string;
  line?: string | null;
  category?: string | null;
  purpose?: string | null;
  ingredients?: string[];
  flags?: string[];
  skin_types?: string[];
  concerns?: string[];
  source_url?: string | null;
}

interface QdrantSearchPoint {
  id: string | number;
  score?: number;
  payload?: QdrantPointPayload;
}

interface QdrantSearchResponse {
  result?: QdrantSearchPoint[];
}

interface QdrantQueryResponse {
  result?: {
    points?: QdrantSearchPoint[];
  };
}

interface QdrantScrollResponse {
  result?: {
    points?: QdrantSearchPoint[];
    next_page_offset?: string | number | Record<string, unknown> | null;
  };
}

interface SearchableFields {
  name: string;
  line: string;
  category: string;
  purpose: string;
  flags: string;
  ingredients: string;
  sourceUrl: string;
}

type ProductScope =
  | "face"
  | "hair"
  | "body"
  | "hands"
  | "feet"
  | "baby"
  | "men"
  | "makeup"
  | "professional"
  | "intimate"
  | "oral"
  | "unknown";

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQueryTokens(queryText: string): string[] {
  const stopwords = new Set([
    "для",
    "или",
    "как",
    "что",
    "это",
    "мне",
    "нужен",
    "нужна",
    "нужно",
    "подбери",
    "подберите",
    "хочу",
    "есть",
    "без",
    "the",
    "and"
  ]);

  return [...new Set(normalizeSearchText(queryText).split(" ").filter((token) => token.length >= 3 && !stopwords.has(token)))];
}

function buildFilter(input: QdrantSearchInput): Record<string, unknown> | undefined {
  const must: Record<string, unknown>[] = [];

  if (input.skinTypes.length > 0) {
    must.push({
      key: "skin_types",
      match: { any: input.skinTypes }
    });
  }

  if (input.concerns.length > 0) {
    must.push({
      key: "concerns",
      match: { any: input.concerns }
    });
  }

  if (input.excludeFragrance) {
    must.push({
      key: "is_fragrance_free",
      match: { value: true }
    });
  }

  if (input.requireGentle) {
    must.push({
      key: "gentle_fit",
      match: { value: true }
    });
  }

  return must.length > 0 ? { must } : undefined;
}

function normalizePoint(point: QdrantSearchPoint): ProductMatch | null {
  const payload = point.payload;
  if (!payload?.name) {
    return null;
  }

  return {
    id: String(payload.product_id ?? point.id),
    score: Number(point.score ?? 0),
    name: payload.name,
    brand: payload.brand ?? "Belita/Vitex",
    line: payload.line ?? null,
    category: payload.category ?? null,
    purpose: payload.purpose ?? null,
    ingredients: Array.isArray(payload.ingredients) ? payload.ingredients.map((value) => String(value)) : [],
    flags: Array.isArray(payload.flags) ? payload.flags.map((value) => String(value)) : [],
    skinTypes: Array.isArray(payload.skin_types) ? payload.skin_types.map((value) => String(value)) : [],
    concerns: Array.isArray(payload.concerns) ? payload.concerns.map((value) => String(value)) : [],
    sourceUrl: payload.source_url ?? null
  };
}

function includesAny(values: string[], wanted: string[]): boolean {
  if (values.length === 0 || wanted.length === 0) {
    return false;
  }
  const valueSet = new Set(values.map((value) => value.toLowerCase()));
  return wanted.some((item) => valueSet.has(item.toLowerCase()));
}

function detectRequestedScopes(queryText: string): ProductScope[] {
  const normalized = normalizeSearchText(queryText);
  const scopes = new Set<ProductScope>();

  if (/(лиц|кож[аи]? лица|кремы для лица|вокруг глаз|ресниц|бров)/.test(normalized)) scopes.add("face");
  if (/(волос|шампун|маск[аи] для волос|бальзам|кондиционер|стайлинг|краск)/.test(normalized)) scopes.add("hair");
  if (/(тело|гель для душа|лосьон для тела|скраб для тела|баттер|дезодорант|body)/.test(normalized)) scopes.add("body");
  if (/(рук|ладон|маникюр)/.test(normalized)) scopes.add("hands");
  if (/(ног|стоп|педикюр|мозол|пятк)/.test(normalized)) scopes.add("feet");
  if (/(младен|новорож|груднич|малыш|ребен|ребён|детск|baby|крошка)/.test(normalized)) scopes.add("baby");
  if (/(муж|бород|брить|after shave|for men)/.test(normalized)) scopes.add("men");
  if (/(помад|туш|тональ|пудр|румян|консилер|bb крем|cc крем|карандаш|блеск|лак)/.test(normalized)) scopes.add("makeup");
  if (/(professional|профессион|prof|салон|peel home|mezocomplex|expert white|premium)/.test(normalized)) scopes.add("professional");
  if (/(интим)/.test(normalized)) scopes.add("intimate");
  if (/(зуб|полост[ьи] рта|ополаскиватель|oral)/.test(normalized)) scopes.add("oral");

  if (scopes.size === 0 && /(крем|сыворот|маск|тоник|spf|спф|пигмент|акне|барьер|сух|чувств|высып)/.test(normalized)) {
    scopes.add("face");
  }

  return [...scopes];
}

function detectProductScopes(product: ProductMatch): ProductScope[] {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line} ${searchable.sourceUrl}`;
  const scopes = new Set<ProductScope>();

  if (
    /(для лица|кремы для лица|сыворотки для лица|тоники|средства для очищения|вокруг глаз|лиц|creams for face|serum for the face|kremy dnevnye|kremy nochnye|kremy 24 chasa)/.test(
      text
    )
  ) {
    scopes.add("face");
  }
  if (
    /(волос|шампун|бальзамы и кондиционеры|уход за волосами|краски для волос|спреи для волос|sprays for hair|oil for hair|shampuni|balzamy i konditsionery)/.test(
      text
    )
  ) {
    scopes.add("hair");
  }
  if (
    /(тело|гели для душа|лосьон|баттер|скраб|дезодорант|body|geli dlya dusha|katalog kremy |molochko dlya tela|maslo dlya tela|bath salt)/.test(
      text
    )
  ) {
    scopes.add("body");
  }
  if (/(рук|кремы для рук|маникюр)/.test(text)) scopes.add("hands");
  if (/(ног|стоп|products for hands and feet|feet|педикюр|мозол|пятк|ногтей и кутикулы)/.test(text)) scopes.add("feet");
  if (/(детск|baby|крошка|младен|новорож|для детей|для младенцев)/.test(text)) scopes.add("baby");
  if (/(men|муж|брить|бород|after shave)/.test(text)) scopes.add("men");
  if (/(помад|туш|тональ|пудр|румян|консилер|bb крем|cc крем|карандаш|блеск|лак|декоратив)/.test(text)) scopes.add("makeup");
  if (/(professional|профессион|prof|peel home|mezocomplex|expert white|premium)/.test(text)) scopes.add("professional");
  if (/(интим)/.test(text)) scopes.add("intimate");
  if (/(зуб|oral|ополаскиватель)/.test(text)) scopes.add("oral");

  if (scopes.size === 0) {
    scopes.add("unknown");
  }

  return [...scopes];
}

function computeScopeScore(product: ProductMatch, queryText: string): number {
  const requestedScopes = detectRequestedScopes(queryText);
  if (requestedScopes.length === 0) {
    return 0;
  }

  const productScopes = detectProductScopes(product);
  let score = 0;

  for (const scope of requestedScopes) {
    if (productScopes.includes(scope)) {
      score += 24;
    }
  }

  if (requestedScopes.includes("face")) {
    if (productScopes.includes("hair") || productScopes.includes("body") || productScopes.includes("hands") || productScopes.includes("feet")) {
      score -= 35;
    }
  }

  if (requestedScopes.includes("hair")) {
    if (productScopes.includes("face") || productScopes.includes("body") || productScopes.includes("feet")) {
      score -= 30;
    }
  }

  if (requestedScopes.includes("feet")) {
    if (productScopes.includes("face") || productScopes.includes("hair") || productScopes.includes("makeup")) {
      score -= 40;
    }
  }

  if (requestedScopes.includes("baby")) {
    if (!productScopes.includes("baby")) {
      score -= 50;
    }
  }

  if (requestedScopes.includes("makeup")) {
    if (!productScopes.includes("makeup")) {
      score -= 30;
    }
  }

  return score;
}

function computeProfileScore(product: ProductMatch, input: QdrantSearchInput): number {
  let score = 0;

  if (input.skinTypes.length > 0 && includesAny(product.skinTypes, input.skinTypes)) {
    score += 10;
  }

  const concernMatches = input.concerns.filter((concern) =>
    product.concerns.map((value) => value.toLowerCase()).includes(concern.toLowerCase())
  ).length;
  score += concernMatches * 7;

  const hasFragrance = product.flags.some((flag) => flag === "has_fragrance");
  if (input.excludeFragrance) {
    score += hasFragrance ? -10 : 8;
  }

  if (input.requireGentle) {
    const gentleSignals = new Set([
      "gentle_fit",
      "has_soothing_agents",
      "has_barrier_support",
      "has_humectants"
    ]);
    const gentleMatch = product.flags.some((flag) => gentleSignals.has(flag));
    score += gentleMatch ? 8 : -5;

    if (product.flags.includes("has_retinoid")) {
      score -= 14;
    }
    if (product.flags.includes("has_acids")) {
      score -= 8;
    }
    if (product.flags.includes("has_drying_alcohol")) {
      score -= 10;
    }
  }

  return score;
}

function getSearchableFields(product: ProductMatch): SearchableFields {
  return {
    name: normalizeSearchText(product.name),
    line: normalizeSearchText(product.line ?? ""),
    category: normalizeSearchText(product.category ?? ""),
    purpose: normalizeSearchText(product.purpose ?? ""),
    flags: normalizeSearchText(product.flags.join(" ")),
    ingredients: normalizeSearchText(product.ingredients.join(" ")),
    sourceUrl: normalizeSearchText(product.sourceUrl ?? "")
  };
}

function computeConcernIntentScore(product: ProductMatch, queryText: string, input: QdrantSearchInput): number {
  const normalizedQuery = normalizeSearchText(queryText);
  const searchable = getSearchableFields(product);
  const haystack = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.ingredients}`;
  let score = 0;

  const wantsPigmentation = input.concerns.includes("pigmentation") || /(пигмент|пятн|осветл|тон кожи)/.test(normalizedQuery);
  if (wantsPigmentation) {
    if (/(пигмент|осветл|витамин c|ниацинамид|азелаин|glycol|против веснушек|anti spot)/.test(haystack)) {
      score += 10;
    }
    if (/(пигментных пятен|веснушек|умного осветления|осветления кожи)/.test(haystack)) {
      score += 20;
    }
    if (isDedicatedPigmentationCareProduct(product)) {
      score += 34;
    } else if (isPrimaryPigmentationCareProduct(product)) {
      score += 28;
    } else if (isPigmentationSupportProduct(product)) {
      score += 18;
    }
    if (isStrictCreamProduct(product)) {
      score += 8;
    }
    if (!isPigmentationSupportProduct(product)) {
      score -= 16;
    }
    if (isDecorativeFaceProduct(product)) {
      score -= 40;
    }
    if (isCleanserProduct(product)) {
      score -= 32;
    }
    if (isSprayProduct(product)) {
      score -= 24;
    }
    if (isEyeAreaProduct(product)) {
      score -= 18;
    }
    if (isHighlightProduct(product)) {
      score -= 18;
    }
    if (isBlemishProduct(product) && !isPigmentationSupportProduct(product)) {
      score -= 16;
    }
    if (isAgeSpecificProduct(product) && !isPrimaryPigmentationCareProduct(product)) {
      score -= 24;
    }
    if (isAntiAgeSpecialistProduct(product) && !isPrimaryPigmentationCareProduct(product)) {
      score -= 18;
    }
  }

  const wantsBreakoutCare = input.concerns.includes("breakouts") || /(акне|высып|пор|черн|воспал)/.test(normalizedQuery);
  if (wantsBreakoutCare) {
    if (/(акне|анти акне|сужение пор|азелаин|цинк|ниацинамид|серебр|противовоспал)/.test(haystack)) {
      score += 16;
    }
  }

  const wantsBarrierOrDryness =
    input.concerns.includes("barrier_support") ||
    input.concerns.includes("dryness") ||
    /(барьер|сух|обезвож|чувств|раздраж|атоп|восстанов)/.test(normalizedQuery);
  if (wantsBarrierOrDryness) {
    if (
      /(церамид|пантенол|эмолент|атоп|чувств|восстанов|ультраувлаж|гиалур|бетаин|аллантоин|sensitivity|atopi|барьер)/.test(
        haystack
      )
    ) {
      score += 16;
    }
    if (isDedicatedBarrierCareProduct(product)) {
      score += 30;
    } else if (isPrimaryBarrierCareProduct(product)) {
      score += 24;
    } else if (isSupportiveBarrierCareProduct(product)) {
      score += 12;
    }
    if (isAgeSpecificProduct(product) && !isDedicatedBarrierCareProduct(product)) {
      score -= 18;
    }
    if (isBarrierNoiseSpecialistProduct(product)) {
      score -= 20;
    }
  }

  return score;
}

function computeCatalogListScore(product: ProductMatch, queryText: string): number {
  if (!isGenericCatalogCreamListIntent(queryText)) {
    return 0;
  }

  let score = 0;
  const theme = detectCreamTheme(product);
  if (isGeneralDailyFaceCreamProduct(product)) {
    score += 18;
  } else if (isStrictCreamProduct(product)) {
    score += 2;
  } else {
    score -= 30;
  }
  if (isDecorativeFaceProduct(product)) score -= 40;
  if (isCleanserProduct(product) || isSprayProduct(product)) score -= 24;
  if (isGeneralFaceCreamSpecialistProduct(product)) score -= 24;
  if (isAntiAgeSpecialistProduct(product)) score -= 10;
  if (theme === "barrier") score += 8;
  if (theme === "hydration") score += 7;
  if (theme === "universal") score += 5;
  if (theme === "spf") score -= 4;
  if (theme === "pigmentation") score -= 6;
  if (theme === "night") score -= 3;
  if (theme === "anti_age") score -= 10;
  if (isAgeSpecificProduct(product)) score -= 12;
  return score;
}

function computeIntentScore(product: ProductMatch, queryText: string): number {
  const normalizedQuery = normalizeSearchText(queryText);
  const searchable = getSearchableFields(product);
  const categoryAndName = `${searchable.category} ${searchable.name}`;
  let score = 0;

  const intentRules = [
    {
      query: /(крем|cream)/,
      positive: /(крем)/,
      negative: /(сыворот|маск|тоник|лосьон|гель для душа|шампун|помад|тушь|пудр|карандаш)/
    },
    {
      query: /(сыворот|serum)/,
      positive: /(сыворот|концентрат|корректор)/,
      negative: /(крем|гель для душа|шампун|помад|пудр)/
    },
    {
      query: /(умывал|очищ|пенк|гель для умы|мицел|демаки|гидрофил)/,
      positive: /(средства для очищения|умыв|мицел|демаки|гидрофил|пенк|энзимн)/,
      negative: /(крем|сыворот|маск|шампун|гель для душа|помад|пудр)/
    },
    {
      query: /(тоник|тонер|лосьон)/,
      positive: /(тоник|тонер|лосьон)/,
      negative: /(крем|сыворот|шампун|гель для душа|помад)/
    },
    {
      query: /(маск)/,
      positive: /(маск)/,
      negative: /(крем|сыворот|шампун|гель для душа)/
    },
    {
      query: /(spf|спф|санскрин|защит)/,
      positive: /(spf|уф|uv|защит)/,
      negative: /(ночн|сыворот|шампун|гель для душа)/
    }
  ];

  for (const rule of intentRules) {
    if (!rule.query.test(normalizedQuery)) {
      continue;
    }
    if (rule.positive.test(categoryAndName) || rule.positive.test(searchable.purpose)) {
      score += 18;
    } else if (rule.negative.test(categoryAndName)) {
      score -= 12;
    }
  }

  const faceCareQuery = /(лиц|кож|сух|жир|чувств|барьер|пигмент|акне|высып|умывал|сыворот|крем|тоник|маск|spf)/.test(
    normalizedQuery
  );
  const explicitNonFaceScope = /(волос|тело|душ|губ|рук|ног|интим|брить|ресниц|бров)/.test(normalizedQuery);
  if (faceCareQuery && !explicitNonFaceScope) {
    if (/(для лица|лиц|кремы для лица|сыворотки для лица|уход за лицом|средства для очищения|тоники)/.test(categoryAndName)) {
      score += 16;
    }
    if (/(интим|стоп|ног|рук|тело|гели для душа|шампун|волос|помад|карандаш|тушь|пудр|румян|уборк|брить)/.test(categoryAndName)) {
      score -= 80;
    }
  }

  return score;
}

function computeLexicalScore(product: ProductMatch, queryText: string): number {
  const tokens = extractQueryTokens(queryText);
  if (tokens.length === 0) {
    return 0;
  }

  const searchable = getSearchableFields(product);

  let score = 0;
  for (const token of tokens) {
    if (searchable.name.includes(token)) score += 5;
    if (searchable.category.includes(token)) score += 4;
    if (searchable.purpose.includes(token)) score += 3;
    if (searchable.line.includes(token)) score += 2;
    if (searchable.flags.includes(token)) score += 2;
    if (searchable.ingredients.includes(token)) score += 1;
  }

  if (/крем/.test(queryText.toLowerCase()) && /крем/.test(searchable.category)) {
    score += 3;
  }

  return score;
}

function isFaceCareQuery(queryText: string): boolean {
  const normalizedQuery = normalizeSearchText(queryText);
  const mentionsNonFace = /(волос|тело|душ|губ|рук|ног|стоп|интим|брить|ресниц|бров|детск)/.test(normalizedQuery);
  if (mentionsNonFace) {
    return false;
  }
  return /(лиц|кож|сух|жир|чувств|барьер|пигмент|акне|высып|умывал|сыворот|крем|тоник|маск|spf)/.test(normalizedQuery);
}

function isBabyCareQuery(queryText: string): boolean {
  const normalizedQuery = normalizeSearchText(queryText);
  return /(младен|новорож|груднич|малыш|ребен|ребён|детск|baby|крошка)/.test(normalizedQuery);
}

function isFaceCareProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category}`;
  if (/(интим|стоп|ног|рук|тело|гели для душа|шампун|волос|помад|карандаш|тушь|пудр|румян|уборк|брить|детск|baby|крошка)/.test(text)) {
    return false;
  }
  return /(для лица|лиц|кремы для лица|сыворотки для лица|уход за лицом|средства для очищения|тоники|кремы дневные|кремы ночные|кремы 24 часа|средства для очищения кожи)/.test(
    text
  );
}

function isBabyCareProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return /(детск|baby|крошка|младен|новорож|малыш|для детей|для младенцев)/.test(text);
}

function isPigmentationQuery(queryText: string): boolean {
  return /(пигмент|пятн|осветл|депигмент|постакне|тон кожи)/.test(normalizeSearchText(queryText));
}

function isGenericCatalogCreamListIntent(queryText: string): boolean {
  const normalized = normalizeSearchText(queryText);
  const isWideList =
    /((что|какие).*(есть|у belita)|вся линейк|вся база|список|топ|напиши\s+\d+|подбери\s+\d+|покажи\s+\d+|оценк|рейтинг)/.test(
      normalized
    );
  if (!isWideList || !/(крем)/.test(normalized)) {
    return false;
  }
  if (/(anti age|анти эйдж|анти-эйдж|морщ|омолож|лифт)/.test(normalized)) {
    return false;
  }
  return !/(чувств|сух|жир|комб|барьер|высып|акне|пигмент|купероз|розаце|атоп|чист|увлаж|spf|спф)/.test(normalized);
}

function isCleanserProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(очищ|умыван|пенк|мицел|демаки|гидрофил|молочко)/.test(
    `${searchable.name} ${searchable.category} ${searchable.purpose}`
  );
}

function isDecorativeFaceProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(тональ|bb крем|bb |вв крем|вв |cc крем|cc |dd крем|dd |dd-крем|ee крем|ee |ee-крем|ее крем|ее |ее-крем|консил|пудр|румян|кушон|макияж)/.test(
    `${searchable.name} ${searchable.category} ${searchable.purpose}`
  );
}

function isStrictCreamProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(крем|cream)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`) && !isDecorativeFaceProduct(product);
}

function isSerumProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(сыворот|серум|концентрат|корректор)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isSprayProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(спрей|мист)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isTonerProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(тоник|тонер|лосьон)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isSpfProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(spf|спф|uv|защит)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isEyeAreaProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(вокруг глаз|кожи вокруг глаз|для глаз|\bвек\b|и век|eye)/.test(
    `${searchable.name} ${searchable.category} ${searchable.purpose}`
  );
}

function isHighlightProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(хайлайтер|highlighter|сияние|glow)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isExfoliatingProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(кислот|acid|пилинг|peel|эксфоли|скраб)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isBlemishProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  return /(несовершен|blemish|problem|матов|поры|пор)/.test(`${searchable.name} ${searchable.category} ${searchable.purpose}`);
}

function isAgeSpecificProduct(product: ProductMatch): boolean {
  const rawName = product.name.toLowerCase();
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return Boolean(
    /(25\+|30\+|35\+|40\+|45\+|50\+|55\+|60\+|65\+)/i.test(rawName) ||
      /(anti age|омолож|морщ|лифт|упруг)/.test(text) ||
      /\b(?:25|30|35|40|45|50|55|60|65)\b(?=\s*(?:для|днев|ноч|день|лифт|омолож|кож|чувств))/.test(text)
  );
}

type CreamTheme = "barrier" | "hydration" | "universal" | "spf" | "pigmentation" | "night" | "anti_age" | "other";

function isAntiAgeSpecialistProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return /(антивозраст|против возрастных изменений|омолож|морщ|лифт|упруг|prestige|luxcare|filler|филлер|q10|collagen|retinol|dermage)/.test(
    text
  );
}

function hasExplicitBarrierText(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return /(барьер|восстанов|атоп|чувств|реактив|раздраж|комфорт|смягча|успока|купероз|капилляро|panthenol urea|oil крем|крем масло|dead sea|pharmacos|ceraderma|atopicontrol|sensitivity control|nutrition control|hydro комфорт|hydroderm|sos уход|непогоды)/.test(
    text
  );
}

function isBarrierNoiseSpecialistProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
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

function isPrimaryBarrierCareProduct(product: ProductMatch): boolean {
  if (!isStrictCreamProduct(product) || isBarrierNoiseSpecialistProduct(product)) {
    return false;
  }

  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  const ingredients = searchable.ingredients;

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

  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  const ingredients = searchable.ingredients;

  return (
    /(барьер|восстанавлива|атоп|чувств|реактив|комфорт|успокаивающ|смягчающ|купероз|капилляро|oil крем|panthenol urea|pharmacos|dead sea|крем масло)/.test(
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

  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  const ingredients = searchable.ingredients;

  return (
    (/(увлаж|moist|aqua|hyaluron|гиалур|эмолент|защит|calm|soothing|пробиотик)/.test(text) &&
      /(glycerin|глицерин|betaine|бетаин|hyaluron|гиалур|urea|мочевин|lecithin|лецитин|panthenol|пантенол|allantoin|аллантоин|squalane|сквалан)/.test(
        ingredients
      )) ||
    /(увлажняющ|суперувлаж|аква|крем сорбет|крем баттер)/.test(text)
  );
}

function isSensitiveDryFaceCoreProduct(product: ProductMatch): boolean {
  if (!isPrimaryBarrierCareProduct(product) || isAgeSpecificProduct(product)) {
    return false;
  }
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return /(сух|атоп|чувств|комфорт|oil крем|крем масло|крем баттер|pharmacos|dead sea|panthenol urea)/.test(text);
}

function isGeneralFaceCreamSpecialistProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.line}`;
  return (
    isDecorativeFaceProduct(product) ||
    isEyeAreaProduct(product) ||
    detectProductScopes(product).includes("men") ||
    /(маск|mask|постпилинг|post peel|поры|минимайзер|несовершен|матир|анти акне|anti acne|acne|cold|холод|мороз|массаж|праймер|экран|screen|филлер|filler|корректир|капилляро|купероз|dermage|антипигмент|стартер|фактор|сыворот|серум|совершенств|сияни)/.test(
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

  const theme = detectCreamTheme(product);
  return theme === "barrier" || theme === "hydration" || theme === "universal";
}

function detectCreamTheme(product: ProductMatch): CreamTheme {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.category} ${searchable.purpose} ${searchable.ingredients}`;
  if (isPrimaryPigmentationCareProduct(product)) return "pigmentation";
  if (/(spf|спф|uv|защит)/.test(text)) return "spf";
  if (/(ночн|night)/.test(text)) return "night";
  if (/(морщ|лифт|омолож|пептид|prestige|luxcare|filler|collagen|q10|retinol|40\+|45\+|50\+|60\+|65\+)/.test(text)) {
    return "anti_age";
  }
  if (/(атоп|чувств|комфорт|барьер|soothing|calm|эмолент|squalane|сквалан|ceramide|церамид|panthenol|пантенол)/.test(text)) {
    return "barrier";
  }
  if (/(увлаж|hyaluron|гиалур|aqua|moist|betaine|бетаин|glycerin|глицерин)/.test(text)) return "hydration";
  if (/(день ночь|24ч|дневн|ежедневн|универс)/.test(text)) return "universal";
  return "other";
}

function isPrimaryPigmentationCareProduct(product: ProductMatch): boolean {
  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.purpose} ${searchable.line}`;
  if (
    isDecorativeFaceProduct(product) ||
    isBlemishProduct(product) ||
    isEyeAreaProduct(product) ||
    isHighlightProduct(product)
  ) {
    return false;
  }
  return /(депигмент|anti spot|антипигмент|против пигментации|осветляющ|пигментных пятен)/.test(
    text
  );
}

function isDedicatedPigmentationCareProduct(product: ProductMatch): boolean {
  return isPrimaryPigmentationCareProduct(product) && !isAgeSpecificProduct(product);
}

function isFirstLinePigmentationCareProduct(product: ProductMatch): boolean {
  return isDedicatedPigmentationCareProduct(product) && !isAntiAgeSpecialistProduct(product);
}

function isPigmentationSupportProduct(product: ProductMatch): boolean {
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

  if (isPrimaryPigmentationCareProduct(product)) {
    return true;
  }

  const searchable = getSearchableFields(product);
  const text = `${searchable.name} ${searchable.purpose} ${searchable.line}`;
  const ingredients = searchable.ingredients;

  if (isAgeSpecificProduct(product) || isAntiAgeSpecialistProduct(product)) {
    return false;
  }

  if (/(купероз|покрас|anti acne|анти акне|акне контроль)/.test(text)) {
    return false;
  }

  return /(витамин c|vitamin c|ниацинамид|niacinamide|постакне|bright|brightening|radiance|ровный тон|сияние кожи|сияние лица|пигмент)/.test(
    text
  ) || /(niacinamide|ниацинамид|vitamin c|аскорб|arbutin|арбутин|tranex|транекс|kojic|койев|azel|азелаин)/.test(ingredients);
}

function rankProducts(products: ProductMatch[], input: QdrantSearchInput, limit: number): ProductMatch[] {
  const ranked = products
    .map((product) => {
      const lexicalScore = computeLexicalScore(product, input.queryText);
      const profileScore = computeProfileScore(product, input);
      const intentScore = computeIntentScore(product, input.queryText);
      const concernIntentScore = computeConcernIntentScore(product, input.queryText, input);
      const catalogListScore = computeCatalogListScore(product, input.queryText);
      const scopeScore = computeScopeScore(product, input.queryText);
      const combinedScore =
        Number(product.score ?? 0) +
        lexicalScore +
        profileScore +
        intentScore +
        concernIntentScore +
        catalogListScore +
        scopeScore;
      return {
        ...product,
        score: combinedScore
      };
    })
    .sort((left, right) => right.score - left.score);

  if (isBabyCareQuery(input.queryText)) {
    const babyProducts = ranked.filter(isBabyCareProduct);
    if (babyProducts.length > 0) {
      return babyProducts.slice(0, limit);
    }
    return [];
  }

  if (isFaceCareQuery(input.queryText)) {
    if (isPigmentationQuery(input.queryText)) {
      const faceProducts = ranked.filter(isFaceCareProduct);
      const nonDecorative = faceProducts.filter((product) => !isDecorativeFaceProduct(product));
      const treatmentPool = nonDecorative.filter(
        (product) => !isCleanserProduct(product) && !isSprayProduct(product) && !isEyeAreaProduct(product) && !isHighlightProduct(product)
      );
      const nonAntiAgePool = treatmentPool.filter(
        (product) => !isAntiAgeSpecialistProduct(product) || isPrimaryPigmentationCareProduct(product)
      );
      const carePool = nonAntiAgePool.filter((product) => isStrictCreamProduct(product) || isSerumProduct(product));
      const sourcePool = carePool.length > 0 ? carePool : nonAntiAgePool.length > 0 ? nonAntiAgePool : treatmentPool;
      const selected: ProductMatch[] = [];
      const addUnique = (items: ProductMatch[]) => {
        for (const product of items) {
          if (selected.some((item) => item.id === product.id)) continue;
          selected.push(product);
          if (selected.length >= limit) return;
        }
      };

      addUnique(sourcePool.filter(isFirstLinePigmentationCareProduct));
      addUnique(sourcePool.filter(isDedicatedPigmentationCareProduct));
      addUnique(sourcePool.filter(isPrimaryPigmentationCareProduct));
      addUnique(sourcePool.filter(isPigmentationSupportProduct));

      if (selected.length > 0) {
        return selected.slice(0, limit);
      }
    }

    if (/(лиц|кож)/.test(normalizeSearchText(input.queryText)) && /(чувств|сух|барьер|атоп|раздраж|реактив)/.test(normalizeSearchText(input.queryText))) {
      const faceProducts = ranked.filter(isFaceCareProduct);
      const treatmentPool = faceProducts.filter(
        (product) =>
          isStrictCreamProduct(product) &&
          !isDecorativeFaceProduct(product) &&
          !isCleanserProduct(product) &&
          !isSprayProduct(product) &&
          !isEyeAreaProduct(product) &&
          !isHighlightProduct(product)
      );
      const selected: ProductMatch[] = [];
      const addUnique = (items: ProductMatch[]) => {
        for (const product of items) {
          if (selected.some((item) => item.id === product.id)) continue;
          selected.push(product);
          if (selected.length >= limit) return;
        }
      };

      addUnique(treatmentPool.filter((product) => isSensitiveDryFaceCoreProduct(product) && !product.flags.includes("has_fragrance")));
      addUnique(treatmentPool.filter(isSensitiveDryFaceCoreProduct));
      addUnique(treatmentPool.filter((product) => isPrimaryBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
      addUnique(treatmentPool.filter(isDedicatedBarrierCareProduct));
      addUnique(treatmentPool.filter(isSupportiveBarrierCareProduct));
      addUnique(treatmentPool.filter((product) => !product.flags.includes("has_fragrance")));
      addUnique(treatmentPool);

      if (selected.length > 0) {
        return selected.slice(0, limit);
      }
    }

    if (/(барьер|восстанов|атоп|раздраж|реактив|чувств)/.test(normalizeSearchText(input.queryText)) && /(крем|лиц|кож)/.test(normalizeSearchText(input.queryText))) {
      const faceProducts = ranked.filter(isFaceCareProduct);
      const treatmentPool = faceProducts.filter(
        (product) =>
          isStrictCreamProduct(product) &&
          !isDecorativeFaceProduct(product) &&
          !isCleanserProduct(product) &&
          !isSprayProduct(product) &&
          !isEyeAreaProduct(product) &&
          !isHighlightProduct(product)
      );
      const nonNoisePool = treatmentPool.filter((product) => !isBarrierNoiseSpecialistProduct(product));
      const sourcePool = nonNoisePool.length > 0 ? nonNoisePool : treatmentPool;
      const selected: ProductMatch[] = [];
      const addUnique = (items: ProductMatch[]) => {
        for (const product of items) {
          if (selected.some((item) => item.id === product.id)) continue;
          selected.push(product);
          if (selected.length >= limit) return;
        }
      };

      addUnique(sourcePool.filter((product) => isDedicatedBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
      addUnique(sourcePool.filter(isDedicatedBarrierCareProduct));
      addUnique(sourcePool.filter((product) => isPrimaryBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
      addUnique(sourcePool.filter(isPrimaryBarrierCareProduct));
      addUnique(sourcePool.filter((product) => isSupportiveBarrierCareProduct(product) && !product.flags.includes("has_fragrance")));
      addUnique(sourcePool.filter(isSupportiveBarrierCareProduct));
      addUnique(sourcePool);

      if (selected.length > 0) {
        return selected.slice(0, limit);
      }
    }

    if (isGenericCatalogCreamListIntent(input.queryText)) {
      const faceCreams = ranked.filter(
        (product) =>
          isFaceCareProduct(product) &&
          isStrictCreamProduct(product) &&
          !isCleanserProduct(product) &&
          !isExfoliatingProduct(product) &&
          !isSprayProduct(product)
      );
      const selected: ProductMatch[] = [];
      const addUnique = (items: ProductMatch[]) => {
        for (const product of items) {
          if (selected.some((item) => item.id === product.id)) continue;
          selected.push(product);
          if (selected.length >= limit) return;
        }
      };

      addUnique(faceCreams.filter(isGeneralDailyFaceCreamProduct));
      addUnique(faceCreams.filter((product) => !isGeneralFaceCreamSpecialistProduct(product)));
      addUnique(faceCreams);

      if (selected.length > 0) {
        return selected.slice(0, limit);
      }
    }

    const faceProducts = ranked.filter(isFaceCareProduct);
    if (faceProducts.length > 0) {
      return faceProducts.slice(0, limit);
    }
  }

  const requestedScopes = detectRequestedScopes(input.queryText);
  if (requestedScopes.includes("hair")) {
    const hairProducts = ranked.filter((product) => detectProductScopes(product).includes("hair"));
    if (hairProducts.length > 0) {
      return hairProducts.slice(0, limit);
    }
  }

  if (requestedScopes.includes("body")) {
    const bodyProducts = ranked.filter((product) => detectProductScopes(product).includes("body"));
    if (bodyProducts.length > 0) {
      return bodyProducts.slice(0, limit);
    }
  }

  if (requestedScopes.includes("feet")) {
    const feetProducts = ranked.filter((product) => detectProductScopes(product).includes("feet"));
    if (feetProducts.length > 0) {
      return feetProducts.slice(0, limit);
    }
  }

  return ranked.slice(0, limit);
}

export class QdrantClientAdapter {
  private static readonly FULL_SCAN_PAGE_SIZE = 256;
  private static readonly FULL_SCAN_MAX_POINTS = 5000;
  private static readonly CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly collection: string;
  private readonly defaultLimit: number;
  private readonly queryModel: string;
  private textQueryUnsupported = false;
  private catalogCache: { fetchedAt: number; products: ProductMatch[] } | null = null;

  constructor(env: Env) {
    this.baseUrl = requireEnv("QDRANT_URL", env.QDRANT_URL).replace(/\/+$/, "");
    this.apiKey = requireEnv("QDRANT_KEY", env.QDRANT_KEY);
    this.collection = env.QDRANT_COLLECTION || "product_knowledge";
    this.defaultLimit = parseIntegerEnv(env.QDRANT_TOP_K, 4);
    this.queryModel = env.QDRANT_QUERY_MODEL || "BAAI/bge-small-en-v1.5";
  }

  async searchProducts(input: QdrantSearchInput): Promise<ProductMatch[]> {
    const limit = input.limit > 0 ? input.limit : this.defaultLimit;

    if (Array.isArray(input.queryVector) && input.queryVector.length > 0) {
      const candidateLimit = Math.max(limit * 6, 24);
      const response = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey
        },
        body: JSON.stringify({
          vector: input.queryVector,
          limit: candidateLimit,
          with_payload: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant vector search failed: ${response.status} ${errorText}`);
      }

      const payload = (await response.json()) as QdrantSearchResponse;
      const products = (payload.result ?? []).map(normalizePoint).filter((item): item is ProductMatch => item !== null);
      return rankProducts(products, input, limit);
    }

    const products = await this.getCatalogSnapshot();
    const ranked = rankProducts(products, input, Math.max(limit * 3, 12));
    return ranked.filter((product) => product.score > 0).slice(0, limit);
  }

  private async getCatalogSnapshot(): Promise<ProductMatch[]> {
    const now = Date.now();
    if (this.catalogCache && now - this.catalogCache.fetchedAt < QdrantClientAdapter.CATALOG_CACHE_TTL_MS) {
      return this.catalogCache.products;
    }

    try {
      const products = await this.fetchFullCatalog();
      this.catalogCache = {
        fetchedAt: now,
        products
      };
      return products;
    } catch (error) {
      if (this.catalogCache) {
        console.error("Qdrant full catalog refresh failed, using stale cache", error);
        return this.catalogCache.products;
      }
      throw error;
    }
  }

  private async fetchFullCatalog(): Promise<ProductMatch[]> {
    const products = new Map<string, ProductMatch>();
    let offset: string | number | Record<string, unknown> | null | undefined;

    while (products.size < QdrantClientAdapter.FULL_SCAN_MAX_POINTS) {
      const response = await fetch(`${this.baseUrl}/collections/${this.collection}/points/scroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey
        },
        body: JSON.stringify({
          limit: QdrantClientAdapter.FULL_SCAN_PAGE_SIZE,
          with_payload: true,
          with_vector: false,
          ...(offset ? { offset } : {})
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant full catalog scroll failed: ${response.status} ${errorText}`);
      }

      const payload = (await response.json()) as QdrantScrollResponse;
      const points = payload.result?.points ?? [];
      for (const point of points) {
        const normalized = normalizePoint(point);
        if (normalized) {
          products.set(normalized.id, normalized);
        }
      }

      offset = payload.result?.next_page_offset;
      if (!offset || points.length < QdrantClientAdapter.FULL_SCAN_PAGE_SIZE) {
        break;
      }
    }

    return [...products.values()];
  }
}
