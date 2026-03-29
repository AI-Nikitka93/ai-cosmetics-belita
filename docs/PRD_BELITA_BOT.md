# PRD — AI Smart Cosmetics BELITA Recommender

Дата: `2026-03-28`  
Стадия: `Idea / Product Design`  
Текущий vertical slice: `Telegram Bot MVP`  
Продуктовый формат: `Commercial product`  
Амбиция: `Large ecosystem`, но текущая реализация начинается с `Medium MVP`

## 1. Executive Summary

`AI Smart Cosmetics BELITA Recommender` — это explainable AI-консультант по косметике Belita/Vitex. Его задача не просто назвать продукт, а показать пользователю понятную причинно-следственную цепочку:

- что у пользователя за контекст кожи;
- какие задачи он хочет решить;
- какие ингредиенты в продукте релевантны;
- какие ограничения и риски есть;
- почему выбран именно этот продукт или связка.

Ключевой продуктовый тезис: `не магический AI-советчик, а понятный разбор Belita-косметики человеческим языком`.

## 2. Тип проекта и глубина анализа

| Параметр | Выбор | Почему |
|---|---|---|
| Тип проекта | Коммерческий продукт | Есть пользовательская ценность, монетизационный потенциал и multi-surface roadmap |
| Масштаб | Large ambition / Medium initial slice | Экосистема большая, но MVP должен быть локальным и управляемым |
| Глубина анализа | Полный продуктовый анализ для MVP + roadmap | Нужно спроектировать продукт, а не только бота |

## 3. Проблема

Пользователь хочет подобрать уходовую косметику Belita/Vitex, но сталкивается с тремя барьерами:

1. Составы написаны на INCI-языке и плохо понятны без расшифровки.
2. Маркетинговые обещания продукта не объясняют, подойдет ли он именно под конкретную кожу.
3. Пользователь не понимает, какой продукт выбрать первым и как собрать базовую связку ухода.

## 4. ICP и сегменты

### Сегмент 1: Осознанный покупатель skincare
- Проблема: не хочет покупать "наугад" и переплачивать за неудачные продукты.
- JTBD: `When I choose Belita skincare for my skin concerns, I want a simple explanation of ingredients and fit, so I can buy with confidence without reading dozens of cards.`
- Платежеспособность: `Medium`
- Доступность: `High` через Telegram, контент, skincare-комьюнити.

### Сегмент 2: Пользователь с конкретной жалобой, но без желания идти в deep research
- Проблема: сухость, жирность, чувствительность, высыпания, тусклость, пигментация, но нет времени читать составы.
- JTBD: `When my skin starts bothering me, I want a safe cosmetic recommendation with a clear why, so I can choose a routine fast and avoid mismatch.`
- Платежеспособность: `Medium`
- Доступность: `High`

### Сегмент 3: Лояльный покупатель Belita/Vitex
- Проблема: бренд нравится, но линеек слишком много и выбор перегружен.
- JTBD: `When I already trust Belita, I want the fastest path to the right product line, so I can navigate the catalog without confusion.`
- Платежеспособность: `Medium`
- Доступность: `High`

## 5. Value Proposition

### Короткая формулировка
Telegram-бот, который подбирает Belita/Vitex косметику по профилю кожи и объясняет рекомендацию через разбор состава.

### Почему пользователь выберет это решение
- вместо длинного каталога получает персональный shortlist;
- вместо маркетинговых слоганов получает перевод состава на человеческий язык;
- вместо одного товара получает логичную связку ухода;
- вместо абстрактного AI-чата получает domain-focused advice в рамках Belita.

## 6. Product Identity

### Рабочее имя
`BELITA Skin Match`

### Short description
AI-ассистент по подбору косметики Belita/Vitex с объяснением по составу.

### Welcome message
`Помогу подобрать косметику Belita/Vitex под ваш тип кожи и задачу. Я не врач и не ставлю диагнозы, но могу объяснить, почему конкретный состав может подойти именно вам.`

### Telegram Store draft
- Title: `BELITA Skin Match`
- Description: `Подбор косметики Belita/Vitex по типу кожи и составу`
- About: `Объясняемый AI-бот по уходу за кожей: опросник, подбор продуктов и понятный разбор состава. Не заменяет врача. Создано @AI_Nikitka93.`
- Photo brief: чистый skincare-образ, бело-зеленая или молочно-травяная палитра, доверительный тон, ощущение "научно, но дружелюбно", без medical-атрибутики.

## 7. Positioning

Для пользователей, которые хотят выбрать косметику Belita/Vitex без ошибок,  
которые не хотят разбираться в INCI вручную,  
наш продукт — это explainable skincare advisor в Telegram,  
который подбирает средства по профилю кожи и объясняет выбор через состав,  
в отличие от обычного каталога или общего AI-чата,  
мы даем доменный, ограниченный и проверяемый разбор именно Belita-продуктов.

## 8. Roadmap

## Phase 1 — Telegram Bot MVP

### Цель
Подтвердить, что пользователю нужна персональная рекомендация Belita с понятным объяснением по составу.

### В MVP входит
- onboarding и короткий опросник;
- профиль кожи пользователя;
- подбор 1-3 продуктов или базовой связки;
- explainability block: `почему подходит / на какие ингредиенты опираемся / что может не подойти`;
- bounded AI chat только по теме Belita и ухода;
- дисклеймеры и safety-guardrails;
- каталог Belita/Vitex с базовыми фильтрами по задачам и типу кожи;
- сохранение последней рекомендации и краткой истории диалога.

### В MVP не входит
- web-версия;
- browser extension;
- полноценный UGC-скоринг по внешним отзывам;
- сложная routine-автоматизация на 7-10 шагов;
- диагностика по фото;
- медицинские обещания, диагнозы и лечение кожных состояний;
- свободный general-purpose AI chat.

### Критические гипотезы MVP
- пользователи ценят объяснение состава, а не только саму рекомендацию;
- Telegram-формат достаточно удобен для сбора нужных вводных;
- Belita-фокус снижает перегрузку и повышает доверие.

## Phase 2 — Telegram Mini App

### Цель
Улучшить исследование каталога и повторное использование продукта.

### Что добавляется
- визуальный каталог;
- карточки продуктов с полным объяснением INCI;
- сохраненные рекомендации;
- сравнение 2-3 продуктов;
- личный профиль и история ответов;
- быстрые фильтры: кожа, задача, активы, линия, цена.

## Phase 3 — Web + Browser Extension

### Цель
Сделать продукт не только каналом рекомендаций, но и постоянным assistant-layer поверх каталога.

### Что добавляется
- web knowledge base по Belita/Vitex;
- SEO-страницы по линиям и задачам;
- browser extension с overlay на карточках товаров;
- быстрый explain-button на product page;
- comparison mode;
- deeper review intelligence после отдельного legal approval.

## 9. MVP Scope Cut

| Блок | MVP | Later | Почему |
|---|---|---|---|
| TG onboarding | Yes |  | Без него нет персонализации |
| Profile memory | Yes |  | Нужен для повторных рекомендаций |
| INCI parsing | Yes |  | Core value продукта |
| Explainable recommendation | Yes |  | Главная дифференциация |
| Routine builder | Light | Full | В MVP достаточно базовой связки |
| External review enrichment |  | Yes | Высокий legal и operational overhead |
| Photo analysis |  | Yes | Слишком высокий риск и сложность |
| Web app |  | Yes | Нарушает scope MVP |
| Browser extension |  | Yes | Только после product proof |

## 10. Core Job и outcomes

### Core functional job
`When I need Belita skincare for my skin needs, I want a recommendation explained through ingredients, so I can choose confidently and avoid buying a mismatched product.`

### Emotional job
Хочу чувствовать, что я покупаю осознанно, а не "на удачу".

### Social job
Хочу выглядеть человеком, который понимает, что наносит на кожу, а не ведется на обещания на упаковке.

## 11. User Flow — Telegram Bot MVP

### Flow 1: First-time onboarding
1. Пользователь нажимает `/start`.
2. Бот коротко объясняет формат:
   - подбираю только Belita/Vitex;
   - не врач;
   - объясняю составы понятным языком.
3. Бот предлагает два режима:
   - `Подобрать уход`
   - `Спросить про продукт`
4. Если выбран `Подобрать уход`, запускается опросник.

### Flow 2: Опросник
1. Тип кожи:
   - сухая
   - нормальная
   - комбинированная
   - жирная
   - не уверен(а)
2. Чувствительность:
   - низкая
   - средняя
   - высокая
3. Главная задача:
   - увлажнение
   - себоконтроль
   - чувствительность/успокоение
   - тусклость
   - anti-age
   - постакне/неровный тон
4. Дополнительные жалобы:
   - покраснение
   - шелушение
   - высыпания
   - черные точки
   - стянутость
   - пигментация
5. Возрастной диапазон:
   - до 18
   - 18-24
   - 25-34
   - 35-44
   - 45-54
   - 55+
6. Текущий уход:
   - только умывание
   - базовый уход
   - есть активы
   - почти нет ухода
7. Ограничения:
   - чувствительная кожа
   - не хочу отдушки
   - не хочу кислоты
   - не хочу ретиноиды
   - нужен SPF
   - важна цена
8. Формат ответа:
   - один лучший продукт
   - базовая связка 2-3 средства
   - несколько вариантов на выбор

### Flow 3: Рекомендация
1. Бот подтверждает профиль пользователя в 2-3 строках.
2. Бот выдает shortlist:
   - продукт 1;
   - продукт 2;
   - при необходимости продукт 3.
3. Для каждого продукта бот показывает:
   - для кого подходит;
   - какие ингредиенты ключевые;
   - почему это подходит под задачу;
   - что учесть перед покупкой;
   - место в рутине.
4. Бот завершает ответ блоком:
   - `Почему это работает`
   - `Когда ждать эффект`
   - `Когда лучше не брать`

### Flow 4: Follow-up chat
Пользователь может спросить:
- `Почему не другой крем?`
- `А если кожа чувствительная?`
- `Что взять вместо этого?`
- `Собери только бюджетный вариант`

Чат отвечает только в пределах:
- Belita/Vitex каталога;
- состава и его роли;
- routine usage;
- безопасных косметических рекомендаций.

### Flow 5: Off-topic / unsafe
Если пользователь уходит в диагнозы или вне домена:
- бот не продолжает general-purpose conversation;
- бот мягко возвращает в scope;
- при красных флагах советует очную консультацию специалиста.

## 12. Core AI Logic

### 12.1 Архитектурный принцип
Recommendation engine должен работать как `rules + ingredient knowledge graph + retrieval + LLM explanation`.

`LLM-only` модель для MVP не подходит, потому что:
- трудно проверять качество;
- выше риск галлюцинаций;
- сложнее удерживать тему;
- хуже юридическая управляемость.

### 12.2 Вводные, которые берем у пользователя

| Группа | Поля | Зачем |
|---|---|---|
| Skin profile | тип кожи, чувствительность, реактивность | Базовый fit |
| Goal | главная задача, дополнительные жалобы | Определяет objective |
| Constraints | нежелательные активы, отдушки, бюджет, формат | Фильтрация |
| Routine context | есть ли уже уход, нужен один продукт или связка | Определяет структуру выдачи |
| Demographic light | возрастной диапазон | Нужен только как мягкий контекст, не как диагноз |

### 12.3 Чего не спрашивать в MVP
- диагнозы;
- фото кожи;
- сведения о хронических заболеваниях;
- беременность в свободной форме;
- лекарства и лечебные схемы;
- медицинскую историю.

Если такие данные пользователь сам вводит, система:
- не сохраняет их как structured health profile;
- не использует для медицинских выводов;
- отвечает через safety-template.

### 12.4 Логика сопоставления профиля и продукта

#### Шаг 1. Нормализация профиля
Преобразовать ответы пользователя в нормализованный профиль:
- `skin_type`
- `sensitivity_level`
- `primary_goal`
- `secondary_concerns`
- `avoid_flags`
- `routine_stage`
- `budget_band`

#### Шаг 2. Нормализация карточки продукта
Из product data собрать:
- product type;
- line;
- stated purpose;
- target skin types;
- key active ingredients;
- full INCI;
- warnings or sensitive flags;
- price;
- usage slot: cleanse / tone / serum / cream / SPF / targeted treatment.

#### Шаг 3. Ingredient interpretation layer
Каждому ингредиенту или группе ингредиентов назначить:
- function: humectant / emollient / occlusive / exfoliant / soothing / anti-inflammatory / antioxidant / brightening / barrier-support / surfactant / fragrance / preservative;
- intensity;
- sensitivity risk;
- compatibility notes;
- evidence confidence.

#### Шаг 4. Fit scoring
Итоговый score продукта строится из:
- `goal_match`
- `skin_type_match`
- `sensitivity_match`
- `constraint_penalty`
- `routine_fit`
- `price_fit`
- `confidence_adjustment`

#### Шаг 5. Safety gating
Продукт не должен попадать в топ, если:
- есть явное противоречие профилю;
- есть высокий риск раздражения для заявленной чувствительности;
- не хватает состава или ключевых данных;
- бот не может объяснить выбор прозрачно.

#### Шаг 6. Bundle logic
Если пользователь просит связку, движок собирает не "лучшие 3 продукта подряд", а рабочую минимальную систему:
- cleanser;
- treatment or serum;
- cream;
- SPF only if есть релевантный продукт и уверенность.

#### Шаг 7. Explanation generation
Финальный AI-ответ строится по шаблону:
- `Что вы ищете`
- `Почему выбран этот продукт`
- `Какие ингредиенты важны`
- `Что может не подойти`
- `Как использовать`

### 12.5 Как ИИ должен анализировать состав

Для каждого продукта AI не просто повторяет маркетинговые claims, а делает 4 типа анализа:

1. `Ingredient role analysis`
   - какие вещества реально несут функциональную нагрузку;
2. `Profile fit analysis`
   - как эти вещества сочетаются с профилем пользователя;
3. `Risk analysis`
   - что может раздражать, сушить, быть спорным;
4. `Claim sanity check`
   - соответствует ли обещание продукта тому, что видно по составу и назначению.

### 12.6 Explainability format

Для каждого ответа нужен блок:

```markdown
Почему это может подойти:
- ...
- ...

Ключевые ингредиенты:
- [ингредиент] -> [простое объяснение роли]
- [ингредиент] -> [простое объяснение роли]

Что учесть:
- ...
```

## 13. Smart Chat Guardrails

### Цель
Сделать "умный чат", который не уходит в другие темы и не превращается в general assistant.

### Базовые правила поведения
- бот отвечает только про Belita/Vitex продукты, уход, ингредиенты и рутину;
- бот не обсуждает политику, программирование, бытовые темы и general knowledge;
- бот не ставит диагноз;
- бот не советует лечение;
- бот не спорит с врачом и не подменяет врача.

### Intent whitelist
- подобрать продукт;
- объяснить состав;
- сравнить 2-3 продукта;
- объяснить, почему продукт подходит или не подходит;
- подсказать место продукта в рутине;
- предложить более мягкую или более бюджетную альтернативу внутри Belita.

### Intent blacklist
- медицинская диагностика;
- лечение кожных заболеваний;
- off-topic chat;
- советы по препаратам;
- обсуждение других брендов в MVP, кроме случаев soft fallback.

### Ответ на off-topic
`Я работаю как ассистент по косметике Belita/Vitex. Могу помочь с подбором, составом, сравнением продуктов и логикой ухода.`

### Ответ на medical-risk
`Я не ставлю диагнозы и не заменяю врача. Если есть выраженное воспаление, аллергическая реакция, болезненность или длительное ухудшение состояния кожи, лучше обратиться к дерматологу.`

## 14. Data Strategy

### 14.1 Основная стратегия
Собирать данные в три слоя:

1. `Catalog layer`
   - карточки товара, цены, линии, категории, применимость;
2. `INCI layer`
   - полный состав и разметка ингредиентов;
3. `Feedback layer`
   - отзывы и пользовательские сигналы, но не как единственный источник истины.

### 14.2 Основные доноры

| Источник | Роль | Комментарий |
|---|---|---|
| `belita-shop.by` | основной товарный каталог | есть product card, structured fields, цены, barcode |
| `belita.by` / `vitex.by` | источник состава и брендовой структуры | composition lookup через barcode и корпоративный каталог |
| внешние review-площадки | optional enrichment | только после отдельного legal review |

### 14.3 Что парсить с `belita-shop.by`

| Поле | Нужно | Зачем |
|---|---|---|
| product_id / url | Yes | первичный ключ |
| product_name | Yes | выдача и поиск |
| category | Yes | routing по use case |
| subcategory | Yes | cleanser / serum / cream и т.д. |
| brand | Yes | Belita / Vitex / line brand |
| line | Yes | серия продукта |
| price | Yes | price-fit и фильтры |
| currency | Yes | расчет и отображение |
| volume | Yes | сравнение value |
| barcode | Yes | связка с composition page |
| stated_purpose | Yes | первичная цель продукта |
| target_skin_types | Yes | быстрый fit |
| age_mark | Optional | мягкий контекст |
| usage_instructions | Yes | explain/use block |
| country_of_origin | Optional | справочно |
| description | Yes | извлечение заявленных активов и claims |
| images | Later | Mini App / Web |
| availability | Later | коммерческий use case |

### 14.4 Что парсить с `belita.by` / `vitex.by`

| Поле | Нужно | Зачем |
|---|---|---|
| barcode-linked composition page | Yes | ключевая связка |
| full INCI | Yes | ядро explainability |
| product name | Yes | матчинг |
| line / series | Yes | брендовый контекст |
| declared benefits | Yes | claim sanity check |
| application instructions | Yes | usage advice |
| related products in same line | Optional | bundle suggestions |

### 14.5 Дополнительные derived fields

Эти поля не всегда лежат у донора и должны рассчитываться нами:

| Поле | Источник |
|---|---|
| product_role | derived from category + description |
| actives_detected | derived from INCI |
| ingredient_flags | derived from INCI |
| sensitivity_risk | derived |
| acne_risk_proxy | derived, heuristic |
| dry_skin_fit | derived |
| oily_skin_fit | derived |
| routine_slot | derived |
| evidence_confidence | derived |

### 14.6 Отзывы: откуда брать

#### Для MVP
Рекомендация: не делать отзывы core-слоем MVP. Причина:
- продуктовая гипотеза проверяется и без этого;
- отзывы шумные;
- внешний UGC создает отдельный legal и moderation-контур.

#### Для later stage
Смотреть приоритетно:
- официальные отзывы на собственных площадках Belita/Vitex, если доступны;
- marketplace reviews, где Belita реально продается;
- крупные review/community площадки по косметике.

#### Практический shortlist для проверки на следующем шаге
- `21vek.by`
- `Wildberries`
- `Ozon`
- `IRecommend`
- `Otzovik`

Использование этих источников должно идти только после:
- проверки ToS/robots;
- оценки лицензии на контент;
- решения, можно ли хранить полный текст или только агрегированные сигналы.

## 15. Product Constraints for P-20

### Главный приоритет
`простота поддержки + explainability + безопасный MVP запуск`

### Product constraints
- MVP только в Telegram;
- бот должен работать в bounded domain;
- рекомендации должны быть объяснимы без black-box логики;
- при отсутствии данных продукт лучше отказывается рекомендовать, чем выдумывает;
- личные данные пользователя минимизируются;
- свободный текст по медицинским жалобам не должен быть основой модели.

### High-level architectural direction
`Модульный монолит`

Почему:
- быстро для MVP;
- достаточно для ingestion + recommendation + chat orchestration;
- не создает ранний overhead микросервисов.

### Capability blocks

| Capability | Priority | MVP / Later | Зачем | Что если отложить |
|---|---|---|---|---|
| Profile intake | High | MVP | без него нет персонализации | продукт превратится в каталог |
| Product catalog | High | MVP | база рекомендаций | нечего рекомендовать |
| INCI knowledge layer | High | MVP | ключевая дифференциация | пропадет explainability |
| Recommendation engine | High | MVP | core workflow | нет ценности |
| Explainability layer | High | MVP | trust-building | ответ будет как у обычного бота |
| Safety layer | High | MVP | юр. и репутационный контроль | риск unsafe advice |
| Feedback loop | Medium | Later | улучшение качества | качество будет расти медленнее |
| External review enrichment | Medium | Later | social proof | допустимо отложить |
| Admin/backoffice | Medium | Later-light | контроль контента | на MVP можно ручное управление |

## 16. NFR и операционные ограничения

| Вопрос | Ответ |
|---|---|
| Интернет нужен? | Да |
| Offline-режим нужен? | Нет для MVP |
| Зависимость от внешних API? | Да, если используется внешний LLM |
| Требования по latency | желательно ответ до 5-8 сек для первого ответа |
| Требования по privacy | высокие для user profile и chat history |
| Auditability | нужна по рекомендациям и источникам состава |
| Mobile-first | Да, Telegram-first |
| GPU нужен? | Нет как обязательный критерий для MVP |

## 17. Legal / Compliance — Belarus framing

Важно: это рабочая продуктовая интерпретация, не финальное юридическое заключение.

### 17.1 Что можно делать относительно безопасно
- показывать рекомендации по косметике как информационный сервис;
- объяснять роль ингредиентов в косметическом уходе;
- собирать ограниченный профиль пользователя для персонализации при прозрачной политике обработки данных;
- использовать официально опубликованные карточки товара как source layer при аккуратном режиме доступа и уважении ограничений сайта.

### 17.2 Где высокий риск

#### Риск 1. Уйти в медицину
Если бот:
- ставит диагнозы;
- обещает лечение;
- интерпретирует выраженные симптомы как заболевание;
- советует терапию вместо врача,

то продуктовый риск резко растет.

Практический вывод:
- позиционировать продукт как `cosmetic advisor`, а не `medical assistant`;
- не использовать wording вроде `лечит`, `устраняет заболевание`, `назначает`;
- все красные флаги отправлять к врачу.

#### Риск 2. Персональные данные и special category data
По актуальным материалам по РБ данные о здоровье относятся к чувствительной категории. Для не-медицинского продукта это означает:
- не собирать лишнее;
- не провоцировать ввод медицинских данных;
- не хранить свободные описания заболеваний как основу профиля;
- получать понятное согласие на обработку персональных данных;
- иметь политику обработки данных и срок хранения.

Практический вывод для MVP:
- использовать закрытый косметический опросник;
- не строить долгую medical memory;
- давать пользователю возможность удалить профиль и историю.

#### Риск 3. Парсинг и использование данных доноров
Наличие `robots.txt`, который не запрещает весь сайт, не означает полного разрешения на коммерческий re-use.

Практический вывод:
- парсить осторожно, с rate limiting;
- не копировать лишний контент;
- при росте продукта готовить партнерский или лицензионный контур;
- не использовать товарные знаки так, будто продукт официальный без прямого основания.

#### Риск 4. Внешние отзывы
Полные тексты отзывов с внешних площадок могут подпадать под ограничения ToS, авторского права и UGC-политик.

Практический вывод:
- для MVP отзывы не обязательны;
- later-stage лучше использовать агрегаты, summary и сигналы, а не wholesale copy.

#### Риск 5. Cross-border transfer
Если LLM или аналитика работают через зарубежный API:
- это нужно раскрывать в privacy-policy;
- нужен отдельный review правового основания и трансграничной передачи.

### 17.3 Минимальный compliance checklist перед запуском
- privacy policy;
- user consent text в боте;
- disclaimer `не врач`;
- delete-my-data flow;
- incident owner for bad recommendation reports;
- robots/ToS review по каждому донору;
- human-reviewed список unsafe intents и refuse-templates.

## 18. Trend & Timing Map

| Signal | Signal strength | Time horizon | Adoption barrier | Timing verdict |
|---|---|---|---|---|
| Рост интереса к explainable AI в consumer flows | Strong | Now | недоверие к black-box AI | Build now |
| Рост осознанного выбора skincare по составу | Strong | Now | пользователь устает от сложных INCI | Build now |
| Сдвиг commerce в conversational surfaces | Medium | 3-6 months | UX бота может быть перегружен | Build now |
| Использование UGC/reviews как слоя доверия | Medium | 6-18 months | legal/ToS вопросы | Monitor |
| Диагностика по фото для skincare | Weak-to-medium | 6-18 months | высокий legal и quality risk | Reject for MVP |

## 19. Metrics and validation

### North-star для MVP
`Recommendation Acceptance Rate`

Это доля пользователей, которые после первой рекомендации:
- сохраняют результат;
- переходят в карточку;
- запрашивают похожий продукт или follow-up, а не бросают сценарий.

### 3 ключевые метрики

| Метрика | Как мерить | Частота |
|---|---|---|
| Onboarding completion rate | `/start -> completed profile` | ежедневно |
| Recommendation acceptance rate | доля завершивших сценарий с позитивным действием | ежедневно |
| Explainability usefulness score | thumbs up / explicit feedback `понятно` | еженедельно |

### Anti-metrics

| Anti-metric | Почему важна |
|---|---|
| Unsafe medical escalation rate | нельзя допускать ухода в псевдомедицинские советы |
| Recommendation mismatch complaints | нельзя жертвовать качеством ради конверсии |
| Off-topic drift rate | бот не должен расползаться в general chat |

### Критерий валидации MVP
- пользователи доходят до рекомендации без сильного оттока;
- объяснение считается полезным;
- follow-up диалог не расползается в off-topic;
- жалобы на нерелевантность не доминируют.

## 20. Основные риски

| Риск | Вероятность | Влияние | Снижение |
|---|---|---|---|
| Бот звучит как врач | Medium | High | жесткие guardrails и disclaimer |
| Неполные или грязные составы | Medium | High | confidence gating и отказ при low confidence |
| Непрозрачный AI output | Medium | High | rules-first + explanation template |
| Пользователь устает от длинного опросника | High | Medium | сократить до 6-8 обязательных ответов |
| Правовые претензии к парсингу/UGC | Medium | High | legal review, rate limit, phased data usage |
| Низкое доверие к одному бренду | Medium | Medium | explainability и четкое brand focus positioning |

## 21. Go-to-Market

### Канал дистрибуции
- Telegram
- TikTok/Reels/short-form контент про составы
- skincare-подборки в Telegram-каналах
- посевы в сообществах по уходу и beauty-shopping

### Как привлечь первые 100 пользователей
1. Запустить бота с понятным promise: `подберу Belita по составу`.
2. Сделать 10-15 коротких контент-единиц в стиле:
   - `почему этот крем подходит сухой коже`;
   - `как читать INCI за 30 секунд`;
   - `3 Belita-средства для чувствительной кожи`.
3. Собирать реальные use cases и скриншоты explainability.
4. Дать простой CTA: `пройди опрос за 1 минуту и получи разбор`.

### Бизнес-модель
На текущем этапе разумнее проверять:
- affiliate / referral потенциал;
- CPA / e-commerce partnership;
- paid premium later: comparison, advanced routine, personal history, deal alerts.

Для раннего продукта прямую монетизацию не ставить в центр. Сначала подтвердить trust and utility.

## 22. Exit / Pivot logic

### Pivot, если
- пользователям интереснее общий skincare advisor, а не Belita-only;
- бот нужен как `ingredient explainer`, а не как recommender;
- Telegram удобен только как acquisition, а не как core surface.

### Закрыть инициативу, если
- пользователи не ценят explainability;
- Belita-only scope слишком узкий и не дает retention;
- legal cost на data layer несоразмерен ценности.

### Что можно переиспользовать
- ingredient knowledge base;
- explainability logic;
- profile-to-product matching engine;
- conversational flows.

## 23. Итоговая рекомендация

### Вердикт
`Можно начинать следующий шаг проектирования.`

### Почему
- идея достаточно конкретна;
- MVP имеет узкий, понятный scope;
- у продукта есть дифференциатор;
- риск управляем, если держать строгую границу `cosmetic advisor, not medical advisor`.

### Что критично не сломать
- не превращать MVP в web-platform;
- не делать LLM-only brain;
- не собирать избыточные health-like данные;
- не обещать лечебный эффект;
- не тянуть внешние отзывы в core MVP до отдельного legal review.

## 24. Handoff для P-20

Следующий шаг должен определить:
- модель данных каталога и INCI;
- правила матчинг-скоринга;
- architecture for ingestion from `belita-shop.by` and `belita.by`/`vitex.by`;
- storage strategy для user profile и recommendations;
- bounded AI orchestration;
- moderation/safety rules на уровне prompt + policy + business logic.
