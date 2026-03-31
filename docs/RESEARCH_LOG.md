# RESEARCH LOG

## [ТЕМА: BELITA / VITEX data sources + Belarus legal framing]
_Последнее обновление: 2026-03-28 | Роль: P-10 Product Strategist_
Статус: Актуально

### Что проверено
- `https://belita-shop.by/robots.txt`
- `https://vitex.by/robots.txt`
- пример product card `https://belita-shop.by/katalog/creams-for-face/89.html`
- связка product card -> composition page через barcode (`https://belita.by/katalog/?barcode=...`)
- privacy page `https://vitex.by/about/privacy/`
- Belarus digital health / personal data context:
  - `https://iclg.com/practice-areas/digital-health-laws-and-regulations/belarus`
  - `https://www.clym.io/regulations/law-no-99-z-on-personal-data-protection-republic-of-belarus`

### Ключевые факты
- `belita-shop.by` явно публикует product structured data: название, цена, бренд, назначение, линия, объем, штрих-код, возраст, применение, страна, описание.
- В карточках `belita-shop.by` есть переход `Узнать состав` на `belita.by` с параметром `barcode`, что важно для связывания карточки и INCI.
- `belita-shop.by/robots.txt` содержит набор `Disallow`, но не тотальный запрет на весь каталог; `vitex.by/robots.txt` также не запрещает весь сайт. Это не равно автоматическому разрешению на массовый коммерческий парсинг.
- По ICLG 2026 данные о здоровье в РБ рассматриваются как special category personal data; ключевая база для их обработки в healthcare-контуре связана с оказанием медпомощи медицинскими/фармацевтическими работниками.
- Следствие для продукта: MVP лучше не собирать и не хранить медицинские сведения в свободной форме; работать через ограниченный косметический опросник и безопасные формулировки.

### Практический вывод
- MVP можно проектировать вокруг официального каталога и explainable recommendation.
- Для production нужно отдельно валидировать:
  - legal basis и ToS на парсинг,
  - политику по user data,
  - cross-border transfer, если LLM/API вне РБ,
  - возможность использования сторонних отзывов.

## [ТЕМА: Zero-cost architecture stack for Telegram MVP]
_Последнее обновление: 2026-03-28 | Роль: P-20 Technical Architect_
Статус: Актуально

### Что проверено
- `https://docs.aiogram.dev/en/latest/index.html`
- `https://www.sqlite.org/limits.html`
- `https://qdrant.tech/documentation/frameworks/langchain/`
- `https://qdrant.tech/documentation/concepts/inference/`
- `https://console.groq.com/docs/rate-limits`
- `https://console.groq.com/docs/text-chat`
- `https://openrouter.ai/openrouter/free`
- `https://openrouter.ai/docs/faq`

### Ключевые факты
- `aiogram` docs на `2026-03-28` показывают `aiogram 3.26.0`.
- SQLite остается zero-cost выбором без SaaS-лимитов; официальные limits page показывает очень высокие дефолтные пределы и рекомендует снижать runtime limits в security-sensitive приложениях.
- Qdrant поддерживает local mode с on-disk persistence и hybrid retrieval; Python SDK также поддерживает local inference через `fastembed`.
- Groq docs дают официальные free-tier rate limits по моделям. На дату проверки:
  - `qwen/qwen3-32b`: `60 RPM / 1K RPD / 6K TPM / 500K TPD`
  - `meta-llama/llama-prompt-guard-2-86m`: `30 RPM / 14.4K RPD / 15K TPM / 500K TPD`
  - `openai/gpt-oss-20b`: `30 RPM / 1K RPD / 8K TPM / 200K TPD`
- OpenRouter имеет `openrouter/free` router: `Released Feb 1, 2026`, `200,000 context`, `$0` input/output tokens; docs FAQ указывают, что модели с суффиксом `:free` имеют low rate limits.

### Практический вывод
- Для strict `$0` MVP лучшая архитектура: `SQLite + Qdrant local + Groq primary + OpenRouter fallback + local embeddings`.
- Один free LLM provider недостаточен; нужен fallback и rules-only degradation.

## [ТЕМА: BELITA/VITEX donor HTML scraping path]
_Последнее обновление: 2026-03-28 | Роль: P-WEB Web Intelligence & Monitoring Engineer_
Статус: Актуально

### Что проверено
- `https://belita-shop.by/katalog/`
- `https://belita-shop.by/katalog/kremy-dnevnye/`
- `https://belita-shop.by/katalog/creams-for-face/89.html`
- `https://belita.by/katalog/?barcode=4810151012595`
- `https://vitex.by/katalog/?barcode=4810151012595`
- `https://belita.by/poisk/?q=...`
- `https://vitex.by/`

### Ключевые факты
- Каталог `belita-shop.by` отдает product cards и пагинацию в обычном HTML; базовый селектор списка: `div.prod-block.catalog-item`.
- Карточка товара `belita-shop.by` содержит нужные поля в `table.product-table`, цену в `.product-price .price`, описание в `div.product-text`, а composition link ведет на `belita.by` через `?barcode=...`.
- Официальные страницы `belita.by` и `vitex.by` содержат блок состава в `#product2`, где `Состав`, `Применение`, `Штрих-код`, `Объем` отдаются в обычных `<p><b>Label:</b> value</p>`.
- Поиск по названию на официальных сайтах работает через `/poisk/?q=...` и возвращает обычные HTML search results с первой ссылкой на товар.
- Для текущего donor набора хватает `requests + BeautifulSoup4` и polite delays `1-2` секунды; browser automation не требуется.

### Практический вывод
- Для ingestion prototype достаточно схемы `catalog scrape -> barcode composition lookup -> title-search fallback -> SQLite normalization`.
- Следующий технический шаг можно строить уже поверх локального `sqlite.db`, не возвращаясь к browser automation.

## [ТЕМА: Qdrant local + FastEmbed indexing path]
_Последнее обновление: 2026-03-28 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://python-client.qdrant.tech/quickstart.html`
- `https://qdrant.tech/documentation/fastembed/fastembed-quickstart/`
- локальная установка `python -m pip install "qdrant-client[fastembed]"`
- локальный smoke-run `python "scripts\\index_to_qdrant.py" --limit 1 --verbose`

### Ключевые факты
- Qdrant client quickstart на дату проверки показывает локальный режим через `QdrantClient(path="path/to/db")`.
- Qdrant client docs рекомендуют установку `qdrant-client[fastembed]` для локальных эмбеддингов.
- FastEmbed quickstart на дату проверки показывает `TextEmbedding()` как рабочий default path и 384-мерные вектора для default model.
- В среде проекта реально установились `qdrant-client 1.17.1` и `fastembed 0.7.4`.
- Локальный smoke-run создал `qdrant_db`, коллекцию `product_knowledge` и успешно проиндексировал `1` продукт из текущего `sqlite.db`.

### Практический вывод
- Текущий zero-cost knowledge layer работоспособен локально: SQLite -> ingredient taxonomy -> FastEmbed -> Qdrant Local.
- Следующий инженерный шаг должен строиться уже поверх готовой коллекции `product_knowledge`, а не начинать индексный слой заново.

## [ТЕМА: Free online knowledge backends for 24/7 bot]
_Последнее обновление: 2026-03-28 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://qdrant.tech/pricing/`
- `https://qdrant.tech/documentation/cloud/create-cluster/`
- `https://qdrant.tech/documentation/guides/optimize/`
- `https://upstash.com/pricing/vector`
- `https://upstash.com/docs/vector/overall/pricing`
- `https://upstash.com/docs/common/account/addapaymentmethod`
- `https://neon.com/pricing`
- `https://neon.com/docs/extensions/pgvector`
- `https://supabase.com/docs/guides/database/extensions/pgvector`
- `https://supabase.com/docs/guides/platform/manage-your-usage/compute-and-disk`
- `https://supabase.com/docs/guides/platform/billing-on-supabase`
- `https://weaviate.io/developers/wcs/create-a-cluster`
- `https://docs.weaviate.io/weaviate/quickstart`
- `https://docs.trychroma.com/cloud/getting-started`
- `https://docs.trychroma.com/cloud/manage-your-plan`
- `https://www.pinecone.io/pricing/`
- `https://docs.pinecone.io/troubleshooting/release-2025-04`
- `https://developers.cloudflare.com/vectorize/platform/pricing/`
- `https://developers.cloudflare.com/d1/`
- `https://turso.tech/pricing`
- `https://docs.turso.tech/features/ai-and-embeddings/vector-search`
- `https://docs.turso.tech/features/scale-to-zero`
- `https://turso.tech/blog/re-introducing-turso-free-no-cold-starts-no-surprises`

### Ключевые факты
- `Qdrant Cloud Free` — free forever single-node cluster, `0.5 vCPU / 1GB RAM / 4GB disk`; docs о cloud cluster lifecycle указывают suspend после `1` недели неиспользования и deletion после `4` недель inactivity.
- `Qdrant` guide по capacity пишет, что `1GB` RAM достаточно примерно для `1M` векторов на `768` dimensions.
- `Upstash Vector Free` — `$0`, `1` free database и `10K` query/update operations в день; billing docs явно говорят, что для free databases не нужно добавлять payment method.
- `Neon Free` — `$0`, `no credit card required`, `0.5GB` storage, `100` CU-hours/project/month, scale to zero after `5` minutes inactivity.
- `Supabase` официально поддерживает `pgvector`; billing docs указывают `500 MB` DB size на Free plan, а production checklist warns, что very low-activity apps на Free могут быть paused after `7 days`.
- `Weaviate Sandbox` бесплатен, не требует billing account, но cluster expires after `14 days`; это sandbox/trial, а не stable forever-free layer.
- `Chroma Cloud` дает `$5` credits новым пользователям, дальше usage-based billing; это не true free forever.
- `Pinecone Starter` остается бесплатным starter-уровнем; по checked official release/docs доступны `1` project, `5` serverless indexes в `us-east-1` и до `2GB` storage.
- `Cloudflare Vectorize` дает free allocation по vector dimensions и `D1` доступен на Free plan; но это edge-first стек, менее естественный для текущего Python-first бота.
- `Turso Free` — `no credit card required`, `100` databases, `100` monthly active databases, `5GB` storage, `500M` rows read/month, `10M` rows written/month; official materials around cold starts исторически менялись, поэтому runtime behavior перед выбором лучше перепроверить отдельно.

### Практический вывод
- Под условие `онлайн + бесплатно + ближе всего к 24/7` strongest shortlist для проекта: `Qdrant Cloud Free`, `Turso Free`, `Upstash Vector Free`.
- `Supabase Free`, `Weaviate Sandbox` и `Chroma Cloud` слабее именно под сценарий постоянной бесплатной работы из-за pause / expiry / credits.
- Для текущего проекта safest path: не выбрасывать локальный `SQLite + Qdrant Local`, а вводить online backend только как pilot/adaptor layer.

## [ТЕМА: Vercel as runtime option for Telegram bot]
_Последнее обновление: 2026-03-28 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://vercel.com/docs/plans/hobby`
- `https://vercel.com/legal/terms`
- `https://vercel.com/docs/functions/limitations`
- `https://vercel.com/docs/functions/runtimes/python`
- `https://vercel.com/docs/cron-jobs`
- `https://vercel.com/docs/cron-jobs/usage-and-pricing`

### Ключевые факты
- `Vercel Hobby` free, но official docs и ToS прямо ограничивают его `personal` и `non-commercial` use.
- Hobby plan docs на дату проверки дают:
  - `1,000,000` function invocations;
  - `100 GB-Hours` function duration;
  - `4 CPU-hours` active CPU;
  - `360 GB-hours` provisioned memory.
- Hobby billing cycle отсутствует; если превысить usage, в большинстве случаев нужно ждать `30` дней до повторного использования лимитированной функции.
- Python runtime на Vercel официально доступен, но помечен как `Beta`.
- Function limits docs показывают для Python:
  - bundle size до `500 MB` uncompressed;
  - configurable duration на Hobby до `60s`, а при `fluid compute` — до `300s`.
- Cron jobs доступны на всех планах, но на Hobby ограничены `once per day` и без точного тайминга.

### Практический вывод
- `Vercel` подходит для `webhook-based Telegram bot`, если bot runtime stateless и knowledge/data уже вынесены в online storage.
- `Vercel` не подходит как хост для текущего Python `long polling` процесса и не заменяет отдельную online DB/vector layer.
- Как долгосрочная база под коммерческий бот на Hobby вариант слабый из-за `non-commercial` ограничения и free-cap behavior.

## [ТЕМА: Full free online stack map for March 2026]
_Последнее обновление: 2026-03-28 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://developers.cloudflare.com/workers/platform/limits/`
- `https://developers.cloudflare.com/workers/platform/pricing/`
- `https://developers.cloudflare.com/pages/functions/pricing/`
- `https://developers.cloudflare.com/d1/`
- `https://developers.cloudflare.com/vectorize/platform/pricing/`
- `https://vercel.com/docs/plans/hobby`
- `https://vercel.com/legal/terms`
- `https://vercel.com/docs/functions/runtimes/python`
- `https://vercel.com/docs/functions/configuring-functions/duration`
- `https://vercel.com/docs/cron-jobs/usage-and-pricing`
- `https://vercel.com/docs/cron-jobs/manage-cron-jobs`
- `https://qdrant.tech/pricing/`
- `https://qdrant.tech/documentation/cloud/create-cluster/`
- `https://qdrant.tech/documentation/guides/optimize/`
- `https://turso.tech/pricing`
- `https://docs.turso.tech/features/ai-and-embeddings/vector-search`
- `https://docs.turso.tech/features/scale-to-zero`
- `https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan`
- `https://upstash.com/docs/redis/overall/pricing`
- `https://upstash.com/docs/vector/overall/pricing`
- `https://upstash.com/docs/common/account/addapaymentmethod`
- `https://supabase.com/docs/guides/database/extensions/pgvector`
- `https://supabase.com/docs/guides/deployment/going-into-prod`
- `https://neon.com/pricing`
- `https://docs.weaviate.io/weaviate/quickstart`
- `https://weaviate.io/developers/wcs/create-a-cluster`
- `https://docs.trychroma.com/cloud/pricing`
- `https://docs.pinecone.io/docs/limits`
- `https://docs.pinecone.io/troubleshooting/release-2025-04`
- `https://www.mongodb.com/pricing`
- `https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/`
- `https://fly.io/docs/about/pricing/`
- `https://console.groq.com/docs/rate-limits`
- `https://openrouter.ai/openrouter/free`
- `https://openrouter.ai/docs/faq`

### Ключевые факты
- Среди runtime-вариантов strongest free paths под webhook-бот: `Cloudflare Workers Free` и `Vercel Hobby`, но `Vercel Hobby` ограничен `personal/non-commercial use`.
- `Cloudflare Workers Free` дает живой online runtime, но с tight limits: `100K` requests/day, `10ms` CPU, `5` cron triggers/account.
- `Turso Free` — самый сильный free relational/vector hybrid candidate: `no credit card required`, generous SQL limits, vector search support.
- `Qdrant Cloud Free` — лучший чистый managed vector option, но с inactivity lifecycle: suspend after `1 week`, delete after `4 weeks`.
- `Upstash Redis Free` и `Upstash Vector Free` сильны как serverless glue/store, но оба упираются в жесткие free ceilings.
- `Supabase Free`, `Neon Free`, `Weaviate Sandbox`, `Chroma Cloud`, `Pinecone Starter` usable, но имеют более слабую free-устойчивость под наш 24/7 сценарий.
- Для online answer generation strongest checked free inference pair остается `Groq Free + OpenRouter free`.

### Практический вывод
- Лучший zero-budget shortlist на март `2026`: `Cloudflare Workers Free`, `Qdrant Cloud Free`, `Turso Free`, `Upstash Redis Free`, `Groq Free`, `OpenRouter free`.
- Если нужен бот ночью без включенного ПК, вопрос уже не в "какую одну базу выбрать", а в связке `runtime + storage + vector + LLM`.
- Полная карта зафиксирована в `docs/FREE_ONLINE_STACK_MAR2026.md`.

## [ТЕМА: Runtime choice for free 24/7 cloud bot]
_Последнее обновление: 2026-03-28 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://developers.cloudflare.com/workers/platform/pricing/`
- `https://developers.cloudflare.com/workers/platform/limits/`
- `https://vercel.com/docs/plans/hobby`
- `https://vercel.com/legal/terms`
- `https://vercel.com/docs/functions/runtimes/python`
- `https://vercel.com/docs/cron-jobs/usage-and-pricing`
- `https://render.com/pricing`
- `https://www.koyeb.com/pricing/`
- `https://grammy.dev/hosting/cloudflare-workers-nodejs`
- `https://hono.dev/docs/getting-started/cloudflare-workers`

### Ключевые факты
- `Cloudflare Workers Free` дает clearly defined free runtime для webhook path: `100K` requests/day и `10ms` CPU time.
- `Vercel Hobby` free, но ограничен `personal/non-commercial use`; Python runtime там `Beta`, а cron на Hobby сильно ограничен.
- `Render Free` имеет free spin-down semantics и не дает надежного always-hot runtime для бот UX.
- `Koyeb` не дал более сильного verified free foundation, чем Cloudflare Workers, по итогам checked official sources.
- `grammY` и `Hono` имеют официальный Cloudflare Workers path, что делает TypeScript runtime естественным cloud-контуром для бота.

### Практический вывод
- Для free `24/7` runtime нужно разделить стек:
  - `Python` оставить в offline ingestion lane;
  - `TypeScript + grammY + Hono + Cloudflare Workers` взять для online bot serving.
- Итоговая cloud-архитектура зафиксирована в `CLOUD_ARCHITECTURE.md`.

## [ТЕМА: Cloud bot implementation references]
_Последнее обновление: 2026-03-28 | Роль: P-BOT Universal Bot Architect_
Статус: Актуально

### Что проверено
- `https://core.telegram.org/bots/api-changelog`
- `https://grammy.dev/hosting/cloudflare-workers-nodejs`
- `https://hono.dev/docs/getting-started/cloudflare-workers`
- `npm view hono version`
- `npm view grammy version`
- `npm view @libsql/client version`
- `npm view @upstash/redis version`
- `npm view wrangler version`
- локальная проверка `python -c "from fastembed import TextEmbedding; print(TextEmbedding().model_name)"`

### Ключевые факты
- Telegram Bot API на дату проверки: `9.5` (`2026-03-01`). Changelog подтверждает, что `sendMessageDraft` теперь доступен всем ботам, а `style` у кнопок появился в `9.4` (`2026-02-09`).
- `grammY` имеет официальный Cloudflare Workers hosting path; `Hono` имеет нативный starter path для Workers.
- На дату сборки модуля `cloud-bot/` установлены и проверены:
  - `hono 4.12.9`
  - `grammy 1.41.1`
  - `@libsql/client 0.17.2`
  - `@upstash/redis 1.37.0`
  - `wrangler 4.78.0`
- Локальная проверка `fastembed` в текущем Python pipeline показывает default model `BAAI/bge-small-en-v1.5`; cloud retrieval path должен быть согласован с этой моделью для text-query в Qdrant Cloud.
- Для Cloudflare Worker webhook runtime безопаснее делать `Qdrant /points/query` text search по model name, а `Qdrant /points/search` использовать только если query vector заранее вычислен вне воркера.

### Практический вывод
- Код `cloud-bot/` должен опираться на `webhook + fetch-native adapters + env bindings`, без Node-only модулей и без попытки локально считать эмбеддинги в runtime.
- Следующий шаг после кода — не "дописывать архитектуру", а завести secrets, включить webhook и прогнать живой smoke-test.

## [ТЕМА: GitHub online parsing + source code protection]
_Последнее обновление: 2026-03-29 | Роль: P-KNOW Knowledge Manager_
Статус: Актуально

### Что проверено
- `https://docs.github.com/en/enterprise-server@3.14/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule`
- `https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-the-forking-policy-for-your-repository`
- `https://docs.github.com/en/billing/concepts/product-billing/github-actions`
- `https://docs.github.com/en/get-started/learning-about-github/licensing-a-repository`

### Ключевые факты
- Приватность профиля GitHub и приватность репозитория — разные вещи; для работы GitHub Actions важна visibility репозитория, а не "скрыт ли профиль".
- Scheduled workflows на GitHub — это пакетный запуск, а не always-on процесс; по docs `schedule` может задерживаться при высокой нагрузке, особенно в начале часа, и некоторые queued jobs могут быть dropped.
- Scheduled workflows работают только из `default branch`; shortest supported interval — раз в `5` минут.
- В public repository scheduled workflows автоматически выключаются после `60` дней без активности репозитория.
- GitHub Actions работают и в private repositories; по official billing docs для private repo просто действует квота бесплатных минут и storage, а для public repo standard runners бесплатны.
- На плане `GitHub Free` для private repositories включено `2,000` минут в месяц, `500 MB` artifact storage и `10 GB` cache storage.
- GitHub docs по private repo forking policy подтверждают, что для organization-owned private repositories можно отдельно управлять forking policy и тем самым снижать риск утечки.
- Если цель — защита кода, public GitHub repo остается слабым вариантом даже при проприетарной лицензии; правильная комбинация — `private repo + proprietary license + no public source`.
- GitHub Actions пригоден как временный бесплатный online ingestion runner для nightly sync каталога, но не как сильная production-grade гарантия realtime-парсинга.

### Практический вывод
- Private repo не мешает онлайн-парсеру работать; мешать может только исчерпание free minutes или storage.
- Для текущего этапа лучший компромисс: хранить исходники в `private GitHub repo`, добавить проприетарный `LICENSE`, а online parsing запускать через `GitHub Actions` по расписанию и вручную.
- Для donor-friendly режима запускать sync не чаще `1 раза в сутки`, в нечасовой минуте, с сохранением `sleep 1-2s` в самих скриптах.
- Если full sync начнет упираться в private Actions minutes, следующим шагом будет incremental sync или вынос ingestion в отдельный runner.

## [ТЕМА: Beta-ready hardening ideas from fresh external research]
_Последнее обновление: 2026-04-01 | Роль: Codex_
Статус: Актуально

### Что проверено
- `https://grammy.dev/plugins/conversations`
- `https://core.telegram.org/bots/webapps`
- `https://telegrambots.github.io/book/4/webapps.html`
- `https://developers.cloudflare.com/queues/`
- `https://developers.cloudflare.com/queues/platform/limits/`
- `https://developers.cloudflare.com/ai-gateway/`
- `https://qdrant.tech/documentation/concepts/hybrid-queries/`
- `https://qdrant.tech/documentation/concepts/filtering/`
- `https://www.promptfoo.dev/docs/integrations/ci-cd/`
- `https://github.com/revenkroz/telegram-web-app-bot-example`
- `https://github.com/Telegram-Mini-Apps/reactjs-template`
- `https://github.com/yshalsager/telegram-feedback-bot`
- `https://github.com/donbarbos/telegram-bot-template`

### Ключевые факты
- `grammY` рекомендует для сложных многошаговых dialog flows использовать `conversations`, а при доступе к внешнему state внутри conversation path оборачивать его в `conversation.external`, чтобы не ломать replay semantics.
- Telegram Mini Apps можно открывать не только из inline/reply кнопок, но и как `Main Mini App`/menu button; Telegram рекомендует работать через `Telegram.WebApp`, `initData`, theme params и `sendData`, если нужен structured handoff обратно в бота.
- `Cloudflare Queues` дают retries, delayed delivery и dead-letter queue path, то есть подходят как более надежный buffer между Telegram webhook edge и тяжелой логикой/внешними провайдерами.
- `Cloudflare AI Gateway` дает centralized AI analytics, caching, rate limiting и provider routing; это особенно полезно, если inference path становится multi-provider и нужен production-grade observability слой.
- Qdrant официально поддерживает `hybrid queries` и metadata filtering; для нашего проекта это прямой кандидат на следующий шаг после текущего manual reranking, чтобы уменьшить шум по `pigmentation / barrier / sensitive`.
- `promptfoo` официально поддерживает CI/CD eval gates; это подходит под наш Telegram regression suite лучше, чем чисто ручные smoke-tests.
- На GitHub уже есть полезные reference-проекты:
  - `revenkroz/telegram-web-app-bot-example` — минимальный, понятный Mini App launch path;
  - `Telegram-Mini-Apps/reactjs-template` — современный React/Vite template для Mini App;
  - `yshalsager/telegram-feedback-bot` — полезен как reference для feedback/admin flow;
  - `donbarbos/telegram-bot-template` — полезен как reference по аналитике и admin-panel идеям, но его стек не стоит переносить к нам напрямую.

### Практический вывод
- Самые полезные внешние идеи для нашего проекта сейчас:
  - ввести `separate session slots`: `last_catalog_session`, `last_compare_session`, `last_answer_session` вместо одной общей recommendation memory;
  - оформить Telegram regression suite как формальный eval-gate через `promptfoo`;
  - подготовить `Mini App Lite`, но только как profile/recommendations UI, а не как попытку заменить основной бот раньше времени;
  - рассмотреть `Cloudflare Queues` как optional reliability layer, если webhook incidents повторятся;
  - идти к `Qdrant hybrid + metadata filtering`, а не бесконечно лечить ranking только эвристиками в коде.
- Что не стоит делать прямо сейчас:
  - не тащить full Mini App раньше закрытия Telegram beta-ready gate;
  - не переносить wholesale чужие GitHub templates, если они конфликтуют с нашим `Workers + grammY + Qdrant` стеком;
  - не усложнять runtime `Durable Workflows`/heavy orchestration без повторяемой operational боли.
