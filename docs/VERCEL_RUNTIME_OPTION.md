# Vercel as 24/7 Runtime Option for BELITA Bot

Проверено: `2026-03-28`

## Short Answer

`Vercel` можно использовать для нашего будущего бота, но только в формате:

- `webhook-based bot`, а не `long polling`;
- `stateless request handlers`, а не всегда запущенный Python-процесс;
- external online storage для knowledge layer (`Qdrant Cloud`, `Turso`, `Upstash`, и т.д.), а не локальный `sqlite.db` на ПК.

## Core Fit

### Что подходит

- Telegram webhook endpoint можно принять обычной HTTP function.
- Vercel Cron Jobs доступны на всех планах, значит можно запускать:
  - health checks,
  - refresh jobs,
  - reindex triggers,
  - backup/export tasks.
- Hobby plan free forever.

### Что не подходит

- Vercel не дает "вечно живой Python-бот", который просто крутится как daemon.
- Если оставить текущий `aiogram long polling`, Vercel не решает задачу.
- Если knowledge/data лежат только на домашнем ПК, Vercel тоже не спасает.

## Official Facts

### Hobby plan

- `Vercel Hobby` — free tier, free forever.
- Official fair use / terms say Hobby is only for `personal` and `non-commercial` use.
- На Hobby нет доплаты за перерасход: если упираешься в free caps, обычно нужно ждать reset окна использования.
- Included usage on Hobby from official docs:
  - `1,000,000` function invocations;
  - `100 GB-hours` function duration;
  - `4 CPU-hours` active CPU;
  - `360 GB-hours` provisioned memory.

### Python runtime

- Python runtime на Vercel официально доступен на всех планах, но помечен как `Beta`.
- Python function bundle limit: `500 MB` uncompressed.
- By default Python runtime bundles reachable files from the repo, so project size hygiene критична.

### Function execution

- With Fluid Compute on Hobby:
  - default/max duration for Node.js and Python runtimes: `300s / 300s`.
- Without Fluid Compute:
  - Hobby default `10s`, configurable up to `60s`.
- Это значит:
  - webhook handling для Telegram подходит;
  - долгий background pipeline / тяжелый reindex лучше не держать внутри обычного bot request path.

### Cron

- Vercel Cron Jobs доступны на всех планах.
- Это удобно для scheduled sync, refresh или lightweight ingestion orchestration.

## What This Means for Our Bot

### Good Vercel architecture

Подход, который имеет смысл:

1. Telegram отправляет update на `Vercel Function` по webhook.
2. Function быстро:
   - валидирует update,
   - достает user context из online DB,
   - дергает retrieval backend,
   - собирает prompt,
   - вызывает LLM,
   - отвечает в Telegram API.
3. Catalog / vectors / memory лежат не на ПК:
   - `Qdrant Cloud` или `Turso` для knowledge;
   - отдельно online relational/session storage при необходимости.

### Bad Vercel architecture

Подход, который не стоит брать:

- держать `aiogram` как постоянно живущий polling worker;
- пытаться хранить основной knowledge layer на домашнем `sqlite.db`;
- запускать heavy reindexing прямо из webhook function;
- рассчитывать, что Vercel заменит managed vector DB.

## Risks

### 1. Python runtime is Beta

Это не blocker, но это технический риск. Для production-grade Telegram runtime это слабее, чем mature Node route handlers.

### 2. Current stack mismatch

Наш текущий инженерный стек сейчас естественнее ложится на:

- локальный Python bot runtime;
- локальный SQLite;
- локальный Qdrant.

Если идти в Vercel, это уже не "просто хостинг", а переход к новой runtime-модели:

- webhook instead of polling;
- cloud storage instead of local files;
- smaller stateless bot application services.

### 3. Free cap behavior

На Hobby нельзя просто "докупить чуть-чуть". Если превысишь free usage, часть функций/ресурсов может стать недоступной до reset окна.

### 4. Commercial-use restriction

Если бот станет реальным продуктом, пусть даже early commercial pilot, Hobby уже плохая юридико-платформенная база.

## Verdict

### Verdict for BELITA Bot

`Vercel` — рабочий вариант только как `serverless webhook runtime`.

Итоговая оценка:

- как замена `always-on VPS` для webhook bot: `да, условно подходит`;
- как место для текущего Python long-polling бота: `нет`;
- как полная бесплатная 24/7 замена и runtime, и database, и vector layer: `нет`;
- как long-term основа коммерческого бота на Hobby: `нет`.

## Recommendation

Если выбирать Vercel, то только по такой схеме:

1. перевести бота на webhook-модель;
2. вынести knowledge/data layer в online storage;
3. оставить ingestion/reindex как отдельный pipeline;
4. не делать Vercel источником истины для knowledge itself.

## Preferred Role of Vercel in This Project

Лучшее применение Vercel для нас:

- `Telegram webhook gateway`
- `lightweight application layer`
- `cron-based orchestrator`

Хуже всего Vercel подходит как:

- `always-on Python worker`
- `main vector database`
- `heavy ETL runner`
