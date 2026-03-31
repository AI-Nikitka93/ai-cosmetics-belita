# EXEC PLAN

Статусы: `TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED`

1. `DONE` Зафиксировать память проекта, PRD и стратегические ограничения MVP.
2. `DONE` Подготовить техническую архитектуру modular monolith с zero-cost стеком.
3. `DONE` Реализовать ingestion pipeline: catalog -> INCI enrichment -> SQLite normalization.
4. `DONE` Поднять knowledge layer: ingredient taxonomy, Qdrant local indexing и system prompt guardrails.
5. `DONE` Подготовить application-service слой retrieval: SQL + Qdrant + prompt orchestration для бота.
6. `DONE` Подключить retrieval и system prompt к Telegram bot dialog flow.
7. `DONE` Реализовать free 24/7 pilot path: `cloud-bot` на `Cloudflare Workers + Hono + grammY` с online adapters и graceful degradation.
8. `IN_PROGRESS` Провести production hardening: Cloudflare auth, secret binding, webhook smoke-test, legal review, online sync scheduling, code protection policy, reindex health checks и observability.
9. `IN_PROGRESS` Провести quality sprint для live Telegram bot: full-catalog ranking tuning, compare/list reliability, continuation handling, regression suite, anti-hallucination audit и webhook idempotency по реальным запросам.
   - Уже достигнуто: broad catalog lists по умолчанию расширены, compare-mode стабилизирован, follow-up `ссылки дай` работает от последней рекомендации, индексные follow-up сценарии `сравни 1 и 3` / `разбери 1 и 2` работают, composition follow-up работает, `/reset` очищает профиль и recommendation memory, observability minimum counters уже выведены в live runtime, feedback loop `Подошло / Не по теме / Еще варианты` уже пишет live-сигналы в metrics и feedback events, main-menu fallback усилен кнопкой `Главное меню`, webhook bootstrap стал устойчивее к сбоям `bot.init()`, duplicate Telegram updates теперь дедуплируются по `update_id`, update processing теперь резервируется атомарно и имеет fail-safe fallback, выполнен единый face-ranking pass для `pigmentation / barrier / sensitive dry face / general face creams`, добавлен scripted regression audit `npm run regression:audit`, cached replies теперь тоже обновляют recommendation session, а явный indexed compare больше не должен тихо деградировать в single-item reply, recommendation memory split на `catalog / compare / answer` уже выкачен в live runtime, а formal eval gate через `promptfoo` уже оформлен и проходит `4/4` сценария.
   - Уже достигнуто дополнительно: единый локальный `beta:gate` уже собран (`typecheck + regression:audit + eval:promptfoo`) и зеленый; GitHub Actions workflow `telegram-quality-gate.yml` тоже добавлен как CI-friendly quality gate.
   - Следующий strongest improvement based on external research:
     - рассмотреть `Qdrant hybrid + metadata filtering` как следующий ranking-layer;
     - держать `Cloudflare Queues` как reliability upgrade, если webhook incidents повторятся.
10. `TODO` После quality gate зафиксировать Telegram MVP как `beta-ready` и определить входной scope для `Stage 2: Telegram Mini App`.
