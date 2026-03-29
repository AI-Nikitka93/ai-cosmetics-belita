# PROJECT MAP

## Проект
`AI Smart Cosmetics BELITA Recommender`

## Цель
Помогать пользователю подобрать косметику Belita/Vitex не по маркетинговым обещаниям, а по понятному разбору состава, типу кожи, ограничениям и целям ухода.

## Формат продукта
- Stage 1: Telegram Bot
- Stage 2: Telegram Mini App
- Stage 3: Web
- Stage 4: Browser Extension

## Основные модули продукта
- Пользовательский опросник и профиль кожи
- Каталог продуктов Belita/Vitex
- INCI knowledge layer
- Ingredient taxonomy и derived flags
- Recommendation engine
- Explainability layer
- Safety and scope guardrails
- AI chat in bounded domain
- Feedback and learning loop
- Memory service
- Retrieval and ranking pipeline
- Catalog sync worker
- Cloud webhook runtime
- Observability and audit layer

## Основные внешние источники
- `https://belita-shop.by/`
- `https://belita.by/` / `https://vitex.by/`
- В дальнейшем: внешние площадки с отзывами только после отдельной legal-проверки

## Scope текущего шага
- PRD и roadmap
- Technical architecture
- Data model
- RAG / memory / guardrails architecture
- Политичный ingestion prototype:
  - `scripts/catalog_scraper.py`
  - `scripts/inci_enricher.py`
  - `scripts/load_to_sqlite.py`
  - `README.md`, `install.bat`, `run_pipeline.bat`
- Knowledge layer prototype:
  - `domain/ingredients.py`
  - `scripts/index_to_qdrant.py`
  - `prompts/system_prompt.txt`
  - `qdrant_db`
- Cloud transition architecture:
  - `CLOUD_ARCHITECTURE.md`
  - `docs/FREE_ONLINE_STACK_MAR2026.md`
  - `docs/FREE_24X7_IMPLEMENTATION_PLAN.md`
  - `docs/VERCEL_RUNTIME_OPTION.md`
- Cloud runtime implementation:
  - `cloud-bot/package.json`
  - `cloud-bot/wrangler.jsonc`
  - `cloud-bot/src/index.ts`
  - `cloud-bot/src/bot.ts`
  - `cloud-bot/src/adapters/`
  - `cloud-bot/DEPLOY.md`
- Online sync and code protection:
  - `.github/workflows/catalog-sync.yml`
  - `docs/ONLINE_PARSING_GITHUB_PLAN.md`
  - `LICENSE`

## Главные риски
- Смешение косметической рекомендации с медицинской консультацией
- Обработка чувствительных пользовательских данных
- Ограничения на парсинг и использование контента доноров
- Низкое качество или неполнота INCI/отзывов
- Галлюцинации AI при объяснении состава
- Исчерпание free-tier квот LLM
- Drift HTML-структуры donor-сайтов
- Избыточное число запросов при полном прогоне всех категорий без дополнительного scheduling-контроля
- Drift между SQLite-каталогом и Qdrant-индексом при следующих sync-запусках
- Несовместимость текущего Python polling runtime с бесплатным cloud `24/7` serving path
- Free-tier limits cloud runtimes и managed stores
- Drift между моделью индексирования Qdrant и cloud text-query model при удаленном semantic search
- Ошибочное размещение исходников в public repo при требовании защитить код от копирования
