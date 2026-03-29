from __future__ import annotations

import argparse
import hashlib
import logging
from datetime import datetime, UTC
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from common import (
    BELITA_SHOP_BASE,
    absolute_url,
    build_session,
    category_slug_from_url,
    clean_text,
    configure_logging,
    dedupe_keep_order,
    extract_table_fields,
    fetch_html,
    polite_sleep,
    price_to_float,
    save_json,
    soup_from_html,
)


CATALOG_ROOT_URL = f"{BELITA_SHOP_BASE}/katalog/"
DEFAULT_OUTPUT = Path("data/raw_catalog.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Belita Shop catalog cards into raw_catalog.json")
    parser.add_argument("--catalog-root", default=CATALOG_ROOT_URL, help="Catalog landing page for category discovery")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="JSON output path")
    parser.add_argument("--category-limit", type=int, default=None, help="Process only the first N categories")
    parser.add_argument("--product-limit", type=int, default=None, help="Stop after collecting N product cards")
    parser.add_argument("--resume", action="store_true", help="Resume from existing output JSON if it exists")
    parser.add_argument("--save-every", type=int, default=10, help="Persist progress after every N collected products")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def discover_category_urls(catalog_root_html: str, catalog_root_url: str) -> list[str]:
    soup = soup_from_html(catalog_root_html)
    urls: list[str] = []
    for link in soup.select("div.menu-main a[href]"):
        if link.find_next_sibling("ul") is not None:
            continue
        href = link.get("href", "").strip()
        absolute = absolute_url(BELITA_SHOP_BASE, href)
        if not absolute:
            continue
        parsed = urlparse(absolute)
        if parsed.netloc != urlparse(BELITA_SHOP_BASE).netloc:
            continue
        if not parsed.path.startswith("/katalog/"):
            continue
        if parsed.path == "/katalog/":
            continue
        if parsed.path.endswith(".html"):
            continue
        if "back_url_admin" in parsed.query:
            continue
        if not parsed.path.endswith("/"):
            continue
        urls.append(absolute)

    unique_urls = dedupe_keep_order(urls)
    logging.info("Discovered %s candidate category URLs from %s", len(unique_urls), catalog_root_url)
    return unique_urls


def extract_category_product_urls(page_html: str) -> list[str]:
    soup = soup_from_html(page_html)
    product_urls: list[str] = []
    for block in soup.select("div.prod-block.catalog-item"):
        link = block.select_one("a.url-detail[href]")
        absolute = absolute_url(BELITA_SHOP_BASE, link.get("href") if link else None)
        if absolute:
            product_urls.append(absolute)
    return dedupe_keep_order(product_urls)


def extract_pagination_urls(category_url: str, page_html: str) -> list[str]:
    soup = soup_from_html(page_html)
    pagination_urls = [category_url]
    for link in soup.select('a[href*="PAGEN_1="]'):
        href = absolute_url(BELITA_SHOP_BASE, link.get("href"))
        if href:
            pagination_urls.append(href)
    return dedupe_keep_order(pagination_urls)


def extract_breadcrumbs(soup: BeautifulSoup) -> list[str]:
    crumbs: list[str] = []
    for node in soup.select(".breadcrumbs-list .item"):
        text = clean_text(node.get_text(" ", strip=True))
        if text:
            crumbs.append(text)
    return crumbs


def extract_description(soup: BeautifulSoup) -> str | None:
    description_block = soup.select_one("div.product-text")
    if description_block is None:
        return None
    for link in description_block.select("a"):
        link.decompose()
    return clean_text(description_block.get_text(" ", strip=True))


def infer_price_currency(price_text: str | None) -> str | None:
    if not price_text:
        return None
    if "BYN" in price_text.upper():
        return "BYN"
    return None


def extract_product_payload(product_url: str, product_html: str) -> dict[str, object]:
    soup = soup_from_html(product_html)
    table_fields = extract_table_fields(soup)
    breadcrumbs = extract_breadcrumbs(soup)
    product_name = clean_text(soup.select_one("h1.product-title").get_text(" ", strip=True) if soup.select_one("h1.product-title") else None)
    price_text = clean_text(soup.select_one(".product-price .price").get_text(" ", strip=True) if soup.select_one(".product-price .price") else None)
    composition_link = soup.select_one('a[href*="barcode="]')
    category_path = []
    if len(breadcrumbs) >= 3:
        category_path = breadcrumbs[1:-1]

    source_hash = hashlib.sha256(product_html.encode("utf-8")).hexdigest()
    barcode = clean_text(table_fields.get("Штрих-код"))

    payload: dict[str, object] = {
        "source_site": "belita-shop.by",
        "source_url": product_url,
        "source_hash": source_hash,
        "scraped_at": datetime.now(UTC).isoformat(),
        "product_key": barcode or category_slug_from_url(product_url) or product_url,
        "name": product_name,
        "brand": clean_text(table_fields.get("Бренд")),
        "line": clean_text(table_fields.get("Линия")),
        "category": clean_text(category_path[-1] if category_path else None),
        "category_path": category_path,
        "price": {
            "amount": price_to_float(price_text),
            "currency": infer_price_currency(price_text),
            "display": price_text,
        },
        "barcode": barcode,
        "description": extract_description(soup),
        "purpose": clean_text(table_fields.get("Назначение")),
        "usage_instructions": clean_text(table_fields.get("Применение")),
        "volume": clean_text(table_fields.get("Объем")),
        "country_of_origin": clean_text(table_fields.get("Страна-производитель")),
        "age": clean_text(table_fields.get("Возраст")),
        "composition_lookup_url": absolute_url(BELITA_SHOP_BASE, composition_link.get("href") if composition_link else None),
        "raw_table_fields": table_fields,
    }
    return payload


def process_category(session, category_url: str) -> tuple[list[str], list[str]]:
    logging.info("Processing category: %s", category_url)
    first_page_html = fetch_html(session, category_url)
    pagination_urls = extract_pagination_urls(category_url, first_page_html)

    all_product_urls: list[str] = []
    for index, page_url in enumerate(pagination_urls):
        if index == 0:
            page_html = first_page_html
        else:
            page_html = fetch_html(session, page_url)
        product_urls = extract_category_product_urls(page_html)
        if not product_urls:
            logging.info("Category page has no product cards, skipping: %s", page_url)
            continue
        logging.info("Found %s product links on %s", len(product_urls), page_url)
        all_product_urls.extend(product_urls)
    return dedupe_keep_order(all_product_urls), pagination_urls


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    output_path = Path(args.output)
    session = build_session(BELITA_SHOP_BASE)

    catalog_root_html = fetch_html(session, args.catalog_root)
    category_urls = discover_category_urls(catalog_root_html, args.catalog_root)
    if args.category_limit is not None:
        category_urls = category_urls[: args.category_limit]

    collected_products: list[dict[str, object]] = []
    seen_product_urls: set[str] = set()

    if args.resume and output_path.exists():
        existing_payload = output_path.read_text(encoding="utf-8")
        try:
            existing_items = __import__("json").loads(existing_payload)
        except Exception as exc:  # noqa: BLE001
            logging.warning("Failed to parse existing output for resume %s: %s", output_path, exc)
            existing_items = []
        if isinstance(existing_items, list):
            collected_products = [item for item in existing_items if isinstance(item, dict)]
            seen_product_urls = {
                str(item.get("source_url"))
                for item in collected_products
                if isinstance(item, dict) and item.get("source_url")
            }
            logging.info(
                "Resume enabled: loaded %s existing products from %s",
                len(collected_products),
                output_path,
            )

    for category_index, category_url in enumerate(category_urls, start=1):
        logging.info("[%s/%s] Category queue item: %s", category_index, len(category_urls), category_url)
        try:
            product_urls, _pagination_urls = process_category(session, category_url)
        except Exception as exc:  # noqa: BLE001
            logging.exception("Failed to process category %s: %s", category_url, exc)
            continue

        for product_url in product_urls:
            if product_url in seen_product_urls:
                continue
            if args.product_limit is not None and len(collected_products) >= args.product_limit:
                break

            seen_product_urls.add(product_url)
            try:
                logging.info("Fetching product card: %s", product_url)
                product_html = fetch_html(session, product_url)
                payload = extract_product_payload(product_url, product_html)
                collected_products.append(payload)
            except Exception as exc:  # noqa: BLE001
                logging.exception("Failed to parse product %s: %s", product_url, exc)
                fallback_payload = {
                    "source_site": "belita-shop.by",
                    "source_url": product_url,
                    "scraped_at": datetime.now(UTC).isoformat(),
                    "error": str(exc),
                }
                collected_products.append(fallback_payload)

            if args.save_every > 0 and len(collected_products) % args.save_every == 0:
                save_json(output_path, collected_products)
                logging.info(
                    "Checkpoint saved: %s products -> %s",
                    len(collected_products),
                    output_path,
                )

        if args.product_limit is not None and len(collected_products) >= args.product_limit:
            logging.info("Product limit reached: %s", args.product_limit)
            break

        polite_sleep()

    save_json(output_path, collected_products)
    logging.info("Saved %s records to %s", len(collected_products), output_path)
    logging.info("Sample keys: %s", list(collected_products[0].keys()) if collected_products else [])


if __name__ == "__main__":
    main()
