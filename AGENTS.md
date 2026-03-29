# AI Smart Cosmetics BELITA Recommender

Краткая точка входа в проект.

## Цель
Построить продуктовую экосистему `Telegram Bot -> Mini App -> Web -> Browser Extension` для умного подбора косметики Belita/Vitex по INCI-составу, типу кожи, пользовательскому контексту и объяснимой AI-рекомендации.

## Текущая стадия
Проектирование + инженерный ingestion prototype + cloud runtime core. Активный vertical slice: `Telegram Bot MVP`.

## Где лежит память проекта
- `docs/PRD_BELITA_BOT.md` — основной PRD по текущему шагу
- `ARCHITECTURE.md` — техническая архитектура MVP
- `docs/PROJECT_MAP.md` — карта проекта
- `docs/EXEC_PLAN.md` — живой краткий план
- `docs/STATE.md` — текущее состояние
- `docs/state.json` — machine-readable состояние
- `docs/PROJECT_HISTORY.md` — история действий
- `docs/DECISIONS.md` — ключевые решения
- `docs/RESEARCH_LOG.md` — research log
- `docs/BOT_BRANDING.md` — имя, username и тексты для BotFather
- `docs/ONLINE_PARSING_GITHUB_PLAN.md` — схема online parsing через GitHub Actions и политика защиты кода
- `CLOUD_ARCHITECTURE.md` — cloud transition схема Stage 1 -> Stage 3
- `SAAS_EXECUTION_PLAN.md` — длинный execution roadmap

## Команды проверки
- Проверка заглушек: `rg -n "TODO|placeholder|insert code"`
- Установка зависимостей: `.\install.bat`
- Быстрый запуск пайплайна: `.\run_pipeline.bat`
- Пошаговый запуск:
  - `python "scripts\catalog_scraper.py"`
  - `python "scripts\inci_enricher.py"`
  - `python "scripts\load_to_sqlite.py"`
  - `python "scripts\index_to_qdrant.py"`
- Cloud runtime:
  - `cd "cloud-bot"`
  - `npm install`
  - `npm run typecheck`
  - `npx wrangler deploy --dry-run`
- Online sync:
  - workflow `.github/workflows/catalog-sync.yml`
  - GitHub secrets: `QDRANT_URL`, `QDRANT_KEY`

## Важно
- В репозитории уже есть рабочий ingestion-пайплайн для `belita-shop.by` -> `belita.by` / `vitex.by` -> `sqlite.db`.
- В репозитории уже есть knowledge-layer для локального RAG: `domain/ingredients.py`, `scripts/index_to_qdrant.py`, `prompts/system_prompt.txt`, локальная директория `qdrant_db`.
- В репозитории уже есть `cloud-bot/` модуль под `Cloudflare Workers + Hono + grammY + Turso + Qdrant Cloud + Upstash + Groq/OpenRouter`.
- Для защиты кода используется проприетарный `LICENSE`; если репозиторий переносится в GitHub, базовая рекомендация — держать его `private`.
- Секреты для локальной cloud-разработки класть в `cloud-bot/.dev.vars` или заводить через `wrangler secret put` для прод-окружения.
- Юридический блок в PRD носит рабочий характер и не заменяет консультацию юриста по РБ.
- Техническая архитектура зафиксирована как `modular monolith` с `SQLite + Qdrant local + Groq/OpenRouter`.
