# Online Parsing And Code Protection

## Короткий вывод

Если главная цель — чтобы код не забирали, основной репозиторий нужно держать `private`.
Публичный GitHub-репозиторий не подходит как "защищенное хранилище кода", даже если в нем
написать запрет на копирование.

Если главная цель — чтобы парсинг шел без включенного домашнего ПК, GitHub Actions можно
использовать как `бесплатный scheduled ingestion runner`, но это `не always-on daemon`.
Это пакетный запуск по расписанию, а не круглосуточный живой процесс.

## Жесткая рекомендация

### Для защиты кода

1. Держать репозиторий `private`.
2. Добавить проприетарную лицензию `All rights reserved`.
3. Не публиковать исходники в public repo, gist, pastebin и открытых артефактах.
4. Если проект переносится в GitHub Organization, отключить forking для private repo.

### Для онлайн-парсинга

1. Хранить код в private GitHub repo.
2. Запускать scraper как `GitHub Actions workflow` по расписанию `1 раз в сутки`.
3. Загружать свежие JSON/SQLite в artifacts.
4. Обновлять `Qdrant Cloud` прямо из workflow, чтобы cloud-бот видел актуальный каталог.

## Почему не public GitHub

- Проприетарная лицензия дает юридический запрет на reuse, но не делает исходники невидимыми.
- Если репозиторий public, код можно читать, копировать локально и пытаться переиспользовать.
- На GitHub для public repo есть platform-level visibility, а для private repo контроль заметно сильнее.

## Почему GitHub Actions — только временный online ingestion path

### Плюсы

- Бесплатный старт.
- Не нужен включенный домашний ПК.
- Можно запускать по cron и вручную.
- Хорошо подходит для nightly sync каталога.

### Минусы

- Это не 24/7 процесс, а пакетная задача.
- Scheduled workflow может задерживаться, особенно в начале часа.
- Для private repo free minutes ограничены.
- Если полный прогон каталога станет слишком тяжелым, бесплатный лимит начнет сгорать.

## Рекомендуемый режим для текущего этапа

- Основной репозиторий: `private GitHub repo`
- Code policy: `LICENSE` + заметный запрет в `README.md`
- Online parsing: `.github/workflows/catalog-sync.yml`
- Частота: `1 раз в сутки`
- Ручной запуск: `workflow_dispatch`
- Выгрузка результата:
  - `data/raw_catalog.json`
  - `data/enriched_catalog.json`
  - `sqlite.db`
  - `Qdrant Cloud collection`

## Что нужно завести в GitHub Secrets

- `QDRANT_URL`
- `QDRANT_KEY`

## Что workflow делает

1. Поднимает Python 3.12.
2. Ставит зависимости.
3. Запускает `scripts/catalog_scraper.py`.
4. Запускает `scripts/inci_enricher.py`.
5. Собирает `sqlite.db`.
6. Переиндексирует `Qdrant Cloud`.
7. Сохраняет артефакты сборки в GitHub Actions artifacts.

## Operational notes

- Для donor-friendly режима мы сохраняем `sleep 1-2s` между запросами и не запускаем workflow слишком часто.
- Для GitHub Actions лучше ставить cron не на `00` минуту часа, а в "тихое" время, чтобы уменьшить риск delay/drop.
- Если nightly full sync начнет не помещаться в free minutes, следующий шаг — переход на incremental sync или вынос ingestion в отдельный недорогой runner.

## Что нельзя обещать честно

- GitHub Actions не дает гарантированный real-time parsing.
- Проприетарная лицензия не может физически запретить кражу кода; она дает юридическую позицию, а не техническую неуязвимость.
- Public repo и "код нельзя брать" — слабая комбинация. Правильная комбинация: `private repo + proprietary license + no public source`.
