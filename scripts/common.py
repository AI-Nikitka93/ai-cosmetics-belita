from __future__ import annotations

import json
import logging
import random
import re
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


LOGGER_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"
DEFAULT_TIMEOUT = 30

BELITA_SHOP_BASE = "https://belita-shop.by"
BELITA_OFFICIAL_BASE = "https://belita.by"
VITEX_OFFICIAL_BASE = "https://vitex.by"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0",
]


def configure_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format=LOGGER_FORMAT)


def build_session(base_url: str | None = None) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
        }
    )
    if base_url:
        session.headers["Referer"] = base_url
    return session


def polite_sleep(min_seconds: float = 1.0, max_seconds: float = 2.0) -> float:
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)
    return delay


def fetch_html(
    session: requests.Session,
    url: str,
    *,
    timeout: int = DEFAULT_TIMEOUT,
    retries: int = 3,
    polite_delay: bool = True,
) -> str:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            response.raise_for_status()
            if polite_delay:
                polite_sleep()
            return response.text
        except requests.RequestException as exc:
            last_error = exc
            logging.warning("Request failed (%s/%s) for %s: %s", attempt, retries, url, exc)
            if polite_delay:
                polite_sleep(1.5, 3.0)
    raise RuntimeError(f"Failed to fetch {url}") from last_error


def soup_from_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def absolute_url(base_url: str, href: str | None) -> str | None:
    if not href:
        return None
    return urljoin(base_url, href.strip())


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()
    return cleaned or None


def price_to_float(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)", value.replace(" ", ""))
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save_json(path: Path, payload: object) -> None:
    ensure_parent_dir(path)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_label(label: str | None) -> str | None:
    if not label:
        return None
    label = clean_text(label)
    if not label:
        return None
    return label.rstrip(":").strip()


def extract_table_fields(soup: BeautifulSoup) -> dict[str, str]:
    fields: dict[str, str] = {}
    for row in soup.select("table.product-table tr"):
        label = clean_text(row.select_one(".cell-name").get_text(" ", strip=True) if row.select_one(".cell-name") else None)
        value = clean_text(row.select_one(".cell-descr").get_text(" ", strip=True) if row.select_one(".cell-descr") else None)
        if label and value:
            fields[label] = value
    return fields


def extract_paragraph_fields(container: BeautifulSoup | None) -> dict[str, str]:
    if container is None:
        return {}
    fields: dict[str, str] = {}
    for paragraph in container.select("p"):
        bold = paragraph.find("b")
        if bold is None:
            continue
        label = normalize_label(bold.get_text(" ", strip=True))
        raw_text = paragraph.get_text(" ", strip=True)
        if not label or not raw_text:
            continue
        value = clean_text(raw_text.replace(bold.get_text(" ", strip=True), "", 1))
        if value:
            fields[label] = value
    return fields


def normalize_inci_text(inci_text: str | None) -> str | None:
    if not inci_text:
        return None
    normalized = clean_text(inci_text.replace(" ,", ","))
    return normalized


def split_inci(inci_text: str | None) -> list[str]:
    if not inci_text:
        return []
    pieces = re.split(r"[;,]\s*", inci_text)
    result: list[str] = []
    for piece in pieces:
        cleaned = clean_text(piece)
        if cleaned:
            result.append(cleaned)
    return result


def canonical_key(*parts: str | None) -> str:
    joined = "|".join(part.strip() for part in parts if part and part.strip())
    return joined


def category_slug_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    path_parts = [part for part in parsed.path.split("/") if part]
    if len(path_parts) >= 2 and path_parts[0] == "katalog":
        return path_parts[1]
    return None


def search_url(base_url: str, query: str) -> str:
    return f"{base_url}/poisk/?q={quote_plus(query)}"


def dedupe_keep_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
