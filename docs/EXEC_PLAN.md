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
