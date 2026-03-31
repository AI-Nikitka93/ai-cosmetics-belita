from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from fastembed import TextEmbedding
from qdrant_client import QdrantClient, models


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from domain.ingredients import analyze_product  # noqa: E402


DEFAULT_DB_PATH = Path("sqlite.db")
DEFAULT_QDRANT_PATH = Path("qdrant_db")
DEFAULT_COLLECTION = "product_knowledge"
PAYLOAD_INDEXES: tuple[tuple[str, models.PayloadSchemaType], ...] = (
    ("brand", models.PayloadSchemaType.KEYWORD),
    ("category", models.PayloadSchemaType.KEYWORD),
    ("skin_types", models.PayloadSchemaType.KEYWORD),
    ("concerns", models.PayloadSchemaType.KEYWORD),
    ("fit_tags", models.PayloadSchemaType.KEYWORD),
    ("flags", models.PayloadSchemaType.KEYWORD),
    ("is_fragrance_free", models.PayloadSchemaType.BOOL),
    ("has_fragrance", models.PayloadSchemaType.BOOL),
    ("has_acids", models.PayloadSchemaType.BOOL),
    ("has_retinoid", models.PayloadSchemaType.BOOL),
    ("has_drying_alcohol", models.PayloadSchemaType.BOOL),
    ("has_barrier_support", models.PayloadSchemaType.BOOL),
    ("has_soothing_agents", models.PayloadSchemaType.BOOL),
    ("acne_fit", models.PayloadSchemaType.BOOL),
    ("gentle_fit", models.PayloadSchemaType.BOOL),
    ("price_amount", models.PayloadSchemaType.FLOAT),
)


@dataclass
class ProductRecord:
    sqlite_id: int
    source_product_key: str
    source_site: str | None
    source_url: str | None
    source_hash: str | None
    name: str
    brand: str | None
    line: str | None
    category: str | None
    category_path: list[str]
    price_amount: float | None
    price_currency: str | None
    barcode: str | None
    description: str | None
    purpose: str | None
    usage_instructions: str | None
    volume: str | None
    inci_text: str | None
    ingredients: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Index BELITA products from SQLite into local Qdrant")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    parser.add_argument("--qdrant-path", default=str(DEFAULT_QDRANT_PATH), help="Local Qdrant storage directory")
    parser.add_argument("--qdrant-url", default=None, help="Remote Qdrant URL for cloud indexing")
    parser.add_argument("--qdrant-api-key", default=None, help="Remote Qdrant API key")
    parser.add_argument("--collection", default=DEFAULT_COLLECTION, help="Target Qdrant collection name")
    parser.add_argument("--model", default=None, help="Optional FastEmbed model name override")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size for upsert")
    parser.add_argument("--limit", type=int, default=None, help="Index only the first N products")
    parser.add_argument("--recreate", action="store_true", help="Delete and recreate target collection before indexing")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def connect_sqlite(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def load_products(connection: sqlite3.Connection, limit: int | None = None) -> list[ProductRecord]:
    rows = connection.execute(
        """
        SELECT
            id,
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
            barcode,
            description,
            purpose,
            usage_instructions,
            volume,
            inci_text
        FROM products
        ORDER BY id
        """
    ).fetchall()

    if limit is not None:
        rows = rows[:limit]

    ingredients_by_product: dict[int, list[str]] = {}
    ingredient_rows = connection.execute(
        """
        SELECT product_id, ingredient_name
        FROM product_ingredients
        ORDER BY product_id, ingredient_order
        """
    ).fetchall()
    for row in ingredient_rows:
        ingredients_by_product.setdefault(int(row["product_id"]), []).append(row["ingredient_name"])

    products: list[ProductRecord] = []
    for row in rows:
        category_path: list[str] = []
        try:
            category_path = json.loads(row["category_path_json"]) if row["category_path_json"] else []
        except json.JSONDecodeError:
            category_path = []

        products.append(
            ProductRecord(
                sqlite_id=int(row["id"]),
                source_product_key=row["source_product_key"],
                source_site=row["source_site"],
                source_url=row["source_url"],
                source_hash=row["source_hash"],
                name=row["name"],
                brand=row["brand"],
                line=row["line"],
                category=row["category"],
                category_path=category_path,
                price_amount=row["price_amount"],
                price_currency=row["price_currency"],
                barcode=row["barcode"],
                description=row["description"],
                purpose=row["purpose"],
                usage_instructions=row["usage_instructions"],
                volume=row["volume"],
                inci_text=row["inci_text"],
                ingredients=ingredients_by_product.get(int(row["id"]), []),
            )
        )
    return products


def build_document(product: ProductRecord, analysis: dict[str, object]) -> str:
    parts = [
        f"Название: {product.name}",
        f"Бренд: {product.brand or 'Belita/Vitex'}",
        f"Линия: {product.line or 'не указана'}",
        f"Категория: {product.category or 'не указана'}",
        f"Назначение: {product.purpose or 'не указано'}",
        f"Описание: {product.description or 'нет описания'}",
        f"Применение: {product.usage_instructions or 'не указано'}",
        f"Состав INCI: {product.inci_text or 'нет состава'}",
        f"Ингредиенты: {', '.join(product.ingredients) if product.ingredients else 'нет ингредиентов'}",
        f"Типы кожи: {', '.join(analysis['skin_type_hints']) if analysis['skin_type_hints'] else 'не определены'}",
        f"Проблемы: {', '.join(analysis['concerns']) if analysis['concerns'] else 'не определены'}",
        f"Fit tags: {', '.join(analysis['fit_tags']) if analysis['fit_tags'] else 'нет'}",
        f"Flags: {json.dumps(analysis['flags'], ensure_ascii=False)}",
    ]
    return "\n".join(parts)


def build_payload(product: ProductRecord, analysis: dict[str, object], document: str) -> dict[str, object]:
    flags = analysis["flags"]
    return {
        "doc_id": f"product-{product.sqlite_id}",
        "product_id": product.sqlite_id,
        "sqlite_id": product.sqlite_id,
        "source_product_key": product.source_product_key,
        "barcode": product.barcode,
        "name": product.name,
        "brand": product.brand or "Belita/Vitex",
        "line": product.line,
        "category": product.category,
        "category_path": product.category_path,
        "skin_types": analysis["skin_type_hints"],
        "concerns": analysis["concerns"],
        "fit_tags": analysis["fit_tags"],
        "flags": sorted([name for name, enabled in flags.items() if enabled]),
        "is_fragrance_free": bool(flags["fragrance_free"]),
        "has_fragrance": bool(flags["has_fragrance"]),
        "has_acids": bool(flags["has_acids"]),
        "has_retinoid": bool(flags["has_retinoid"]),
        "has_drying_alcohol": bool(flags["has_drying_alcohol"]),
        "has_barrier_support": bool(flags["has_barrier_support"]),
        "has_soothing_agents": bool(flags["has_soothing_agents"]),
        "acne_fit": bool(flags["acne_fit"]),
        "gentle_fit": bool(flags["gentle_fit"]),
        "purpose": product.purpose,
        "volume": product.volume,
        "price_amount": product.price_amount,
        "price_currency": product.price_currency,
        "ingredient_count": len(product.ingredients),
        "ingredients": product.ingredients,
        "ingredient_matches": analysis["ingredient_details"],
        "source_site": product.source_site,
        "source_url": product.source_url,
        "source_hash": product.source_hash,
        "chunk_type": "product_summary_chunk",
        "text": document,
    }


def ensure_collection(client: QdrantClient, collection_name: str, vector_size: int, recreate: bool = False) -> None:
    if recreate and client.collection_exists(collection_name):
        logging.info("Recreating existing collection %s", collection_name)
        client.delete_collection(collection_name)
    if client.collection_exists(collection_name):
        return
    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
    )


def ensure_payload_indexes(client: QdrantClient, collection_name: str) -> None:
    for field_name, schema in PAYLOAD_INDEXES:
        try:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field_name,
                field_schema=schema,
                wait=True,
            )
            logging.info("Ensured payload index for %s", field_name)
        except Exception as exc:
            logging.warning("Failed to ensure payload index for %s: %s", field_name, exc)


def batched(items: Iterable[models.PointStruct], batch_size: int) -> Iterable[list[models.PointStruct]]:
    batch: list[models.PointStruct] = []
    for item in items:
        batch.append(item)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    db_path = Path(args.db)
    qdrant_path = Path(args.qdrant_path)

    connection = connect_sqlite(db_path)
    products = load_products(connection, limit=args.limit)
    connection.close()

    if not products:
        raise RuntimeError(f"No products found in {db_path}")

    embedding_model = TextEmbedding(model_name=args.model) if args.model else TextEmbedding()

    documents: list[str] = []
    payloads: list[dict[str, object]] = []
    ids: list[int] = []

    for product in products:
        analysis = analyze_product(
            product.ingredients,
            purpose_text=product.purpose,
            category=product.category,
        )
        document = build_document(product, analysis)
        payload = build_payload(product, analysis, document)

        ids.append(product.sqlite_id)
        documents.append(document)
        payloads.append(payload)

    logging.info("Embedding %s products with FastEmbed", len(documents))
    vectors = [vector.tolist() for vector in embedding_model.embed(documents)]
    vector_size = len(vectors[0])

    if args.qdrant_url:
        client = QdrantClient(url=args.qdrant_url, api_key=args.qdrant_api_key)
        logging.info("Using remote Qdrant at %s", args.qdrant_url)
    else:
        client = QdrantClient(path=str(qdrant_path))
    try:
        ensure_collection(client, args.collection, vector_size, recreate=args.recreate)
        ensure_payload_indexes(client, args.collection)

        points = (
            models.PointStruct(id=point_id, vector=vector, payload=payload)
            for point_id, vector, payload in zip(ids, vectors, payloads, strict=True)
        )

        total_upserted = 0
        for batch in batched(points, args.batch_size):
            client.upsert(collection_name=args.collection, wait=True, points=batch)
            total_upserted += len(batch)

        collection_info = client.get_collection(args.collection)
        logging.info("Indexed %s points into %s", total_upserted, args.collection)
        logging.info("Qdrant path: %s", qdrant_path)
        logging.info("Collection points count: %s", collection_info.points_count)
    finally:
        client.close()


if __name__ == "__main__":
    main()
