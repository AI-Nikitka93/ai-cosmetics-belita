# BELITA Skin Match: Data Ingestion Scripts

## Source Code Notice

Этот проект `не является open source`.
Исходный код, workflow-файлы, архитектура, промпты и вспомогательные материалы
распространяются как `proprietary / all rights reserved`.

- Не разрешается копирование, переиспользование, публикация, форк для разработки
  вне правил GitHub platform visibility, коммерческое использование или создание
  производных работ без письменного разрешения правообладателя.
- Подробности см. в корневом файле `LICENSE`.

Если задача — защитить код, репозиторий нужно держать `private`.
Public GitHub подходит для прозрачности, но не для сильной защиты исходников.

## Online Sync

Для бесплатного online ingestion path добавлен workflow:

- `.github/workflows/catalog-sync.yml`

Он запускает staged sync каталога по расписанию и вручную:

1. `Scrape catalog`
2. `Enrich INCI`
3. `Load SQLite + Qdrant Cloud reindex`

В workflow добавлена фильтрация явно нерелевантных категорий вроде `sumki`,
`gift-wrap`, `sredstva-dlya-stirki`, `aksessuary-dlya-volos`, чтобы не тратить
runner time на шумные разделы.

В результате workflow собирает:

- `data/raw_catalog.json`
- `data/enriched_catalog.json`
- `sqlite.db`

И, если заданы GitHub secrets `QDRANT_URL` и `QDRANT_KEY`, переиндексирует
`Qdrant Cloud`, чтобы облачный бот видел обновленный каталог.

Эта папка теперь содержит рабочий ingestion-пайплайн для публичных данных Belita/Vitex:

1. `scripts/catalog_scraper.py` — собирает карточки товаров из `belita-shop.by` и сохраняет `data/raw_catalog.json`.
2. `scripts/inci_enricher.py` — обогащает каталог полными составами из `belita.by` / `vitex.by` и сохраняет `data/enriched_catalog.json`.
3. `scripts/load_to_sqlite.py` — нормализует enriched JSON в `sqlite.db`.

## Что ставить

```powershell
python -m pip install --upgrade pip
python -m pip install requests beautifulsoup4 "qdrant-client[fastembed]"
```

## Быстрый запуск по шагам

```powershell
python "scripts\catalog_scraper.py"
python "scripts\inci_enricher.py"
python "scripts\load_to_sqlite.py"
python "scripts\index_to_qdrant.py"
```

После этого появятся:

- `data/raw_catalog.json`
- `data/enriched_catalog.json`
- `sqlite.db`
- `qdrant_db`

## One-click запуск

```powershell
.\install.bat
.\run_pipeline.bat
```

## Полезные флаги

### Ограничить объем для smoke-test

```powershell
python "scripts\catalog_scraper.py" --category-limit 1 --product-limit 3 --verbose
python "scripts\inci_enricher.py" --limit 3 --verbose
python "scripts\load_to_sqlite.py" --verbose
python "scripts\index_to_qdrant.py" --limit 3 --verbose
```

### Поменять выходные пути

```powershell
python "scripts\catalog_scraper.py" --output "data\raw_catalog_custom.json"
python "scripts\inci_enricher.py" --input "data\raw_catalog_custom.json" --output "data\enriched_catalog_custom.json"
python "scripts\load_to_sqlite.py" --input "data\enriched_catalog_custom.json" --db "data\catalog.sqlite"
```

## Что именно парсится

### Из `belita-shop.by`

- `source_url`
- `name`
- `brand`
- `line`
- `category`
- `category_path`
- `price.amount`
- `price.currency`
- `price.display`
- `barcode`
- `description`
- `purpose`
- `usage_instructions`
- `volume`
- `country_of_origin`
- `age`
- `composition_lookup_url`

### Из `belita.by` / `vitex.by`

- `inci_text`
- `composition_source_url`
- `composition_source_site`
- `composition_fields`

## SQLite схема

### `products`

Хранит нормализованную карточку товара, цену, штрихкод, описание и полный текст INCI.

### `product_ingredients`

Хранит раскладку INCI по ингредиентам:

- `product_id`
- `ingredient_order`
- `ingredient_name`
- `ingredient_name_normalized`
- `raw_fragment`

## Вежливый scraping

- у всех запросов случайный актуальный `User-Agent`;
- после каждого запроса есть `sleep` в диапазоне `1-2` секунды;
- при сетевых ошибках используются повторные попытки и мягкий backoff;
- если поле отсутствует в карточке, скрипты не падают, а продолжают сбор.

## Ограничения текущей версии

- поиск состава построен по стратегии `barcode-first`, затем `title-search fallback`;
- если официальный сайт временно не отдал блок `Состав`, продукт все равно попадет в JSON и SQLite, но без `inci_text`;
- `sqlite.db` создается локально в корне проекта, потому что это требование текущего research-шага. Для production runtime-БД лучше вынести из репозитория.
