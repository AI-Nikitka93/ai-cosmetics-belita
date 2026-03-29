# Free Online Knowledge Base Options for 24/7 Bot

Проверено: `2026-03-28`
Контекст: future online knowledge layer для `BELITA Skin Match` при ограничении `$0` и без риска внезапных платных списаний.

## Scope

Ниже перечислены не "вообще все сервисы мира", а релевантные managed/online варианты для RAG и knowledge storage, которые:
- имеют официальный free entry point;
- подходят для AI search / vector retrieval / hybrid KB;
- могут быть использованы будущим ботом онлайн, а не только локально.

## Short Verdict

Для нашего проекта под условие `онлайн + бесплатно + без карты + ближе всего к 24/7` лучше всего смотрятся:

1. `Qdrant Cloud Free` — лучший чистый managed vector candidate.
2. `Turso Free` — лучший single-store кандидат, если хотим хранить SQL + vectors вместе.
3. `Upstash Vector Free` — хороший serverless pilot-вариант с жестким daily limit.
4. `Cloudflare Vectorize + Workers Free` — сильный edge-вариант, но не Python-first.

Слабее для нашего кейса:

- `Supabase Free` — сильный стек, но free-проекты могут быть paused при низкой активности.
- `Weaviate Sandbox` — это trial/sandbox, а не вечный free production-контур.
- `Chroma Cloud` — только `$5` credits, не true free forever.

## Comparison Matrix

| Option | Type | Official free entry | No card from checked source | 24/7 fit | Main limits / risks | Verdict for BELITA bot |
|---|---|---|---|---|---|---|
| Qdrant Cloud Free | Managed vector DB | Yes, free forever cluster | Yes | Medium | Suspends after 1 week unused, deletes after 4 weeks inactivity; single node; 1 GB RAM / 4 GB disk | Best pure vector pilot |
| Turso Free | Managed libSQL / SQLite cloud with vector search | Yes | Yes | Medium-High | Free limits on active DBs, storage, reads/writes; docs/blog messaging around cold starts changed over time | Best single-store pilot |
| Upstash Vector Free | Serverless vector DB | Yes | Yes | Medium | 10K queries/updates per day, 1 free DB, scale-to-zero semantics | Good for low-volume bot |
| Pinecone Starter | Managed vector DB | Yes | Not confirmed from checked source | Medium | Free but stricter starter limits, one region, small-project framing | Viable fallback option |
| Cloudflare Vectorize + Workers Free | Edge vector DB | Yes | Not confirmed from checked source | Medium | Workers/edge-first architecture, dimensional quotas on free plan | Strong only if we move toward edge stack |
| Neon Free + pgvector | Managed Postgres + pgvector | Yes | Yes | Low-Medium | Scale to zero after 5 min inactivity; 0.5 GB storage | Fine for low-duty pilot, not ideal for stable low-latency bot |
| Supabase Free + pgvector | Managed Postgres + pgvector | Yes | Not confirmed from checked source | Low-Medium | Free projects with very low activity may be paused after 7 days | Strong developer UX, weak 24/7 free guarantee |
| Weaviate Sandbox | Managed vector DB | Yes | Yes for sandbox | Low | Expires after 14 days | Good only for evaluation |
| Chroma Cloud | Managed serverless retrieval DB | Credits only | Not confirmed from checked source | Low | `$5` credits, then usage-based pricing | Good for tests, not free forever |

## Detailed Notes

### 1. Qdrant Cloud Free

- Official docs say free clusters are available and do not require a credit card.
- Free cluster resources: `0.5 vCPU / 1 GB RAM / 4 GB disk / single node`.
- Qdrant states this supports about `1M vectors` at `768 dimensions`.
- Important operational risk:
  - if unused, cluster is suspended after `1 week`;
  - deleted after `4 weeks` of inactivity if not reactivated.

Практический вывод:
- Для живого бота с регулярным traffic это сильный вариант.
- Для "запустили и забыли" знания могут быть потеряны без keepalive/monitoring.

### 2. Turso Free

- Official pricing says: `Start free today, no credit card required`.
- Free plan includes `100 databases`, `100 monthly active databases`, `5GB storage`, `500M monthly rows read`, `10M monthly rows written`.
- Turso official vector page says vector search is native and does not require extensions.
- Additional official Turso materials say vector search is available on every plan.
- Important nuance:
  - newer official materials say free users on AWS get `no cold starts`;
  - older/deprecated docs still describe scale-to-zero behavior for older free/starter users.

Практический вывод:
- Technically this is the cleanest future simplification path: one cloud SQLite/libSQL store for both metadata and vectors.
- Но в памяти проекта нужно сохранить, что messaging around cold starts changed historically; перед реальным выбором стоит перепроверить current runtime behavior на боевом регионе.

### 3. Upstash Vector Free

- Official pricing says free tier is `$0` and intended for prototypes/hobby projects.
- Free plan limit: `10K` daily query/update operations.
- Official docs say free vector plan is suitable for small projects and supports `10,000` queries and `10,000` updates daily.
- Official billing docs explicitly say free databases do not require a credit card.

Практический вывод:
- Хороший online pilot для небольшого Telegram-бота.
- Daily limit — главный риск: если retrieval будет вызываться на каждое сообщение и users начнут активно чатиться, free quota закончится быстро.

### 4. Pinecone Starter

- Official docs say there is a free `Starter` plan.
- Official release/docs indicate Starter includes:
  - `1 project`;
  - `5 serverless indexes` in `us-east-1`;
  - up to `2 GB storage`.
- Official checked sources в этой сессии не подтвердили `no credit card required` напрямую.

Практический вывод:
- С технической стороны вариант нормальный.
- С продуктовой стороны у нас есть более прозрачные zero-cost кандидаты с меньшим риском внезапного упора в billing-model ambiguity.

### 5. Cloudflare Vectorize + Workers Free

- Official Vectorize docs show free allocation:
  - `30 million queried vector dimensions / month`;
  - `5 million stored vector dimensions`;
  - free account limits on indexes and namespaces.
- D1 is available on Free and Paid plans and provides managed SQLite semantics.

Практический вывод:
- Сильный путь, если весь бот или retrieval API поедет в Cloudflare Workers ecosystem.
- Для текущего Python-first modular monolith это уже architectural pivot, а не просто замена storage.

### 6. Neon Free + pgvector

- Official pricing says `Free` is `$0/month`.
- Official pricing says `No time limits, no credit card required`.
- Free plan includes `100 CU-hours per project`, `0.5 GB` storage.
- Official pricing also says compute scales to zero after `5 minutes when inactive`.

Практический вывод:
- Хорош для low-cost Postgres pilot.
- Не лучший выбор, если важна предсказуемая latency без cold starts на бесплатном плане.

### 7. Supabase Free + pgvector

- Official docs confirm `pgvector` support for storing embeddings and vector similarity search.
- Official billing docs show `500 MB per project` on Free plan.
- Official production checklist says very low-activity free apps may be paused after `7 days`; upgrading to Pro guarantees the project will not be paused for inactivity.

Практический вывод:
- Developer experience отличный.
- Но именно под требование `free + online + 24/7` free-tier риск pause делает его слабее Qdrant/Turso/Upstash.

### 8. Weaviate Sandbox

- Official docs/pricing say sandbox is free.
- Official create-cluster docs say sandbox clusters expire after `14 days`.
- Official billing docs say sandbox does not require billing account.

Практический вывод:
- Это evaluation sandbox, а не база знаний для постоянной работы бота.

### 9. Chroma Cloud

- Official Chroma docs say new users get `$5` in credits.
- Official pricing is usage-based after credits.
- Official marketing/docs describe the service as serverless and scalable, but not free forever.

Практический вывод:
- Интересно как modern retrieval platform.
- Не проходит наш строгий фильтр `бесплатно для постоянной онлайн-работы`.

## Recommendation for Our Project

### If we stay Python-first and only move vector layer online

Recommended order:

1. `Qdrant Cloud Free`
2. `Upstash Vector Free`
3. `Pinecone Starter`

Почему:
- минимальная миграция от текущего `Qdrant Local`;
- чистый vector-first API;
- меньше архитектурного дрейфа относительно уже готового локального индекса.

### If we want one online store for both SQL and vectors

Recommended order:

1. `Turso Free`
2. `Neon Free + pgvector`
3. `Supabase Free + pgvector`

Почему:
- меньше sync-drift между транзакционными данными и retrieval-слоем;
- проще backup/story around one source of truth;
- но free-tier sleep/pause risks у Postgres-вариантов заметнее.

## Hard Truth

Факт:
- среди checked free offers почти нет варианта, который одновременно дает:
  - true forever-free,
  - hard 24/7 availability guarantees,
  - no inactivity suspension,
  - production SLA,
  - zero billing risk.

Вывод:
- для real production 24/7 лучше заранее планировать переход на paid floor.
- для `$0` pilot лучшее practical решение сейчас:
  - `Qdrant Cloud Free` как онлайн vector KB,
  - либо `Turso Free` как single-store experiment,
  - плюс явный alert/backup plan на случай лимитов, pause или inactivity cleanup.

## Suggested Next Step

Не мигрировать вслепую. Следующий инженерный шаг лучше делать так:

1. сохранить текущий локальный `SQLite + Qdrant Local` как stable baseline;
2. собрать retrieval adapter interface;
3. подключить один online pilot backend за feature flag;
4. прогнать latency / relevance / quota smoke test на 50-100 реальных запросах;
5. только потом принимать финальное hosting решение.
