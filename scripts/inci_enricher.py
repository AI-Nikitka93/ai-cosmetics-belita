from __future__ import annotations

import argparse
import logging
from datetime import datetime, UTC
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from common import (
    BELITA_OFFICIAL_BASE,
    BELITA_SHOP_BASE,
    VITEX_OFFICIAL_BASE,
    absolute_url,
    build_session,
    clean_text,
    configure_logging,
    extract_paragraph_fields,
    fetch_html,
    load_json,
    normalize_inci_text,
    save_json,
    search_url,
    soup_from_html,
)


DEFAULT_INPUT = Path("data/raw_catalog.json")
DEFAULT_OUTPUT = Path("data/enriched_catalog.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich raw catalog with INCI compositions from official sites")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Path to data/raw_catalog.json")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Path to data/enriched_catalog.json")
    parser.add_argument("--limit", type=int, default=None, help="Only enrich the first N products")
    parser.add_argument("--resume", action="store_true", help="Resume from existing enriched JSON if it exists")
    parser.add_argument("--save-every", type=int, default=10, help="Persist progress after every N enriched products")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def official_barcode_urls(barcode: str | None) -> list[str]:
    if not barcode:
        return []
    return [
        f"{BELITA_OFFICIAL_BASE}/katalog/?barcode={barcode}",
        f"{VITEX_OFFICIAL_BASE}/katalog/?barcode={barcode}",
    ]


def parse_official_product_page(product_url: str, html: str) -> dict[str, object]:
    soup = soup_from_html(html)
    details_container = soup.select_one("#product2")
    details = extract_paragraph_fields(details_container)

    title_tag = soup.find("title")
    title = clean_text(title_tag.get_text(" ", strip=True) if title_tag else None)
    inci_text = normalize_inci_text(details.get("Состав") or details.get("INCI"))
    page_brand = clean_text(details.get("Бренд"))
    page_barcode = clean_text(details.get("Штрих-код"))
    page_usage = clean_text(details.get("Применение"))
    page_volume = clean_text(details.get("Объем"))

    return {
        "resolved_product_url": product_url,
        "source_site": urlparse(product_url).netloc,
        "source_title": title,
        "brand": page_brand,
        "barcode": page_barcode,
        "usage_instructions": page_usage,
        "volume": page_volume,
        "inci_text": inci_text,
        "composition_fields": details,
    }


def resolve_search_result(session, base_url: str, product_name: str) -> str | None:
    query_url = search_url(base_url, product_name)
    html = fetch_html(session, query_url)
    soup = soup_from_html(html)
    first_result = soup.select_one(".search-result a.title[href]")
    return absolute_url(base_url, first_result.get("href") if first_result else None)


def candidate_urls_for_product(session, item: dict[str, object]) -> Iterable[str]:
    composition_lookup_url = clean_text(str(item.get("composition_lookup_url"))) if item.get("composition_lookup_url") else None
    if composition_lookup_url:
        yield composition_lookup_url

    barcode = clean_text(str(item.get("barcode"))) if item.get("barcode") else None
    for barcode_url in official_barcode_urls(barcode):
        yield barcode_url

    name = clean_text(str(item.get("name"))) if item.get("name") else None
    if not name:
        return

    for base_url in (BELITA_OFFICIAL_BASE, VITEX_OFFICIAL_BASE):
        try:
            search_result_url = resolve_search_result(session, base_url, name)
        except Exception as exc:  # noqa: BLE001
            logging.warning("Search fallback failed for %s on %s: %s", name, base_url, exc)
            continue
        if search_result_url:
            yield search_result_url


def enrich_item(session, item: dict[str, object]) -> dict[str, object]:
    enriched = dict(item)
    enriched["enriched_at"] = datetime.now(UTC).isoformat()
    enriched["enrichment_status"] = "not_found"
    enriched["composition_source_url"] = None
    enriched["composition_source_site"] = None
    enriched["inci_text"] = None
    enriched["composition_fields"] = {}

    tried_urls: list[str] = []

    for candidate_url in candidate_urls_for_product(session, item):
        if candidate_url in tried_urls:
            continue
        tried_urls.append(candidate_url)
        try:
            logging.info("Trying composition page: %s", candidate_url)
            html = fetch_html(session, candidate_url)
            parsed = parse_official_product_page(candidate_url, html)
            inci_text = parsed.get("inci_text")
            if not inci_text:
                logging.info("No composition found on %s", candidate_url)
                continue

            enriched["enrichment_status"] = "ok"
            enriched["composition_source_url"] = parsed["resolved_product_url"]
            enriched["composition_source_site"] = parsed["source_site"]
            enriched["inci_text"] = parsed["inci_text"]
            enriched["composition_fields"] = parsed["composition_fields"]
            enriched["usage_instructions"] = enriched.get("usage_instructions") or parsed.get("usage_instructions")
            enriched["brand"] = enriched.get("brand") or parsed.get("brand")
            enriched["barcode"] = enriched.get("barcode") or parsed.get("barcode")
            enriched["volume"] = enriched.get("volume") or parsed.get("volume")
            break
        except Exception as exc:  # noqa: BLE001
            logging.warning("Failed to enrich %s via %s: %s", item.get("name"), candidate_url, exc)

    enriched["tried_composition_urls"] = tried_urls
    return enriched


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    input_path = Path(args.input)
    output_path = Path(args.output)
    session = build_session(BELITA_OFFICIAL_BASE)

    raw_items = load_json(input_path)
    if not isinstance(raw_items, list):
        raise ValueError(f"Expected list in {input_path}, got {type(raw_items)!r}")

    if args.limit is not None:
        raw_items = raw_items[: args.limit]

    enriched_items: list[dict[str, object]] = []
    existing_by_source_url: dict[str, dict[str, object]] = {}
    if args.resume and output_path.exists():
        existing_payload = load_json(output_path)
        if isinstance(existing_payload, list):
            for entry in existing_payload:
                if isinstance(entry, dict) and entry.get("source_url"):
                    existing_by_source_url[str(entry["source_url"])] = entry
            logging.info(
                "Resume enabled: loaded %s existing enrichments from %s",
                len(existing_by_source_url),
                output_path,
            )

    for index, item in enumerate(raw_items, start=1):
        if not isinstance(item, dict):
            logging.warning("Skipping unexpected item at index %s: %r", index, item)
            continue
        source_url = str(item.get("source_url") or "")
        if source_url and source_url in existing_by_source_url:
            logging.info("[%s/%s] Reusing existing enrichment for %s", index, len(raw_items), source_url)
            enriched_items.append(existing_by_source_url[source_url])
            continue
        logging.info("[%s/%s] Enriching %s", index, len(raw_items), item.get("name") or item.get("source_url"))
        try:
            enriched_items.append(enrich_item(session, item))
        except Exception as exc:  # noqa: BLE001
            logging.exception("Failed to enrich item %s: %s", item.get("source_url"), exc)
            failed = dict(item)
            failed["enriched_at"] = datetime.now(UTC).isoformat()
            failed["enrichment_status"] = f"error: {exc}"
            enriched_items.append(failed)

        if args.save_every > 0 and len(enriched_items) % args.save_every == 0:
            save_json(output_path, enriched_items)
            logging.info(
                "Checkpoint saved: %s enriched items -> %s",
                len(enriched_items),
                output_path,
            )

    save_json(output_path, enriched_items)
    success_count = sum(1 for item in enriched_items if item.get("enrichment_status") == "ok")
    logging.info("Saved %s enriched items to %s", len(enriched_items), output_path)
    logging.info("Successful composition enrichments: %s", success_count)


if __name__ == "__main__":
    main()
