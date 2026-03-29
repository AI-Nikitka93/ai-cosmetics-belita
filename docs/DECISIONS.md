# DECISIONS

## 2026-03-28 18:30
- Решение: начинать с `Telegram Bot MVP`, а не с web.
  - Почему: минимальный time-to-value, быстрый диалоговый формат для опросника и объяснимой рекомендации, ниже стоимость запуска.

- Решение: recommendation engine должен быть `rules + ingredient knowledge + LLM explanation`, а не `LLM-only`.
  - Почему: нужен предсказуемый и проверяемый подбор, снижение галлюцинаций и понятный контроль риска.

- Решение: в MVP не использовать диагнозы и не строить продукт как медицинский советчик.
  - Почему: юридический и репутационный риск; продукт должен работать как explainable cosmetic advisor с жестким safety-слоем.

- Решение: официальные продуктовые карточки и INCI брать в первую очередь из `belita-shop.by` и связанных страниц `belita.by`/`vitex.by`.
  - Почему: это самые релевантные источники по бренду Belita/Vitex и они уже дают связку `карточка -> barcode -> состав`.

- Решение: внешние отзывы вынести из MVP в optional enrichment.
  - Почему: юридически и операционно это более рискованный контур, а для проверки core-hypothesis достаточно каталога, профиля кожи и объяснений по составу.

## 2026-03-28 19:02
- Решение: основной runtime storage для MVP — `SQLite`, а не managed Postgres.
  - Почему: строгий бюджет `$0`, отсутствие карты, простая эксплуатация, отсутствие SaaS-лимитов, достаточность для Telegram MVP.

- Решение: vector layer — `Qdrant local`, а не managed vector cloud.
  - Почему: zero-cost, hybrid retrieval, локальная on-disk persistence, нет риска платной привязки карты.

- Решение: LLM stack — `Groq Free API` как primary и `OpenRouter free` как fallback.
  - Почему: один бесплатный провайдер создает single point of failure по квотам; нужен резервный канал.

- Решение: медицинские состояния из свободного чата хранить только как `self-reported condition`.
  - Почему: это снижает регуляторный риск и не превращает память бота в медицинскую карту.

## 2026-03-28 19:29
- Решение: для donor ingestion использовать `requests + BeautifulSoup4`, а не browser automation.
  - Почему: `belita-shop.by`, `belita.by` и `vitex.by` отдают нужные карточки и составы в обычном HTML; браузерный слой здесь только усложнил бы `$0` MVP.

- Решение: enrichment делать по стратегии `barcode-first`, затем `title-search fallback`.
  - Почему: barcode дает самый надежный линк `product -> official composition page`; title search нужен как страховка на случай отсутствия прямой composition URL.

- Решение: ingestion pipeline сохраняет промежуточные JSON-артефакты перед SQLite.
  - Почему: это упрощает отладку HTML drift, делает pipeline прозрачным и позволяет повторно прогонять нормализацию без повторного scraping.

## 2026-03-28 20:03
- Решение: knowledge index строить в `QdrantClient(path="qdrant_db")` локально, без внешнего vector SaaS.
  - Почему: строгий бюджет `$0`, локальная разработка без карты и полная совместимость с архитектурой MVP.

- Решение: эмбеддинги для первого индекса генерировать через `fastembed` локально.
  - Почему: это бесплатный путь, уже поддержанный экосистемой Qdrant, без зависимости от платных API.

- Решение: перед индексированием дополнять продукты derived knowledge-слоем из `domain/ingredients.py`.
  - Почему: RAG должен искать не только по сырым строкам INCI, но и по семантическим признакам вроде `has_acids`, `fragrance_free`, `barrier_repair_fit`.

## 2026-03-28 20:14
- Решение: для будущего online pilot knowledge layer держать shortlist из `Qdrant Cloud Free`, `Turso Free` и `Upstash Vector Free`.
  - Почему: это самые сильные checked free-варианты под условие `$0`, без явной необходимости карты и без trial-only модели.

- Решение: не считать `Supabase Free`, `Weaviate Sandbox` и `Chroma Cloud` базовым 24/7 решением для knowledge слоя.
  - Почему: checked official sources показывают pause / expiry / credits-only модель, что делает их слабее для постоянной бесплатной работы бота.

- Решение: текущий `SQLite + Qdrant Local` оставить baseline до отдельного latency/quota smoke-test online backend.
  - Почему: free hosted layers дают больше operational uncertainty, чем локальный baseline; миграция должна идти через adapter и feature flag, а не через резкую замену хранилища.

- Решение: `Vercel` рассматривать только как `webhook runtime / lightweight gateway`, а не как основной always-on хост текущего Python-бота.
  - Почему: текущий стек опирается на Python polling/local files, а Vercel лучше подходит под stateless webhook handlers с external storage.

- Решение: не считать `Vercel Hobby` финальной базой для коммерческого 24/7 бота.
  - Почему: checked official docs и ToS ограничивают Hobby `personal/non-commercial` use, а free caps и serverless execution model делают его слабой заменой полноценного always-on runtime.

- Решение: основной shortlist для бесплатного online pilot на март `2026` — `Cloudflare Workers Free`, `Qdrant Cloud Free`, `Turso Free`, `Upstash Redis Free`, `Groq Free`, `OpenRouter free`.
  - Почему: это strongest verified combination, которая реально позволяет держать бот и знания онлайн без включенного домашнего ПК.

- Решение: не проектировать будущий online bot вокруг одного "магического" free сервиса.
  - Почему: в checked landscape нет сервиса, который одновременно закрывает runtime, relational storage, vector retrieval и free 24/7 guarantee без компромиссов.

- Решение: основной free 24/7 pilot plan строить вокруг `Cloudflare Workers Free + Turso Free + Qdrant Cloud Free + Upstash Redis Free + Groq Free + OpenRouter free`.
  - Почему: это strongest verified split-stack, который позволяет держать bot serving online при выключенном домашнем ПК и при этом не ломает текущий local baseline.

- Решение: конфликт `Python vs Cloudflare runtime` закрыть через разделение рантаймов, а не через попытку тащить текущий Python bot runtime в слабый free hosting.
  - Почему: для free `24/7` serving лучше подходит `TypeScript + grammY + Hono + Cloudflare Workers`, тогда как Python остается в offline ingestion lane, где он уже силен и не конфликтует с serverless-моделью.

## 2026-03-28 23:39
- Решение: вынести production-serving код в отдельный модуль `cloud-bot/`, а Python ingestion lane оставить отдельно.
  - Почему: это сохраняет чистую границу между offline data pipeline и edge runtime, упрощает deploy, зависимости и проверку serverless-ограничений.

- Решение: в Cloudflare runtime использовать `Qdrant /points/query` как основной text-search путь и поддерживать `Qdrant /points/search` только для сценария с уже готовым query vector.
  - Почему: edge runtime не должен генерировать локальные эмбеддинги внутри webhook handler; для честного semantic text search нужен HTTP-native Qdrant query path, согласованный с моделью индексирования.

## 2026-03-28 23:43
- Решение: основной бренд бота на текущем этапе — `Белита Skin Match`, базовый username-кандидат — `BelitaSkinMatchBot`.
  - Почему: название сразу связывает бренд, задачу подбора и современный формат AI-ассистента, при этом переносится на Mini App и Web без смены идентичности.

## 2026-03-29 01:41
- Решение: для `grammY` webhook runtime обязательно выполнять `await bot.init()` в bootstrap до `bot.handleUpdate(update)`.
  - Почему: без инициализации `grammY` падает с `Bot not initialized!`, что дает `500` на каждый Telegram webhook even для простого `/start`.

- Решение: schema-bootstrap Turso не должен валить весь webhook path.
  - Почему: `Telegram /start` и базовый UX должны отвечать даже при временных проблемах с persistent storage; ошибки БД должны переводить runtime в degraded mode, а не делать бот полностью недоступным.

## 2026-03-29 02:00
- Решение: не полагаться на Qdrant Cloud free-tier text-query inference для модели `BAAI/bge-small-en-v1.5`; в cloud runtime нужен lexical/degraded fallback.
  - Почему: реальный запрос в production показал `401 Unauthorized` от inference service с сообщением `This model: BAAI/bge-small-en-v1.5 is not allowed in free tier`.

- Решение: при пустом RAG-контексте бот обязан честно просить уточнение, а не генерировать гипотетические товары.
  - Почему: это снижает галлюцинации и сохраняет доверие, особенно пока cloud knowledge base неполная.

## 2026-03-29 02:50
- Решение: если цель — защитить код от копирования, основной репозиторий должен быть `private`, а в корне проекта нужен явный проприетарный `LICENSE`.
  - Почему: public GitHub не подходит как сильный механизм защиты исходников; проприетарная лицензия усиливает юридическую позицию, но не делает код невидимым.

- Решение: использовать `GitHub Actions` как временный бесплатный online ingestion path для nightly sync каталога.
  - Почему: это позволяет обновлять `sqlite.db`, JSON-артефакты и `Qdrant Cloud` без включенного домашнего ПК, не ломая текущий Python pipeline.

- Решение: не считать GitHub Actions заменой always-on парсеру.
  - Почему: scheduled workflows могут задерживаться и не дают строгой production-grade гарантии realtime-обновлений.
