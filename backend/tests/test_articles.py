# Autotests for public articles listing — covers the `?category=` filter added
# alongside the Article.category column (learning_materials | adaptation | blog).

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


def _make_article(slug: str, category: str, published: bool = True) -> None:
    with Session(database.engine) as s:
        s.add(
            Article(
                slug=slug,
                title_ru=f"Заголовок {slug}",
                title_en=f"Title {slug}",
                body_ru="Текст",
                body_en="Text",
                category=category,
                published=published,
                show_in_footer=False,
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
