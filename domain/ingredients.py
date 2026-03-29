from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class IngredientRule:
    key: str
    aliases: tuple[str, ...]
    functions: tuple[str, ...]
    flags: tuple[str, ...]
    fit_tags: tuple[str, ...]
    note: str


INGREDIENT_RULES: tuple[IngredientRule, ...] = (
    IngredientRule(
        key="salicylic_acid",
        aliases=("salicylic acid", "салициловая кислота"),
        functions=("exfoliant", "sebum_control"),
        flags=("has_acids",),
        fit_tags=("acne_prone_fit", "oily_skin_fit"),
        note="BHA-кислота, помогает при комедонах и жирном блеске, но может раздражать чувствительную кожу.",
    ),
    IngredientRule(
        key="glycolic_acid",
        aliases=("glycolic acid", "гликолевая кислота"),
        functions=("exfoliant", "brightening"),
        flags=("has_acids", "strong_acid"),
        fit_tags=("anti_pigment_fit",),
        note="AHA-кислота для выравнивания текстуры и тона, но не подходит для очень чувствительной кожи.",
    ),
    IngredientRule(
        key="lactic_acid",
        aliases=("lactic acid", "молочная кислота"),
        functions=("exfoliant", "humectant"),
        flags=("has_acids",),
        fit_tags=("dry_skin_fit", "anti_pigment_fit"),
        note="Более мягкая AHA-кислота с дополнительным увлажняющим профилем.",
    ),
    IngredientRule(
        key="azelaic_acid",
        aliases=("azelaic acid", "азелаиновая кислота"),
        functions=("brightening", "anti_inflammatory"),
        flags=("has_acids",),
        fit_tags=("acne_prone_fit", "anti_pigment_fit", "sensitive_skin_fit"),
        note="Считается одной из более мягких кислот для неровного тона и кожи, склонной к высыпаниям.",
    ),
    IngredientRule(
        key="retinol",
        aliases=("retinol", "retinal", "retinyl palmitate", "ретинол", "ретиналь"),
        functions=("renewal", "anti_age"),
        flags=("has_retinoid",),
        fit_tags=("anti_age_fit",),
        note="Ретиноидный актив с антивозрастным действием, который требует осторожности при чувствительной коже.",
    ),
    IngredientRule(
        key="niacinamide",
        aliases=("niacinamide", "витамин b3"),
        functions=("barrier_support", "brightening", "sebum_control"),
        flags=("has_niacinamide",),
        fit_tags=("acne_prone_fit", "oily_skin_fit", "barrier_repair_fit"),
        note="Хорошо подходит для пор, барьера кожи и выравнивания тона.",
    ),
    IngredientRule(
        key="zinc_pca",
        aliases=("zinc pca", "цинк pca"),
        functions=("sebum_control", "anti_inflammatory"),
        flags=("has_zinc",),
        fit_tags=("acne_prone_fit", "oily_skin_fit"),
        note="Часто встречается в уходе для жирной и проблемной кожи.",
    ),
    IngredientRule(
        key="glycerin",
        aliases=("glycerin", "глицерин"),
        functions=("humectant",),
        flags=("has_humectants",),
        fit_tags=("dry_skin_fit", "sensitive_skin_fit"),
        note="Базовый увлажнитель, повышает способность кожи удерживать воду.",
    ),
    IngredientRule(
        key="hyaluronic_acid",
        aliases=("sodium hyaluronate", "hyaluronic acid", "hydrolyzed hyaluronic acid", "гиалуронат натрия", "гиалуроновая кислота"),
        functions=("humectant",),
        flags=("has_humectants",),
        fit_tags=("dry_skin_fit", "sensitive_skin_fit"),
        note="Увлажняющий актив, полезен при обезвоженности.",
    ),
    IngredientRule(
        key="urea",
        aliases=("urea", "мочевина"),
        functions=("humectant", "softening"),
        flags=("has_humectants",),
        fit_tags=("dry_skin_fit", "barrier_repair_fit"),
        note="Полезна для сухой кожи и смягчения шероховатостей.",
    ),
    IngredientRule(
        key="panthenol",
        aliases=("panthenol", "d-panthenol", "пантенол"),
        functions=("soothing", "barrier_support"),
        flags=("has_soothing_agents", "has_barrier_support"),
        fit_tags=("sensitive_skin_fit", "barrier_repair_fit", "dry_skin_fit"),
        note="Успокаивающий и восстанавливающий компонент для чувствительной кожи.",
    ),
    IngredientRule(
        key="allantoin",
        aliases=("allantoin", "аллантоин"),
        functions=("soothing", "barrier_support"),
        flags=("has_soothing_agents", "has_barrier_support"),
        fit_tags=("sensitive_skin_fit", "barrier_repair_fit"),
        note="Смягчает и помогает уменьшить ощущение раздражения.",
    ),
    IngredientRule(
        key="centella",
        aliases=("centella asiatica", "экстракт centella asiatica", "экстракт центеллы"),
        functions=("soothing", "barrier_support"),
        flags=("has_soothing_agents",),
        fit_tags=("sensitive_skin_fit", "barrier_repair_fit", "acne_prone_fit"),
        note="Центелла часто используется в успокаивающем и барьерном уходе.",
    ),
    IngredientRule(
        key="ceramides",
        aliases=("ceramide", "ceramide np", "ceramide ap", "ceramide as", "ceramide ng", "церамид"),
        functions=("barrier_support",),
        flags=("has_barrier_support",),
        fit_tags=("dry_skin_fit", "sensitive_skin_fit", "barrier_repair_fit"),
        note="Ключевой барьерный актив для сухой и чувствительной кожи.",
    ),
    IngredientRule(
        key="squalane",
        aliases=("squalane", "сквалан"),
        functions=("emollient", "barrier_support"),
        flags=("has_barrier_support",),
        fit_tags=("dry_skin_fit", "sensitive_skin_fit", "barrier_repair_fit"),
        note="Легкий эмолент, хорошо переносится чувствительной кожей.",
    ),
    IngredientRule(
        key="shea_butter",
        aliases=("butyrospermum parkii", "масло ши"),
        functions=("emollient", "occlusive"),
        flags=("has_emollients",),
        fit_tags=("dry_skin_fit", "barrier_repair_fit"),
        note="Питательный эмолент для сухой кожи.",
    ),
    IngredientRule(
        key="chamomile",
        aliases=("chamomilla recutita", "ромашки", "ромашка"),
        functions=("soothing",),
        flags=("has_soothing_agents",),
        fit_tags=("sensitive_skin_fit", "dry_skin_fit"),
        note="Традиционный успокаивающий растительный компонент.",
    ),
    IngredientRule(
        key="fragrance",
        aliases=("parfum", "perfume", "fragrance", "парфюмерная композиция"),
        functions=("fragrance",),
        flags=("has_fragrance", "potential_allergen"),
        fit_tags=(),
        note="Отдушки повышают риск раздражения для очень чувствительной кожи.",
    ),
    IngredientRule(
        key="fragrance_allergens",
        aliases=("limonene", "linalool", "hexyl cinnamal", "benzyl salicylate", "benzyl benzoate", "citronellol", "geraniol"),
        functions=("fragrance",),
        flags=("has_fragrance", "potential_allergen"),
        fit_tags=(),
        note="Частые аллергены в составе парфюмерных композиций.",
    ),
    IngredientRule(
        key="drying_alcohol",
        aliases=("alcohol denat", "denatured alcohol", "ethanol", "isopropyl alcohol"),
        functions=("solvent",),
        flags=("has_drying_alcohol",),
        fit_tags=("oily_skin_fit",),
        note="Может пересушивать и раздражать чувствительную или поврежденную кожу.",
    ),
    IngredientRule(
        key="tocopherol",
        aliases=("tocopherol", "tocopheryl acetate", "витамин e"),
        functions=("antioxidant",),
        flags=("has_antioxidants",),
        fit_tags=("anti_age_fit", "dry_skin_fit"),
        note="Антиоксидантная поддержка для кожи и формулы.",
    ),
)


PURPOSE_HINTS: tuple[tuple[str, str], ...] = (
    ("чувств", "sensitive_skin_fit"),
    ("сух", "dry_skin_fit"),
    ("обезвож", "dry_skin_fit"),
    ("жирн", "oily_skin_fit"),
    ("комбинирован", "combination_skin_fit"),
    ("проблем", "acne_prone_fit"),
    ("акне", "acne_prone_fit"),
    ("увлаж", "dry_skin_fit"),
    ("барьер", "barrier_repair_fit"),
    ("лифт", "anti_age_fit"),
    ("омолож", "anti_age_fit"),
    ("пигмент", "anti_pigment_fit"),
)


SKIN_TYPE_LABELS = {
    "dry_skin_fit": "dry",
    "oily_skin_fit": "oily",
    "sensitive_skin_fit": "sensitive",
    "combination_skin_fit": "combination",
    "acne_prone_fit": "acne_prone",
    "barrier_repair_fit": "barrier_impaired",
}


def normalize_ingredient_name(name: str) -> str:
    return " ".join(name.casefold().replace("\xa0", " ").split())


def classify_ingredient(name: str) -> dict[str, object]:
    normalized = normalize_ingredient_name(name)
    matched_rules: list[IngredientRule] = []
    for rule in INGREDIENT_RULES:
        if any(alias in normalized for alias in rule.aliases):
            matched_rules.append(rule)

    functions = sorted({item for rule in matched_rules for item in rule.functions})
    flags = sorted({item for rule in matched_rules for item in rule.flags})
    fit_tags = sorted({item for rule in matched_rules for item in rule.fit_tags})
    notes = [rule.note for rule in matched_rules]

    return {
        "name": name,
        "normalized_name": normalized,
        "matched_rule_keys": [rule.key for rule in matched_rules],
        "functions": functions,
        "flags": flags,
        "fit_tags": fit_tags,
        "notes": notes,
    }


def derive_flags(ingredient_names: Iterable[str]) -> dict[str, bool]:
    aggregate = {
        "has_fragrance": False,
        "fragrance_free": True,
        "has_acids": False,
        "has_retinoid": False,
        "has_drying_alcohol": False,
        "has_barrier_support": False,
        "has_soothing_agents": False,
        "has_humectants": False,
        "has_antioxidants": False,
        "potential_allergen": False,
    }

    for ingredient_name in ingredient_names:
        ingredient_info = classify_ingredient(ingredient_name)
        flags = set(ingredient_info["flags"])
        if "has_fragrance" in flags:
            aggregate["has_fragrance"] = True
            aggregate["fragrance_free"] = False
        if "has_acids" in flags or "strong_acid" in flags:
            aggregate["has_acids"] = True
        if "has_retinoid" in flags:
            aggregate["has_retinoid"] = True
        if "has_drying_alcohol" in flags:
            aggregate["has_drying_alcohol"] = True
        if "has_barrier_support" in flags:
            aggregate["has_barrier_support"] = True
        if "has_soothing_agents" in flags:
            aggregate["has_soothing_agents"] = True
        if "has_humectants" in flags:
            aggregate["has_humectants"] = True
        if "has_antioxidants" in flags:
            aggregate["has_antioxidants"] = True
        if "potential_allergen" in flags:
            aggregate["potential_allergen"] = True

    aggregate["gentle_fit"] = (
        aggregate["has_soothing_agents"]
        and aggregate["has_barrier_support"]
        and not aggregate["has_drying_alcohol"]
        and not aggregate["has_retinoid"]
    )
    aggregate["acne_fit"] = aggregate["has_acids"] or any(
        "acne_prone_fit" in classify_ingredient(name)["fit_tags"] for name in ingredient_names
    )
    return aggregate


def derive_fit_tags(ingredient_names: Iterable[str], purpose_text: str | None = None) -> list[str]:
    fit_tags: set[str] = set()
    for ingredient_name in ingredient_names:
        ingredient_info = classify_ingredient(ingredient_name)
        fit_tags.update(ingredient_info["fit_tags"])

    normalized_purpose = normalize_ingredient_name(purpose_text or "")
    for keyword, tag in PURPOSE_HINTS:
        if keyword in normalized_purpose:
            fit_tags.add(tag)

    return sorted(fit_tags)


def derive_skin_type_hints(fit_tags: Iterable[str]) -> list[str]:
    hints = {SKIN_TYPE_LABELS[tag] for tag in fit_tags if tag in SKIN_TYPE_LABELS}
    return sorted(hints)


def analyze_product(
    ingredient_names: Iterable[str],
    *,
    purpose_text: str | None = None,
    category: str | None = None,
) -> dict[str, object]:
    ingredient_list = [name for name in ingredient_names if name]
    ingredient_details = [classify_ingredient(name) for name in ingredient_list]
    flags = derive_flags(ingredient_list)
    fit_tags = derive_fit_tags(ingredient_list, purpose_text=purpose_text)
    skin_type_hints = derive_skin_type_hints(fit_tags)
    concerns: set[str] = set()

    if flags["has_acids"]:
        concerns.add("texture")
    if flags["acne_fit"]:
        concerns.add("breakouts")
    if flags["has_barrier_support"] or flags["has_soothing_agents"]:
        concerns.add("barrier_support")
    if flags["has_antioxidants"] or "anti_age_fit" in fit_tags:
        concerns.add("anti_age")
    if "anti_pigment_fit" in fit_tags:
        concerns.add("pigmentation")
    if "dry_skin_fit" in fit_tags:
        concerns.add("dryness")

    if category:
        normalized_category = normalize_ingredient_name(category)
        if "очищ" in normalized_category or "clean" in normalized_category:
            concerns.add("cleansing")
        if "сыворот" in normalized_category or "serum" in normalized_category:
            concerns.add("targeted_treatment")

    return {
        "ingredient_details": ingredient_details,
        "flags": flags,
        "fit_tags": fit_tags,
        "skin_type_hints": skin_type_hints,
        "concerns": sorted(concerns),
    }
