# #48c — sitemap hreflang pairs for the EN article twins.
import xml.etree.ElementTree as ET

from sqlmodel import Session, select

import database
from models import Article

NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
LT_SLUG = "būdvardžiai-linksniavimas"
# Exactly how Next.js encodes it in the on-page canonical/hreflang (checked against the
# built out/ HTML in frontend/tests/en-seo-routes.spec.ts).
LT_SLUG_ENCODED = "b%C5%ABdvard%C5%BEiai-linksniavimas"


def _ensure(slug: str, body_en: str) -> None:
    with Session(database.engine) as s:
        if s.exec(select(Article).where(Article.slug == slug)).first():
            return
        s.add(Article(slug=slug, title_ru=f"Заголовок {slug}", title_en=f"Title {slug}",
                      body_ru="Текст", body_en=body_en, category="learning_materials",
                      published=True, show_in_footer=False))
        s.commit()


def _sitemap(client) -> dict[str, dict[str, str]]:
    _ensure(LT_SLUG, "Text")
    _ensure("sitemap-ru-only", "")
    r = client.get("/sitemap.xml")
    assert r.status_code == 200
    root = ET.fromstring(r.content)
    return {
        u.find("s:loc", NS).text: {l.get("hreflang"): l.get("href") for l in u.findall("x:link", NS)}
        for u in root.findall("s:url", NS)
    }


def test_en_links_are_reciprocal(client):
    entries = _sitemap(client)
    pairs = [e for e in entries.values() if e]
    assert pairs
    for links in pairs:
        en, ru = links["en"], links["ru"]
        assert en in entries, f"{en} is not a <loc>"
        assert entries[en]["ru"] == ru
        assert entries[ru]["en"] == en


def test_every_hreflang_entry_has_x_default(client):
    for loc, links in _sitemap(client).items():
        if links:
            assert set(links) == {"ru", "en", "x-default"}, loc
            assert links["x-default"] == links["ru"]
            assert loc in links.values()


def test_lithuanian_slug_encoded_identically(client):
    entries = _sitemap(client)
    ru = next(loc for loc in entries if loc.endswith(f"/dashboard/articles/{LT_SLUG_ENCODED}/") and "/en/" not in loc)
    en = ru.replace("/dashboard/", "/en/dashboard/", 1)
    for loc in (ru, en):
        assert loc in entries
        assert entries[loc] == {"ru": ru, "en": en, "x-default": ru}
    assert LT_SLUG not in "".join(entries)


def test_no_en_urls_beyond_articles(client):
    for loc in _sitemap(client):
        if "/en/" in loc:
            path = loc.split("/en/", 1)[1]
            assert path == "dashboard/articles/" or (
                path.startswith("dashboard/articles/") and path.count("/") == 3
            ), loc


def test_article_without_body_en_gets_no_twin(client):
    entries = _sitemap(client)
    ru = next(loc for loc in entries if loc.endswith("/dashboard/articles/sitemap-ru-only/"))
    assert entries[ru] == {}
    assert not any(loc.endswith("/en/dashboard/articles/sitemap-ru-only/") for loc in entries)
