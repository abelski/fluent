"""IndexNow push (#59a): pure helpers, key route, and the on-new-build orchestration."""

import logging
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

import indexnow
import main
from conftest import _test_engine
from models import AppSetting, Article

KEY = "k3y-secret-0123"


def test_guard_off_at_test_start(monkeypatch):
    assert indexnow.enabled() is False
    monkeypatch.setenv("INDEXNOW_KEY", KEY)
    assert indexnow.enabled() is False  # no RENDER
    monkeypatch.setenv("RENDER", "true")
    assert indexnow.enabled() is True


def test_pending_urls():
    c = ["a", "b", "c", "b"]
    assert indexnow.pending_urls(None, c, []) == ["a", "b", "c"]
    assert indexnow.pending_urls(["a", "b"], c, []) == ["c"]
    assert indexnow.pending_urls(["a", "b", "c"], c, ["b", "zzz"]) == ["b"]
    assert indexnow.pending_urls(["a"], c, ["c"]) == ["b", "c"]


def test_submit_payload_and_logging(monkeypatch, caplog):
    monkeypatch.setenv("INDEXNOW_KEY", KEY)
    seen = {}

    class R:
        status_code = 202

    def fake_post(url, json, timeout):
        seen.update(url=url, json=json, timeout=timeout)
        return R()

    monkeypatch.setattr(indexnow.httpx, "post", fake_post)
    with caplog.at_level(logging.INFO):
        assert indexnow.submit("https://fluent.lt/", ["https://fluent.lt/x/"]) == 202
    assert seen["json"] == {
        "host": "fluent.lt", "key": KEY,
        "keyLocation": "https://fluent.lt/indexnow-key.txt", "urlList": ["https://fluent.lt/x/"],
    }
    assert seen["timeout"] == 10
    assert KEY not in caplog.text

    def boom(*a, **k):
        raise indexnow.httpx.ConnectError("down")

    monkeypatch.setattr(indexnow.httpx, "post", boom)
    with caplog.at_level(logging.INFO):
        assert indexnow.submit("https://fluent.lt", ["u"]) is None
    assert KEY not in caplog.text


def test_sitemap_locs_match_sitemap_xml(client):
    import re
    with Session(_test_engine) as s:
        assert main._sitemap_locs(s) == re.findall(r"<loc>(.*?)</loc>", client.get("/sitemap.xml").text)


def test_key_route(client, monkeypatch):
    monkeypatch.delenv("INDEXNOW_KEY", raising=False)
    assert client.get("/indexnow-key.txt").status_code == 404
    monkeypatch.setenv("INDEXNOW_KEY", KEY)
    r = client.get("/indexnow-key.txt")
    assert r.status_code == 200 and r.text == KEY
    assert r.headers["content-type"].startswith("text/plain")


@pytest.fixture
def build(tmp_path, monkeypatch):
    out = tmp_path / "out"
    out.mkdir()
    (tmp_path / ".next").mkdir()
    (tmp_path / ".next" / "BUILD_ID").write_text("b1")
    monkeypatch.setattr(main, "OUT_DIR", out)
    monkeypatch.setattr(main, "FRONTEND_URL", "https://fluent.lt")
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.setenv("INDEXNOW_KEY", KEY)
    pushed = []
    result = {"status": 200}

    def fake_submit(base, urls):
        pushed.append(urls)
        return result["status"]

    monkeypatch.setattr(main.indexnow, "submit", fake_submit)
    with Session(_test_engine) as s:
        for a in s.exec(select(Article)).all():
            s.delete(a)
        for r in s.exec(select(AppSetting).where(AppSetting.key == "indexnow_state")).all():
            s.delete(r)
        s.commit()

    def page(path):
        d = out / path.strip("/")
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text("x")

    def new_build(bid):
        (tmp_path / ".next" / "BUILD_ID").write_text(bid)

    def run():
        main.push_indexnow_on_new_build(_test_engine, out)

    return type("B", (), {"page": staticmethod(page), "new_build": staticmethod(new_build),
                          "run": staticmethod(run), "pushed": pushed, "result": result, "out": out})


def _state():
    import json
    with Session(_test_engine) as s:
        row = s.exec(select(AppSetting).where(AppSetting.key == "indexnow_state")).first()
        return json.loads(row.value) if row else None


def test_push_on_new_build(build):
    base = "https://fluent.lt"
    with Session(_test_engine) as s:
        s.add(Article(slug="zodis", title_ru="t", body_ru="b", title_en="", body_en="", published=True,
                     updated_at=datetime(2020, 1, 1)))
        s.add(Article(slug="dar-vienas", title_ru="t", body_ru="b", title_en="", body_en="", published=True,
                     updated_at=datetime(2020, 1, 1)))
        s.commit()
    (build.out / "index.html").write_text("x")
    build.page("pricing")
    build.page("dashboard/articles/zodis")  # dar-vienas is published but not built yet

    build.run()  # first run: every built URL, unbuilt article neither pushed nor saved
    assert build.pushed == [[f"{base}/", f"{base}/pricing/", f"{base}/dashboard/articles/zodis/"]]
    assert _state()["build_id"] == "b1" and f"{base}/dashboard/articles/dar-vienas/" not in _state()["urls"]

    build.run()  # same build id
    assert len(build.pushed) == 1

    build.new_build("b2")
    build.page("dashboard/articles/dar-vienas")
    build.run()  # only the newly built page
    assert build.pushed[1] == [f"{base}/dashboard/articles/dar-vienas/"]

    # edited article between the two builds is re-sent
    st = _state()
    built_at = datetime.fromisoformat(st["built_at"])
    with Session(_test_engine) as s:
        a = s.exec(select(Article).where(Article.slug == "zodis")).one()
        a.updated_at = built_at + timedelta(seconds=30)
        s.add(a)
        s.commit()
    import os
    bf = build.out.parent / ".next" / "BUILD_ID"
    build.new_build("b3")
    t = (built_at + timedelta(minutes=5)).replace(tzinfo=timezone.utc).timestamp()
    os.utime(bf, (t, t))
    build.run()
    assert build.pushed[2] == [f"{base}/dashboard/articles/zodis/"]


def test_failed_push_not_saved(build):
    (build.out / "index.html").write_text("x")
    build.result["status"] = 500
    build.run()
    assert len(build.pushed) == 1 and _state() is None
