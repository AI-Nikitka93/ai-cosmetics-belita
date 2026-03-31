function parsePayload(output) {
  if (typeof output !== "string") {
    return { error: "Provider output is not a string.", products: [] };
  }

  try {
    const parsed = JSON.parse(output);
    const products = Array.isArray(parsed.products) ? parsed.products : [];
    return { ...parsed, products };
  } catch (error) {
    return {
      error: `Failed to parse provider JSON: ${error instanceof Error ? error.message : String(error)}`,
      products: []
    };
  }
}

function textOf(product) {
  return [
    product?.name ?? "",
    product?.category ?? "",
    product?.purpose ?? "",
    product?.line ?? ""
  ]
    .join(" ")
    .toLowerCase();
}

function ingredientsOf(product) {
  return Array.isArray(product?.ingredients) ? product.ingredients.join(", ").toLowerCase() : "";
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function isCreamLike(product) {
  const text = textOf(product);
  return text.includes("крем") || text.includes("cream");
}

function isEyeArea(product) {
  const text = textOf(product);
  return includesAny(text, ["вокруг глаз", "для глаз", " и век", " век ", "eye"]);
}

function isCleanserLike(product) {
  return includesAny(textOf(product), ["очищ", "умыван", "пенк", "мицел", "демаки", "гидрофил", "молочко"]);
}

function isDecorative(product) {
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

function isAgeHeavy(product) {
  const text = textOf(product);
  return (
    includesAny(text, ["морщ", "лифт", "омолож", "prestige", "luxcare", "filler", "филлер", "retinol", "collagen", "q10", "dermage"]) ||
    /\b(?:25|30|35|40|45|50|55|60|65)\+/.test(text)
  );
}

function isExplicitPigmentation(product) {
  return includesAny(textOf(product), [
    "депигмент",
    "anti spot",
    "антипигмент",
    "против пигментации",
    "осветляющ",
    "пигментных пятен"
  ]);
}

function isSupportivePigmentation(product) {
  const text = textOf(product);
  const ingredients = ingredientsOf(product);
  return (
    isExplicitPigmentation(product) ||
    includesAny(text, ["витамин c", "niacinamide", "ниацинамид", "постакне", "bright", "brightening", "radiance", "ровный тон"]) ||
    includesAny(ingredients, ["niacinamide", "ниацинамид", "vitamin c", "аскорб", "arbutin", "арбутин", "tranex", "транекс", "kojic", "койев", "azel", "азелаин"])
  );
}

function isBarrierLike(product) {
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

function isSensitiveDryLike(product) {
  return includesAny(textOf(product), ["сух", "атоп", "чувств", "comfort", "комфорт", "oil крем", "крем баттер", "panthenol urea", "pharmacos"]);
}

function validatePigmentation(products) {
  const issues = [];
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

function validateBarrier(products) {
  const issues = [];
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

function validateSensitive(products) {
  const issues = [];
  const top4 = products.slice(0, 4);
  if (products.length < 4) {
    issues.push("Выдано меньше 4 товаров.");
  }
  if (!products.slice(0, 3).some((product) => String(product?.name ?? "").includes("OIL-КРЕМ"))) {
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

function validateGeneralFaceCreams(products) {
  const issues = [];
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

const validators = {
  pigmentation: validatePigmentation,
  barrier: validateBarrier,
  sensitive: validateSensitive,
  general_face_creams: validateGeneralFaceCreams
};

export default function rankingScenarioCheck(output, context) {
  const payload = parsePayload(output);
  if (payload.error) {
    return {
      pass: false,
      score: 0,
      reason: payload.error
    };
  }

  const scenario = String(context?.vars?.scenario ?? "").trim();
  const validate = validators[scenario];
  if (!validate) {
    return {
      pass: false,
      score: 0,
      reason: `Unknown promptfoo scenario: ${scenario || "<empty>"}`
    };
  }

  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: "Provider returned an empty product list."
    };
  }

  const issues = validate(payload.products);
  if (issues.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: issues.join(" | ")
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `${scenario} scenario passed with ${payload.products.length} products`
  };
}
