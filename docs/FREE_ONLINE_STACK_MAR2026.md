# Free Online Stack Options for BELITA Bot — March 2026

Проверено: `2026-03-28`
Контекст: найти актуальные на март `2026` online-варианты, которые можно использовать без домашнего ПК для `BELITA Skin Match`, с акцентом на `free`, `24/7 access`, `Telegram bot`, `RAG`, `knowledge base`, `zero-budget pilot`.

## Что именно исследовано

Под "online и бесплатно" в этом документе понимаются только практичные для нашего бота компоненты:

1. `Runtime / hosting` — где живет Telegram bot, пока ПК выключен.
2. `Relational / session storage` — user context, dialog memory, service metadata.
3. `Vector / knowledge layer` — RAG index и retrieval.
4. `KV / cache / ephemeral state` — rate limits, short-lived memory, queues-like glue.
5. `LLM / inference providers` — если нужен внешний online inference.

Не включены:
- локально self-hosted решения;
- платные-only сервисы;
- варианты, по которым в этой сессии не удалось подтвердить free/limits из официальных источников;
- "free credits" как полноценная free-forever альтернатива, если credits быстро заканчиваются.

## Executive Summary

### Главный вывод

Если твой ПК выключен, нужны **оба** слоя онлайн:

1. `bot runtime online`
2. `knowledge/data online`

Одной только online vector DB недостаточно.

### Самый практичный free stack под наш бот сейчас

#### Option A — самый прагматичный free pilot

- `Cloudflare Workers Free` — webhook runtime
- `Qdrant Cloud Free` — vector knowledge base
- `Upstash Redis Free` — ephemeral state / rate limiting / short-lived cache
- `Groq Free` + `OpenRouter free` — LLM providers
- локальный ingestion/reindex pipeline остается офлайн, запускается отдельно

Почему:
- все компоненты реально живут онлайн;
- ПК может быть выключен;
- минимальный paid-risk на старте;
- нет необходимости тянуть always-on VPS.

#### Option B — если хотим один online data layer вместо split storage

- `Cloudflare Workers Free` или `Vercel Hobby`
- `Turso Free` — SQL + vector search в одном месте
- `Groq Free` + `OpenRouter free`

Почему:
- проще operationally;
- меньше sync drift между SQL и vector layer;
- но меньше зрелости именно для retrieval-heavy сценария, чем у pure vector stack.

### Жесткая правда

На март `2026` почти нет варианта, который одновременно дает:

- true `free forever`,
- `24/7` без inactivity risk,
- без карты,
- без non-commercial ограничений,
- без free-tier ceilings,
- и при этом production-grade SLA.

Итог:
- для бесплатного pilot — варианты есть;
- для реального стабильного production 24/7 — потом почти наверняка понадобится paid floor.

## 1. Runtime / Hosting

### 1.1 Verified runtime options

| Option | Free status | No card from checked source | 24/7 fit | Main limits / risks | Verdict |
|---|---|---|---|---|---|
| Cloudflare Workers Free | Yes | Not explicitly confirmed in checked source | Medium | `100,000` requests/day, `10 ms` CPU, `5` cron triggers/account | Best free webhook runtime |
| Vercel Hobby | Yes | Not explicitly confirmed in checked source | Medium | personal/non-commercial only; Python `Beta`; free caps; cron only once/day on Hobby | Good only for personal webhook pilot |
| Deno Deploy Free | Yes | Not confirmed in this pass | Medium | free plan exists, but exact current operational limits not fully captured in this pass | Incomplete |
| Fly.io | Not meaningfully free for new users | No | Low | legacy free allowances only; current path is paid/free-trial oriented | Not a true current free option |

### 1.2 Cloudflare Workers Free

Official checked facts:
- Workers Free: `100,000` requests/day.
- CPU time on Free: `10 ms`.
- Memory: `128 MB`.
- Cron Triggers: `5` per account.
- Cloudflare Pages Functions also count against the same Workers Free quota.

Практический вывод:
- для Telegram webhook bot это реально рабочий вариант;
- для heavy processing inside request handler — слабовато;
- лучше держать handler тонким: validate -> retrieve -> call LLM -> respond.

### 1.3 Vercel Hobby

Official checked facts:
- Hobby is free.
- Hobby is for `personal` / `non-commercial` use.
- Included usage:
  - `1,000,000` invocations;
  - `100 GB-hours` function duration;
  - `4 CPU-hours` active CPU;
  - `360 GB-hours` provisioned memory.
- Python runtime is available in `Beta` on all plans.
- Python bundle limit: `500 MB` uncompressed.
- On Hobby, cron minimum interval is `once per day`.
- Cron timing on Hobby is not exact.

Практический вывод:
- Vercel подходит только как `serverless webhook gateway`;
- не подходит как хост для текущего `aiogram long polling`;
- не стоит брать как долгосрочную коммерческую базу на Hobby.

### 1.4 Netlify

Official checked facts in this pass:
- Scheduled Functions существуют.
- Scheduled Functions have `30 second` execution limit.

Статус:
- `incomplete`.

Почему:
- в этой сессии не удалось надежно подтвердить current free-plan pricing/quotas именно из official pricing docs.

### 1.5 Fly.io

Official checked facts:
- current docs описывают только legacy free allowances для старых организаций;
- current free option для новых пользователей как полноценный steady-state tier не подтвержден;
- docs говорят про deprecated free/hobby history и trial/paid migration path.

Практический вывод:
- не считаю Fly.io реальным current free foundation для нового бота.

## 2. Relational / Session / User Context Storage

| Option | Free status | No card from checked source | 24/7 fit | Main limits / risks | Verdict |
|---|---|---|---|---|---|
| Turso Free | Yes | Yes | Medium-High | free ceilings by active DB / rows / storage; verify real runtime behavior in target region | Best single-store candidate |
| Cloudflare D1 | Yes | Not explicitly confirmed in checked source | Medium | tied to Workers ecosystem; request/compute limits inherit Workers usage | Best if we go full Cloudflare |
| Upstash Redis Free | Yes | Card not needed for free DBs inferred from docs pattern; explicit for free DB creation in account docs | Medium | `256MB`, `500K` commands/month, 1 free DB | Best ephemeral/session store |
| Neon Free | Yes | Yes | Low-Medium | scale to zero after `5` minutes inactivity; `0.5GB` storage | Fine for low-duty pilot |
| Supabase Free | Yes | Not explicitly confirmed in checked source | Low-Medium | very low-activity apps may be paused after `7` days | Strong DX, weak free 24/7 guarantee |
| MongoDB Atlas M0 | Yes | Not verified in this pass | Low-Medium | `512MB`; vector/search economics separate and unclear for our case | Incomplete for our needs |

### 2.1 Turso Free

Official checked facts:
- `Start free today, no credit card required`.
- Free includes:
  - `100` databases;
  - `100` monthly active databases;
  - `5GB` storage;
  - `500M` rows read/month;
  - `10M` rows written/month.
- Vector search is part of Turso’s feature set.
- Official materials around cold starts changed over time:
  - newer materials say `no more cold starts`;
  - older deprecated docs still reference scale-to-zero behavior for older plans.

Практический вывод:
- это один из самых сильных вариантов для one-store architecture;
- перед реальным выбором нужно сделать live smoke-test по latency и cold-start behavior.

### 2.2 Cloudflare D1

Official checked facts:
- D1 is available on Free and Paid plans.
- It is Cloudflare’s managed serverless database with SQLite semantics.
- Great fit if app runtime also lives in Workers/Pages.

Практический вывод:
- D1 силен, если выберем Cloudflare как whole platform;
- если runtime будет не на Cloudflare, value снижается.

### 2.3 Upstash Redis Free

Official checked facts:
- Free tier:
  - `256MB` data size;
  - `500K` commands/month;
  - `1` free database.
- Upstash docs explicitly explain that entering a credit card upgrades you from free to PAYG, meaning free path exists without forced billing entry.

Практический вывод:
- отличный online session store;
- не main source of truth для каталога, но идеален для:
  - user session,
  - FSM state,
  - short-term memory,
  - rate limiting,
  - cache.

### 2.4 Neon Free

Official checked facts:
- `Free` is `$0/month`.
- `No time limits, no credit card required`.
- `100` CU-hours per project.
- `0.5GB` storage.
- scale to zero after `5` minutes inactive.

Практический вывод:
- хороший бесплатный Postgres pilot;
- для стабильного nighttime bot experience может давать cold-start style latency.

### 2.5 Supabase Free

Official checked facts:
- Supabase supports `pgvector`.
- Free DB size documented as `500 MB`.
- Official production guidance says very low activity free apps may be paused after `7` days.

Практический вывод:
- хороший DX и быстрый старт;
- но под требование "бот должен быть доступен ночью всегда" free-tier pause — серьезный минус.

## 3. Vector / Knowledge Base / RAG

| Option | Free status | No card from checked source | 24/7 fit | Main limits / risks | Verdict |
|---|---|---|---|---|---|
| Qdrant Cloud Free | Yes | Yes | Medium | suspend after `1` week unused; delete after `4` weeks inactivity | Best pure vector option |
| Turso Vector Search | Yes | Yes | Medium-High | vector fit depends on our retrieval needs and SQL-centric model | Best one-store experiment |
| Upstash Vector Free | Yes | Yes | Medium | `10K` queries/updates daily; `1` free DB | Best low-volume serverless vector pilot |
| Cloudflare Vectorize | Yes, via Workers Free included usage | Not explicitly confirmed | Medium | tied to Workers; dimensional quotas | Best if full Cloudflare stack |
| Pinecone Starter | Yes | Not confirmed in checked source | Medium | starter framing, limited footprint | Viable fallback |
| Supabase pgvector | Yes | Not confirmed in checked source | Low-Medium | pause risk from free projects | Fine for dev, not best free 24/7 |
| Neon pgvector | Yes | Yes | Low-Medium | scale-to-zero latency | Fine for dev pilot |
| Weaviate Sandbox | Yes | Yes for sandbox | Low | expires after `14` days | Evaluation only |
| Chroma Cloud | Credits only | Not confirmed in checked source | Low | `$5` credits then usage billing | Trial-like, not free forever |
| MongoDB Atlas Vector Search | Not meaningfully free for our case | Not verified | Low | vector pricing tied to search nodes/flex economics | Not selected |

### 3.1 Qdrant Cloud Free

Official checked facts:
- free forever tier exists;
- single node cluster;
- `0.5 vCPU / 1GB RAM / 4GB disk`;
- no credit card required from checked docs;
- cluster lifecycle:
  - suspended after `1` week unused;
  - deleted after `4` weeks inactivity.
- optimization guide says `1GB` RAM is roughly enough for around `1M` vectors at `768` dimensions.

Практический вывод:
- лучший current free vector backend для нашего проекта;
- для живого бота подходит;
- нужен keepalive/monitoring, если трафик нерегулярный.

### 3.2 Upstash Vector Free

Official checked facts:
- `$0` free tier;
- `10,000` queries and `10,000` updates daily;
- one free vector DB;
- docs for account/payment clearly state free DB creation does not require payment method.

Практический вывод:
- отличный небольшой pilot;
- для chat-heavy bot daily cap может стать бутылочным горлышком.

### 3.3 Cloudflare Vectorize

Official checked facts:
- Workers Free includes:
  - `30 million` queried vector dimensions/month;
  - `5 million` stored vector dimensions.
- Cloudflare explicitly says Workers free tier always includes ability to prototype with Vectorize.

Практический вывод:
- сильный вариант, если уйдем в Cloudflare-first stack;
- слабее как isolated choice без переезда runtime туда же.

### 3.4 Pinecone Starter

Official checked facts:
- Starter plan remains free.
- Official limits/release notes indicate:
  - `1` project;
  - `5` serverless indexes;
  - region constraints;
  - around `2GB` storage footprint in current starter framing.

Практический вывод:
- технически usable;
- но для zero-budget stack у нас есть более прозрачные альтернативы с меньшей billing ambiguity.

### 3.5 Weaviate Sandbox

Official checked facts:
- sandbox is free;
- does not require billing account;
- expires after `14` days.

Практический вывод:
- это не база знаний для постоянного бота;
- только для evaluation.

### 3.6 Chroma Cloud

Official checked facts:
- new users get `$5` credits;
- pricing usage-based after that.

Практический вывод:
- не проходит strict filter `free forever`.

## 4. KV / Cache / Short-Lived State / Glue

| Option | Free status | No card from checked source | Best use | Verdict |
|---|---|---|---|---|
| Upstash Redis Free | Yes | Yes-ish from checked docs pattern | FSM state, cache, rate limiting, session data | Best current KV pick |
| Cloudflare KV | Included within Workers ecosystem | Not explicitly confirmed | config, lightweight cache, flags | Good if Cloudflare-first |
| Deno KV | Free-tier existence partially confirmed | Not verified in this pass | lightweight edge KV | Incomplete |

Практический вывод:
- если runtime не в Cloudflare, easiest managed KV для нас — `Upstash Redis Free`;
- если runtime в Cloudflare, можно не плодить внешний KV и часть состояния вести в `KV`/`D1`.

## 5. LLM / Inference Providers

Важно:
- для online bot runtime не обязательно иметь online embeddings provider;
- vectors можно считать офлайн и заливать в online vector DB;
- online inference нужен только для answer generation / reranking / fallback.

| Option | Free status | No card from checked source | Limits / risks | Verdict |
|---|---|---|---|---|
| Groq Free | Yes | Not confirmed in checked source | hard RPM/RPD/TPM caps | Best primary free inference |
| OpenRouter free models | Yes | Not confirmed in checked source | low rate limits on `:free`; router variability | Best fallback |
| Cloudflare Workers AI | Included/usage-based in Cloudflare ecosystem | Not confirmed in this pass | ecosystem fit, but not fully cost-profiled in this pass | Incomplete |
| Hugging Face serverless inference | Free/community access exists | Not confirmed in this pass | quotas and reliability not fully verified in this pass | Incomplete |

### 5.1 Groq Free

Official checked facts from previous research:
- free rate limits on selected models, including:
  - `qwen/qwen3-32b`: `60 RPM / 1K RPD / 6K TPM / 500K TPD`
  - `meta-llama/llama-prompt-guard-2-86m`: `30 RPM / 14.4K RPD / 15K TPM / 500K TPD`
  - `openai/gpt-oss-20b`: `30 RPM / 1K RPD / 8K TPM / 200K TPD`

Практический вывод:
- сильный free primary provider;
- одной только Groq для живого бота мало, нужен fallback.

### 5.2 OpenRouter free

Official checked facts from previous research:
- `openrouter/free` released `2026-02-01`;
- `200,000` context;
- `$0` input/output tokens on the free router path;
- docs warn that free models have low rate limits.

Практический вывод:
- хороший fallback слой;
- не стоит считать его единственным production channel.

## 6. What Is Actually Usable for a Nighttime Bot

### Реально usable бесплатно

- `Cloudflare Workers Free`
- `Vercel Hobby` only for personal/non-commercial webhook pilot
- `Turso Free`
- `Qdrant Cloud Free`
- `Upstash Redis Free`
- `Upstash Vector Free`
- `Groq Free`
- `OpenRouter free`
- `Cloudflare D1`
- `Cloudflare Vectorize`

### Только для evaluation / слабый fit

- `Weaviate Sandbox`
- `Chroma Cloud`
- `Supabase Free`
- `Neon Free`
- `Pinecone Starter`

### Не считаю реальным free foundation в текущем pass

- `Fly.io` for new users
- `MongoDB Atlas Vector Search` for our use case
- `Render` / `Railway` / `Koyeb` as strict free 24/7 foundation

Причина:
- либо free path не подтвержден как meaningful current tier;
- либо free = credits/trial;
- либо free path слишком конфликтует с `24/7 online bot` сценарием.

## 7. Recommended Stack Variants

### Variant 1 — Best Zero-Budget Pilot

- Runtime: `Cloudflare Workers Free`
- Vector KB: `Qdrant Cloud Free`
- Session/KV: `Upstash Redis Free`
- LLM: `Groq Free` + `OpenRouter free`
- Ingestion/indexing: local/offline from PC or manual job runner

Плюсы:
- бот живет онлайн, пока ПК выключен;
- free-friendly;
- хороший баланс между простотой и реальной работоспособностью.

Минусы:
- это уже не current Python polling architecture;
- придется перейти на webhook-first runtime;
- Workers Free CPU limits требуют thin handlers.

### Variant 2 — Best Single-Store Cloud Experiment

- Runtime: `Cloudflare Workers Free` or `Vercel Hobby`
- Data + vectors: `Turso Free`
- LLM: `Groq Free` + `OpenRouter free`

Плюсы:
- меньше компонентов;
- проще data model;
- neat for small pilot.

Минусы:
- нужно отдельно проверить retrieval quality и latency;
- Vercel Hobby не годится как long-term commercial base.

### Variant 3 — Lowest Rewrite Personal Pilot

- Runtime: `Vercel Hobby`
- Vector KB: `Qdrant Cloud Free`
- Session storage: `Upstash Redis Free`

Плюсы:
- удобно поднять personal demo;
- HTTP/webhook path хорошо ложится на Vercel.

Минусы:
- Hobby only for personal/non-commercial use;
- Python runtime Beta;
- не лучшая база для настоящего продукта.

## 8. Final Verdict

### Если нужен живой бот ночью без включенного ПК

Лучший current answer:

- переносить runtime в `Cloudflare Workers` или другой serverless webhook platform;
- knowledge layer держать в `Qdrant Cloud Free` или `Turso Free`;
- short-lived state держать в `Upstash Redis Free`;
- локальный ПК использовать только для ingestion/reindex, а не для serving users.

### Если хочешь сохранить текущий Python polling почти без изменений

Бесплатного и по-настоящему надежного `24/7` хоста под это на март `2026` у нас в verified set нет.

### Самый честный shortlist

1. `Cloudflare Workers Free`
2. `Qdrant Cloud Free`
3. `Turso Free`
4. `Upstash Redis Free`
5. `Groq Free`
6. `OpenRouter free`

## 9. Sources

- `Cloudflare Workers`:
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://developers.cloudflare.com/workers/platform/pricing/
  - https://developers.cloudflare.com/pages/functions/pricing/
  - https://developers.cloudflare.com/d1/
  - https://developers.cloudflare.com/vectorize/platform/pricing/
- `Vercel`:
  - https://vercel.com/docs/plans/hobby
  - https://vercel.com/legal/terms
  - https://vercel.com/docs/functions/runtimes/python
  - https://vercel.com/docs/functions/configuring-functions/duration
  - https://vercel.com/docs/cron-jobs/usage-and-pricing
  - https://vercel.com/docs/cron-jobs/manage-cron-jobs
- `Qdrant`:
  - https://qdrant.tech/pricing/
  - https://qdrant.tech/documentation/cloud/create-cluster/
  - https://qdrant.tech/documentation/guides/optimize/
- `Turso`:
  - https://turso.tech/pricing
  - https://docs.turso.tech/features/ai-and-embeddings/vector-search
  - https://docs.turso.tech/features/scale-to-zero
  - https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan
- `Upstash`:
  - https://upstash.com/docs/redis/overall/pricing
  - https://upstash.com/docs/vector/overall/pricing
  - https://upstash.com/docs/common/account/addapaymentmethod
- `Supabase`:
  - https://supabase.com/docs/guides/database/extensions/pgvector
  - https://supabase.com/docs/guides/deployment/going-into-prod
- `Neon`:
  - https://neon.com/pricing
- `Weaviate`:
  - https://docs.weaviate.io/weaviate/quickstart
  - https://weaviate.io/developers/wcs/create-a-cluster
- `Chroma`:
  - https://docs.trychroma.com/cloud/pricing
- `Pinecone`:
  - https://docs.pinecone.io/docs/limits
  - https://docs.pinecone.io/troubleshooting/release-2025-04
- `MongoDB`:
  - https://www.mongodb.com/pricing
  - https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/
- `Fly.io`:
  - https://fly.io/docs/about/pricing/
