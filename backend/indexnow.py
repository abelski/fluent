# IndexNow client (#59a) — pure helpers, no main/database import so scripts and tests can use it.
# Orchestration (what is pending, when to push) lives in main.py.

import logging
import os
from urllib.parse import urlparse

import httpx

log = logging.getLogger(__name__)

ENDPOINT = "https://api.indexnow.org/indexnow"
KEY_PATH = "/indexnow-key.txt"


def key() -> str:
    return os.getenv("INDEXNOW_KEY", "").strip()


def enabled() -> bool:
    # RENDER is set only on Render: a local backend shares the production DB and must never push.
    return bool(key() and os.getenv("RENDER"))


def submit(base_url: str, urls: list[str]) -> int | None:
    """POST urls to IndexNow in one request. Returns the status code, None on a network error."""
    base = base_url.rstrip("/")
    payload = {
        "host": urlparse(base).netloc,
        "key": key(),
        "keyLocation": f"{base}{KEY_PATH}",
        "urlList": urls,
    }
    try:
        status = httpx.post(ENDPOINT, json=payload, timeout=10).status_code
    except httpx.HTTPError as exc:
        log.warning("IndexNow: push of %d URLs failed: %s", len(urls), type(exc).__name__)
        return None
    # print, not log.info: no logging config here, so INFO would be dropped from the Render log.
    print(f"IndexNow: pushed {len(urls)} URLs, status {status}", flush=True)
    return status


def pending_urls(prev_urls: list[str] | None, candidates: list[str], changed: list[str]) -> list[str]:
    """Candidates that are new since the previous push or changed; sitemap order, deduped."""
    if prev_urls is None:
        return list(dict.fromkeys(candidates))
    seen, touched = set(prev_urls), set(changed)
    return [u for u in dict.fromkeys(candidates) if u not in seen or u in touched]
