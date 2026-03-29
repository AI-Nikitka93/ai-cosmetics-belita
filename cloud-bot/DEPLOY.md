# Cloud Bot Deploy

## Preconditions
- `wrangler` установлен локально.
- Есть Cloudflare account и доступ к Workers.
- Есть Telegram bot token и выбран секрет webhook.
- Созданы внешние сервисы: `Turso`, `Qdrant Cloud`, `Upstash Redis`.

## Required secrets
- `BOT_TOKEN`
- `WEBHOOK_SECRET`
- `GROQ_API_KEY`
- `QDRANT_URL`
- `QDRANT_KEY`
- `TURSO_URL`
- `TURSO_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENROUTER_API_KEY` — опционален, но нужен для fallback.

## Required vars
Заданы в `wrangler.jsonc`:
- `ADMIN_CHAT_ID`
- `QDRANT_COLLECTION`
- `QDRANT_TOP_K`
- `QDRANT_QUERY_MODEL`
- `GROQ_MODEL`
- `OPENROUTER_MODEL`
- `CACHE_TTL_SECONDS`

## Deploy flow
1. Выполнить `cd "M:\Projects\Bot\ai-cosmetics-belita\cloud-bot"`.
2. Выполнить `npm install`.
3. Выполнить `npm run typecheck`.
4. Выполнить `wrangler login`.
5. По очереди завести secrets:
   - `wrangler secret put BOT_TOKEN`
   - `wrangler secret put WEBHOOK_SECRET`
   - `wrangler secret put GROQ_API_KEY`
   - `wrangler secret put QDRANT_URL`
   - `wrangler secret put QDRANT_KEY`
   - `wrangler secret put TURSO_URL`
   - `wrangler secret put TURSO_TOKEN`
   - `wrangler secret put UPSTASH_REDIS_REST_URL`
   - `wrangler secret put UPSTASH_REDIS_REST_TOKEN`
   - `wrangler secret put OPENROUTER_API_KEY`
6. Выполнить `wrangler deploy`.
7. Скопировать выданный production URL воркера.
8. Установить webhook через Telegram Bot API:

```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>/webhook&secret_token=<WEBHOOK_SECRET>&drop_pending_updates=true
```

9. Проверить health route:

```text
<WORKER_URL>/health
```

Ожидаемый ответ:

```json
{"ok":true,"service":"belita-skin-match-cloud-bot"}
```

## Smoke test
1. Отправить боту `/start`.
2. Проверить приветствие и дисклеймер "Я не врач".
3. Отправить текстовый запрос про чувствительную кожу или акне.
4. Убедиться, что бот отвечает рекомендацией либо мягкой деградацией:
   - `Извините, мои знания сейчас обновляются. Попробуйте спросить чуть позже.`

## Notes
- `QDRANT_QUERY_MODEL` должен совпадать с моделью, использованной для индексирования.
- Production webhook route требует header `X-Telegram-Bot-Api-Secret-Token`; без него Worker вернет `401`.
