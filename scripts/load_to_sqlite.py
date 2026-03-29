from __future__ import annotations

import argparse
import json
import logging
import sqlite3
from pathlib import Path

from common import clean_text, configure_logging, load_json, split_inci


DEFAULT_INPUT = Path("data/enriched_catalog.json")
DEFAULT_DB = Path("sqlite.db")


CREATE_PRODUCTS_SQL = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_product_key TEXT NOT NULL UNIQUE,
    source_site TEXT,
    source_url TEXT,
    source_hash TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    line TEXT,
    category TEXT,
    category_path_json TEXT,
    price_amount REAL,
    price_currency TEXT,
    price_display TEXT,
    barcode TEXT,
    description TEXT,
    purpose TEXT,
    usage_instructions TEXT,
    volume TEXT,
    country_of_origin TEXT,
    age TEXT,
    composition_lookup_url TEXT,
    composition_source_url TEXT,
    composition_source_site TEXT,
    inci_text TEXT,
    enrichment_status TEXT,
    raw_payload_json TEXT NOT NULL,
    scraped_at TEXT,
    enriched_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


CREATE_PRODUCT_INGREDIENTS_SQL = """
CREATE TABLE IF NOT EXISTS product_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    ingredient_order INTEGER NOT NULL,
    ingredient_name TEXT NOT NULL,
    ingredient_name_normalized TEXT NOT NULL,
    raw_fragment TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, ingredient_order)
);
"""


INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);",
    "CREATE INDEX IF NOT EXISTS idx_products_line ON products(line);",
    "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);",
    "CREATE INDEX IF NOT EXISTS idx_product_ingredients_product_id ON product_ingredients(product_id);",
    "CREATE INDEX IF NOT EXISTS idx_product_ingredients_name ON product_ingredients(ingredient_name_normalized);",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load enriched_catalog.json into SQLite")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Path to data/enriched_catalog.json")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


def create_schema(connection: sqlite3.Connection) -> None:
    connection.execute(CREATE_PRODUCTS_SQL)
    connection.execute(CREATE_PRODUCT_INGREDIENTS_SQL)
    for statement in INDEXES_SQL:
        connection.execute(statement)
    connection.commit()


def source_product_key(item: dict[str, object]) -> str:
    barcode = clean_text(str(item.get("barcode"))) if item.get("barcode") else None
    if barcode:
        return f"barcode:{barcode}"
    source_url = clean_text(str(item.get("source_url"))) if item.get("source_url") else None
    if source_url:
        return f"url:{source_url}"
    raise ValueError(f"Unable to build source_product_key for item: {item}")


def upsert_product(connection: sqlite3.Connection, item: dict[str, object]) -> int:
    price = item.get("price") if isinstance(item.get("price"), dict) else {}
    category_path = item.get("category_path") if isinstance(item.get("category_path"), list) else []
    payload_json = json.dumps(item, ensure_ascii=False)

    connection.execute(
        """
        INSERT INTO products (
            source_product_key,
            source_site,
            source_url,
            source_hash,
            name,
            brand,
            line,
            category,
            category_path_json,
            price_amount,
            price_currency,
            price_display,
            barcode,
            description,
            purpose,
            usage_instructions,
            volume,
            country_of_origin,
            age,
            composition_lookup_url,
            composition_source_url,
            composition_source_site,
            inci_text,
            enrichment_status,
            raw_payload_json,
            scraped_at,
            enriched_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_product_key) DO UPDATE SET
            source_site = excluded.source_site,
            source_url = excluded.source_url,
            source_hash = excluded.source_hash,
            name = excluded.name,
            brand = excluded.brand,
            line = excluded.line,
            category = excluded.category,
            category_path_json = excluded.category_path_json,
            price_amount = excluded.price_amount,
            price_currency = excluded.price_currency,
            price_display = excluded.price_display,
            barcode = excluded.barcode,
            description = excluded.description,
            purpose = excluded.purpose,
            usage_instructions = excluded.usage_instructions,
            volume = excluded.volume,
            country_of_origin = excluded.country_of_origin,
            age = excluded.age,
            composition_lookup_url = excluded.composition_lookup_url,
            composition_source_url = excluded.composition_source_url,
            composition_source_site = excluded.composition_source_site,
            inci_text = excluded.inci_text,
            enrichment_status = excluded.enrichment_status,
            raw_payload_json = excluded.raw_payload_json,
            scraped_at = excluded.scraped_at,
            enriched_at = excluded.enriched_at,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            source_product_key(item),
            clean_text(str(item.get("source_site"))) if item.get("source_site") else None,
            clean_text(str(item.get("source_url"))) if item.get("source_url") else None,
            clean_text(str(item.get("source_hash"))) if item.get("source_hash") else None,
            clean_text(str(item.get("name"))) if item.get("name") else "Unnamed product",
            clean_text(str(item.get("brand"))) if item.get("brand") else None,
            clean_text(str(item.get("line"))) if item.get("line") else None,
            clean_text(str(item.get("category"))) if item.get("category") else None,
            json.dumps(category_path, ensure_ascii=False),
            price.get("amount") if isinstance(price, dict) else None,
            clean_text(str(price.get("currency"))) if isinstance(price, dict) and price.get("currency") else None,
            clean_text(str(price.get("display"))) if isinstance(price, dict) and price.get("display") else None,
            clean_text(str(item.get("barcode"))) if item.get("barcode") else None,
            clean_text(str(item.get("description"))) if item.get("description") else None,
            clean_text(str(item.get("purpose"))) if item.get("purpose") else None,
            clean_text(str(item.get("usage_instructions"))) if item.get("usage_instructions") else None,
            clean_text(str(item.get("volume"))) if item.get("volume") else None,
            clean_text(str(item.get("country_of_origin"))) if item.get("country_of_origin") else None,
            clean_text(str(item.get("age"))) if item.get("age") else None,
            clean_text(str(item.get("composition_lookup_url"))) if item.get("composition_lookup_url") else None,
            clean_text(str(item.get("composition_source_url"))) if item.get("composition_source_url") else None,
            clean_text(str(item.get("composition_source_site"))) if item.get("composition_source_site") else None,
            clean_text(str(item.get("inci_text"))) if item.get("inci_text") else None,
            clean_text(str(item.get("enrichment_status"))) if item.get("enrichment_status") else None,
            payload_json,
            clean_text(str(item.get("scraped_at"))) if item.get("scraped_at") else None,
            clean_text(str(item.get("enriched_at"))) if item.get("enriched_at") else None,
        ),
    )
    row = connection.execute(
        "SELECT id FROM products WHERE source_product_key = ?",
        (source_product_key(item),),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"Failed to upsert product for key {source_product_key(item)}")
    return int(row["id"])


def replace_ingredients(connection: sqlite3.Connection, product_id: int, inci_text: str | None) -> int:
    connection.execute("DELETE FROM product_ingredients WHERE product_id = ?", (product_id,))

    ingredients = split_inci(inci_text)
    for order_index, ingredient in enumerate(ingredients, start=1):
        normalized = ingredient.casefold()
        connection.execute(
            """
            INSERT INTO product_ingredients (
                product_id,
                ingredient_order,
                ingredient_name,
                ingredient_name_normalized,
                raw_fragment
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (product_id, order_index, ingredient, normalized, ingredient),
        )
    return len(ingredients)


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    input_path = Path(args.input)
    db_path = Path(args.db)

    payload = load_json(input_path)
    if not isinstance(payload, list):
        raise ValueError(f"Expected list in {input_path}, got {type(payload)!r}")

    connection = connect(db_path)
    create_schema(connection)

    product_count = 0
    ingredient_count = 0
    for item in payload:
        if not isinstance(item, dict):
            logging.warning("Skipping unexpected item: %r", item)
            continue
        try:
            product_id = upsert_product(connection, item)
            ingredient_count += replace_ingredients(connection, product_id, clean_text(str(item.get("inci_text"))) if item.get("inci_text") else None)
            product_count += 1
        except Exception as exc:  # noqa: BLE001
            logging.exception("Failed to load product into SQLite: %s", exc)
            continue

    connection.commit()
    connection.close()

    logging.info("SQLite database created at %s", db_path)
    logging.info("Products loaded: %s", product_count)
    logging.info("Ingredients loaded: %s", ingredient_count)


if __name__ == "__main__":
    main()
