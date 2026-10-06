"""Force a full IndexNow push of every URL in the live sitemap (#59a). No DB, no stored state.

Usage (from backend/), INDEXNOW_KEY must match the key set on Render:
    INDEXNOW_KEY=<key> .venv/bin/python scripts/indexnow_push_all.py --yes
"""

import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import indexnow  # noqa: E402

BASE = "https://fluent.lt"

if "--yes" not in sys.argv or not indexnow.key():
    sys.exit("Needs INDEXNOW_KEY in the environment and --yes (this pushes to api.indexnow.org).")

xml = httpx.get(f"{BASE}/sitemap.xml", timeout=30).text
urls = list(dict.fromkeys(re.findall(r"<loc>([^<]+)</loc>", xml)))
print(f"{len(urls)} URLs, status {indexnow.submit(BASE, urls)}")
