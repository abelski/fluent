# Autotests for public articles listing — covers the `?category=` filter added
# alongside the Article.category column (learning_materials | adaptation | blog).

from typing import Optional

from jose import jwt
from sqlmodel import Session

import database
from models import Article

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def _make_token(email: str, name: str = "Admin") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


# Matches the seeded admin user in conftest.py (`_seed_static`).
ADMIN_TOKEN = _make_token("artyrbelski@gmail.com", name="Artur")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_article(slug: str, category: str, published: bool = True, body_en: str = "Text",
                  show_in_footer: bool = False, title_en: Optional[str] = None) -> None:
    with Session(database.engine) as s:
        s.add(
            Article(
                slug=slug,
                title_ru=f"Заголовок {slug}",
                title_en=f"Title {slug}" if title_en is None else title_en,
                body_ru="Текст",
                body_en=body_en,
                category=category,
                published=published,
                show_in_footer=show_in_footer,
            )
        )
        s.commit()


def test_list_articles_filters_by_category(client):
    _make_article("art-lm-1", "learning_materials")
    _make_article("art-blog-1", "blog")

    r = client.get("/api/articles?category=learning_materials")
    assert r.status_code == 200
    data = r.json()
    slugs = {a["slug"] for a in data}
    assert "art-lm-1" in slugs
    assert "art-blog-1" not in slugs
    assert all(a["category"] == "learning_materials" for a in data)


def test_list_articles_invalid_category_400(client):
    r = client.get("/api/articles?category=bogus")
    assert r.status_code == 400


def test_list_articles_no_category_returns_all(client):
    _make_article("art-adapt-1", "adaptation")
    r = client.get("/api/articles")
    assert r.status_code == 200
    slugs = {a["slug"] for a in r.json()}
    assert "art-adapt-1" in slugs


def test_list_articles_has_en_flag(client):
    """#48c content gate: EN pages link to /en/ only when the article has an English body."""
    _make_article("art-en-1", "blog")
    _make_article("art-ru-only-1", "blog", body_en="  ")
    flags = {a["slug"]: a["has_en"] for a in client.get("/api/articles").json()}
    assert flags["art-en-1"] is True
    assert flags["art-ru-only-1"] is False


def test_footer_articles_has_en_flag(client):
    """Footer links on EN pages go to /en/ only when the article has an English version."""
    _make_article("ft-en-1", "blog", show_in_footer=True)
    _make_article("ft-no-body-1", "blog", body_en=" ", show_in_footer=True)
    _make_article("ft-no-title-1", "blog", title_en="", show_in_footer=True)
    flags = {a["slug"]: a["has_en"] for a in client.get("/api/footer-articles").json()}
    assert flags["ft-en-1"] is True
    assert flags["ft-no-body-1"] is False
    assert flags["ft-no-title-1"] is False


# ── Admin: category required, saved, and round-trips through export/import ─────

def _article_body(slug: str, category: str) -> dict:
    return {
        "slug": slug,
        "title_ru": f"Заголовок {slug}",
        "title_en": f"Title {slug}",
        "body_ru": "Текст",
        "body_en": "Text",
        "tags": "",
        "category": category,
        "published": True,
        "show_in_footer": False,
    }


def test_admin_create_article_without_category_fails_validation(client):
    body = _article_body("art-no-cat", "blog")
    del body["category"]
    r = client.post("/api/admin/articles", json=body, headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 422


def test_admin_create_article_invalid_category_rejected(client):
    body = _article_body("art-bad-cat", "not-a-real-category")
    r = client.post("/api/admin/articles", json=body, headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 422


def test_admin_create_article_with_category_persists(client):
    r = client.post(
        "/api/admin/articles",
        json=_article_body("art-create-cat", "adaptation"),
        headers=_auth(ADMIN_TOKEN),
    )
    assert r.status_code == 200

    r = client.get("/api/admin/articles/art-create-cat", headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert r.json()["category"] == "adaptation"


def test_admin_export_article_includes_category_frontmatter(client):
    client.post(
        "/api/admin/articles",
        json=_article_body("art-export-cat", "learning_materials"),
        headers=_auth(ADMIN_TOKEN),
    )

    r = client.get("/api/admin/articles/art-export-cat/export", headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert "category: learning_materials" in r.text


def test_admin_import_article_roundtrips_category(client):
    # Create with one category, export it, then re-import (as an update) with a
    # different category and confirm the imported category wins.
    client.post(
        "/api/admin/articles",
        json=_article_body("art-import-cat", "blog"),
        headers=_auth(ADMIN_TOKEN),
    )
    export_r = client.get("/api/admin/articles/art-import-cat/export", headers=_auth(ADMIN_TOKEN))
    assert export_r.status_code == 200
    md = export_r.text
    assert "category: blog" in md

    updated_md = md.replace("category: blog", "category: adaptation")
    import_r = client.post(
        "/api/admin/articles/import",
        files={"file": ("art-import-cat.md", updated_md.encode("utf-8"), "text/markdown")},
        headers=_auth(ADMIN_TOKEN),
    )
    assert import_r.status_code == 200
    assert import_r.json()["action"] == "updated"

    r = client.get("/api/admin/articles/art-import-cat", headers=_auth(ADMIN_TOKEN))
    assert r.json()["category"] == "adaptation"


def test_admin_import_article_defaults_category_when_missing(client):
    md = (
        "---\n"
        "slug: art-import-no-cat\n"
        "title_ru: Заголовок\n"
        "title_en: Title\n"
        "tags: \n"
        "published: true\n"
        "---\n\n"
        "Текст\n\n"
        "---EN---\n\n"
        "Text\n"
    )
    import_r = client.post(
        "/api/admin/articles/import",
        files={"file": ("art-import-no-cat.md", md.encode("utf-8"), "text/markdown")},
        headers=_auth(ADMIN_TOKEN),
    )
    assert import_r.status_code == 200

    r = client.get("/api/admin/articles/art-import-no-cat", headers=_auth(ADMIN_TOKEN))
    assert r.json()["category"] == "blog"


# ── #55: article theme ────────────────────────────────────────────────────────

def test_admin_article_theme_saved_and_listed(client):
    body = {**_article_body("art-theme-1", "learning_materials"), "theme": "verbs"}
    assert client.post("/api/admin/articles", json=body, headers=_auth(ADMIN_TOKEN)).status_code == 200
    assert client.get("/api/admin/articles/art-theme-1", headers=_auth(ADMIN_TOKEN)).json()["theme"] == "verbs"
    listed = {a["slug"]: a for a in client.get("/api/articles").json()}
    assert listed["art-theme-1"]["theme"] == "verbs"
    admin_listed = {a["slug"]: a for a in client.get("/api/admin/articles", headers=_auth(ADMIN_TOKEN)).json()}
    assert admin_listed["art-theme-1"]["theme"] == "verbs"


def test_admin_article_invalid_theme_422(client):
    body = {**_article_body("art-theme-bad", "blog"), "theme": "sports"}
    assert client.post("/api/admin/articles", json=body, headers=_auth(ADMIN_TOKEN)).status_code == 422
    client.post("/api/admin/articles", json=_article_body("art-theme-bad", "blog"), headers=_auth(ADMIN_TOKEN))
    r = client.put("/api/admin/articles/art-theme-bad", json=body, headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 422


def test_admin_article_put_without_theme_clears_it(client):
    """PUT is a full replace — documented; the admin editor always sends the current theme."""
    body = {**_article_body("art-theme-put", "blog"), "theme": "life"}
    client.post("/api/admin/articles", json=body, headers=_auth(ADMIN_TOKEN))
    r = client.put("/api/admin/articles/art-theme-put", json=_article_body("art-theme-put", "blog"),
                   headers=_auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert client.get("/api/admin/articles/art-theme-put", headers=_auth(ADMIN_TOKEN)).json()["theme"] is None
    # Sending it back keeps it.
    client.put("/api/admin/articles/art-theme-put", json=body, headers=_auth(ADMIN_TOKEN))
    assert client.get("/api/admin/articles/art-theme-put", headers=_auth(ADMIN_TOKEN)).json()["theme"] == "life"
