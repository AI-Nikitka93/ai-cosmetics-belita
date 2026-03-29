# Free 24/7 Implementation Plan for BELITA Bot

Проверено: `2026-03-28`
Основание: используется свежий `RESEARCH_LOG` от `2026-03-28`, повторный интернет-поиск не нужен.

## Цель

Поднять `BELITA Skin Match` так, чтобы:

- пользователь мог зайти в бот ночью, когда домашний ПК выключен;
- бот отвечал `24/7` на бесплатном pilot-стеке;
- knowledge layer работал онлайн;
- текущий локальный Python pipeline не выбрасывался, а использовался как baseline и source of truth для data-prep;
- архитектура не ломалась при будущем переходе на paid floor.

## Жесткая правда до начала внедрения

Нужно честно зафиксировать:

- на free-стеке можно сделать `работающий 24/7 pilot`;
- на free-стеке нельзя обещать `production SLA`;
- у любого бесплатного варианта будут:
  - квоты,
  - rate limits,
  - риски inactivity,
  - отсутствие сильной поддержки,
  - потенциальный forced migration later.

Итог:
- план ниже делает бот реально доступным онлайн;
- но это `best-effort free 24/7`, а не enterprise-grade uptime.

## Выбранный целевой стек

### Runtime

- `Cloudflare Workers Free`

Почему:
- лучший verified free runtime для webhook-бота;
- не требует держать свой ПК включенным;
- лучше подходит для stateless Telegram webhook flow, чем `Vercel Hobby`.

### Persistent app storage

- `Turso Free`

Что хранить:
- users
- questionnaire profile
- summarized chat memory
- bot settings
- light operational tables

Почему:
- сильный free SQL layer;
- no credit card required;
- подходит как online source of truth для user context.

### Vector knowledge base

- `Qdrant Cloud Free`

Что хранить:
- embeddings products
- payload с ingredient flags
- retrieval metadata

Почему:
- лучший verified free managed vector option;
- минимальный conceptual drift от текущего `Qdrant Local`.

### Ephemeral state / rate limiting / cache

- `Upstash Redis Free`

Что хранить:
- Telegram FSM state
- short-lived anti-spam / rate-limit counters
- short cache for retrieval/LLM responses

Почему:
- free serverless Redis подходит именно для glue-layer;
- не надо перегружать этим Turso.

### LLM layer

- primary: `Groq Free`
- fallback: `OpenRouter free`

Почему:
- это strongest verified free pair из уже проведенного research.

### Local/offline ingestion

- текущие Python-скрипты остаются локальными:
  - `scripts/catalog_scraper.py`
  - `scripts/inci_enricher.py`
  - `scripts/load_to_sqlite.py`
  - `scripts/index_to_qdrant.py`

Почему:
- serving users 24/7 и обновление каталога — это две разные задачи;
- чтобы бот отвечал ночью, ingestion не обязан крутиться ночью;
- сначала делаем online serving, потом автоматизацию sync.

## Итоговая целевая схема

```text
Telegram
  -> Webhook
  -> Cloudflare Worker
     -> Turso Free (user profile, memory summary, settings)
     -> Upstash Redis Free (FSM, throttling, cache)
     -> Qdrant Cloud Free (product retrieval)
     -> Groq Free
     -> OpenRouter free fallback

Local PC / Dev machine
  -> Scraping + enrichment + SQLite build
  -> Local validation
  -> Push/reindex to Qdrant Cloud + sync structured tables to Turso
```

## Что будет работать 24/7 уже на бесплатном пилоте

### Будет работать

- пользователь пишет боту ночью;
- Telegram доставляет webhook в online runtime;
- runtime читает профиль пользователя;
- runtime достает кандидатов из online vector DB;
- runtime собирает answer через LLM;
- бот отвечает без включенного ПК.

### Не обязано работать 24/7 на шаге 1

- автоматический nightly scraping;
- постоянный фоновый reindex;
- сложные long-running ETL jobs.

И это нормально.

Чтобы бот был доступен ночью, не нужно круглосуточно гонять парсер.

## План внедрения

## Stage 1 — Freeze baseline

### Цель

Зафиксировать текущий локальный baseline как fallback и источник подготовки данных.

### Действия

1. Не менять текущий local stack:
   - `sqlite.db`
   - `qdrant_db`
   - local ingestion scripts
2. Зафиксировать contracts:
   - retrieval input
   - retrieval output
   - user profile schema
   - memory summary schema
3. Выделить адаптеры:
   - `UserStore`
   - `MemoryStore`
   - `VectorStore`
   - `RateLimitStore`
   - `LLMClient`

### Критерий завершения

- bot logic умеет работать через интерфейсы, а не напрямую через локальные файлы.

## Stage 2 — Make the bot webhook-first

### Цель

Убрать зависимость от `long polling` и домашнего ПК.

### Действия

1. Перепроектировать bot entrypoint в `webhook` model.
2. Сделать HTTP handler, который:
   - принимает Telegram update;
   - валидирует secret/path;
   - преобразует update в internal command/query;
   - вызывает orchestration layer;
   - быстро отдает ответ.
3. Сохранить anti-risk guardrails и domain boundaries.

### Критерий завершения

- bot больше не зависит от локального polling процесса.

## Stage 3 — Move user context online

### Цель

Сделать так, чтобы профиль и память пользователя жили не на ПК.

### Действия

1. Создать online relational schema в `Turso Free`.
2. Вынести туда:
   - `users`
   - `user_profiles`
   - `conversation_memory`
   - `safety_events`
   - `bot_runtime_state` если нужно
3. Хранить в памяти не raw-medical record, а:
   - structured skincare profile
   - `self_reported_condition`
   - preference flags
   - safety summary

### Критерий завершения

- пользователь после повторного входа получает continuity even when local machine is offline.

## Stage 4 — Move vector search online

### Цель

Сделать retrieval доступным без локального `qdrant_db`.

### Действия

1. Создать `Qdrant Cloud Free` collection.
2. Поддержать cloud adapter рядом с local adapter.
3. Загружать туда:
   - product vectors
   - payload flags
   - ingredient-based derived knowledge
4. Добавить health-check retrieval query.

### Критерий завершения

- retrieval from online collection возвращает те же типы результатов, что local baseline.

## Stage 5 — Add short-lived online state

### Цель

Убрать transient state из runtime memory.

### Действия

1. Подключить `Upstash Redis Free`.
2. Вынести в Redis:
   - FSM state
   - anti-flood counters
   - short-lived request dedup
   - answer cache for repeated prompts
3. Поставить TTL на все ephemeral keys.

### Критерий завершения

- stateless runtime survives cold starts/redeploys without losing active mini-dialog state.

## Stage 6 — Deploy online runtime

### Цель

Сделать bot serving online `24/7`.

### Действия

1. Деплоить bot runtime в `Cloudflare Workers Free`.
2. Настроить Telegram webhook.
3. Ограничить request path:
   - без heavy parsing;
   - без heavy indexing;
   - без больших synchronous jobs.
4. Сделать timeout-safe response pattern.

### Критерий завершения

- bot отвечает на реальные Telegram updates без участия домашнего ПК.

## Stage 7 — Add graceful degradation

### Цель

Чтобы free-tier сбои не делали бот полностью мертвым.

### Действия

1. Если `Groq` недоступен:
   - переключение на `OpenRouter free`.
2. Если `Qdrant Cloud` недоступен:
   - бот отвечает safe fallback:
     - без новых рекомендаций высокой точности;
     - с объяснением, что knowledge lookup временно ограничен.
3. Если Redis недоступен:
   - бот продолжает работать без short cache/FSM continuity.
4. Если Turso недоступен:
   - read-only fallback для анонимного ответа без памяти.

### Критерий завершения

- partial outages не приводят к total outage.

## Stage 8 — Add sync path from local pipeline

### Цель

Сделать controlled data refresh без обязательного always-on ПК.

### Действия

1. Оставить локальный pipeline как authoring pipeline.
2. После local refresh запускать:
   - rebuild SQLite
   - rebuild/reindex vectors
   - push to `Qdrant Cloud`
   - sync structured metadata to `Turso`
3. Делать sync идемпотентным.

### Критерий завершения

- обновление каталога не требует ручной починки online runtime.

## Stage 9 — Add minimal observability

### Цель

Увидеть проблему раньше пользователя.

### Действия

1. Логировать:
   - incoming updates count
   - retrieval latency
   - LLM fallback rate
   - error rate
   - provider failures
2. Отдельно считать:
   - quota burn estimate
   - top failing paths
3. Сделать admin ping / health endpoint.

### Критерий завершения

- можно быстро понять, что именно умерло: runtime, DB, vector store или provider.

## Stage 10 — Set migration thresholds

### Цель

Не упереться молча в free caps.

### Нужно заранее определить

1. Когда уходим с free runtime:
   - sustained traffic near Workers daily cap;
   - CPU-heavy orchestration;
   - need for more precise scheduling.
2. Когда уходим с free vector:
   - Qdrant inactivity risk becomes unacceptable;
   - collection grows beyond comfortable free envelope;
   - retrieval traffic стабильно жжет quota.
3. Когда уходим с free LLM:
   - free quotas regularly exhausted;
   - latency/availability degrades user experience.

### Критерий завершения

- migration trigger определен до первого серьезного роста.

## Минимальный бесплатный rollout order

### Порядок без лишнего риска

1. Оставить local ingestion как есть.
2. Вынести user profile и memory в `Turso Free`.
3. Вынести vectors в `Qdrant Cloud Free`.
4. Подключить `Upstash Redis Free`.
5. Перевести bot на webhook.
6. Задеплоить runtime в `Cloudflare Workers Free`.
7. Подключить `Groq Free` + `OpenRouter free`.
8. Добавить fallback logic и health checks.

## Что нельзя делать

- Нельзя пытаться держать текущий `aiogram long polling` как будто это и есть 24/7 online bot.
- Нельзя завязывать user-serving path на домашний `sqlite.db`.
- Нельзя делать heavy scraping/indexing прямо в request path.
- Нельзя рассчитывать, что один бесплатный сервис "закроет все".
- Нельзя обещать SLA на free stack.

## Acceptance Criteria для free 24/7 pilot

- Telegram bot отвечает при выключенном домашнем ПК.
- User profile доступен после повторного входа.
- Retrieval идет из online vector store.
- При недоступности primary LLM есть fallback.
- При частичном падении одного сервиса бот не умирает полностью.
- Локальный ingestion pipeline остается рабочим baseline.
- Архитектура готова к paid migration без полного переписывания.

## Лучший practical verdict

Если нужен **реально работающий бесплатный pilot 24/7**, то лучший план сейчас такой:

1. `Cloudflare Workers Free` — runtime
2. `Turso Free` — profiles + memory
3. `Qdrant Cloud Free` — vector retrieval
4. `Upstash Redis Free` — transient state
5. `Groq Free` — primary LLM
6. `OpenRouter free` — fallback LLM
7. local PC — only for ingestion/reindex

Это не идеальный production stack.
Но это лучший verified путь, чтобы бот был доступен пользователю ночью без включенного ПК и без немедленных затрат.
