# A visitor loaded /pricing/ right after #11 deployed and saw the pre-deploy page
# (old beta banner, mailto CTA) until a manual hard refresh — main.py's static file
# serving (root() and serve_frontend()) returned bare FileResponse with no
# Cache-Control at all, so browsers fell back to heuristic freshness off
# Last-Modified and could hold a stale HTML page for a while after any deploy.
#
# Fixed by _static_file_response(): hashed _next/static/* assets (safe forever,
# since the filename itself changes when the content does) get a long immutable
# cache; everything else (HTML pages, whose content changes on every deploy but
# whose URL doesn't) gets no-cache, forcing a cheap ETag-backed revalidation.
#
# Uses its own TestClient against a temp OUT_DIR rather than the shared `client`
# fixture, so DEV_MODE/OUT_DIR monkeypatches never leak into other tests.

import main
from fastapi.testclient import TestClient


def _build_fake_export(tmp_path):
    (tmp_path / "index.html").write_text("<html>home</html>")
    pricing_dir = tmp_path / "pricing"
    pricing_dir.mkdir()
    (pricing_dir / "index.html").write_text("<html>pricing</html>")
    static_dir = tmp_path / "_next" / "static" / "chunks"
    static_dir.mkdir(parents=True)
    (static_dir / "abc123.js").write_text("console.log('chunk')")
    return tmp_path


def test_html_pages_get_no_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DEV_MODE", False)
    monkeypatch.setattr(main, "OUT_DIR", _build_fake_export(tmp_path))

    with TestClient(main.app) as c:
        root_resp = c.get("/")
        assert root_resp.headers["cache-control"] == "no-cache"

        pricing_resp = c.get("/pricing/")
        assert pricing_resp.headers["cache-control"] == "no-cache"


def test_hashed_next_static_assets_get_long_immutable_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DEV_MODE", False)
    monkeypatch.setattr(main, "OUT_DIR", _build_fake_export(tmp_path))

    with TestClient(main.app) as c:
        resp = c.get("/_next/static/chunks/abc123.js")
        assert resp.status_code == 200
        assert resp.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_html_and_static_asset_caching_actually_differs(monkeypatch, tmp_path):
    """Guards against both branches silently collapsing to the same header."""
    monkeypatch.setattr(main, "DEV_MODE", False)
    monkeypatch.setattr(main, "OUT_DIR", _build_fake_export(tmp_path))

    with TestClient(main.app) as c:
        html_cache = c.get("/pricing/").headers["cache-control"]
        asset_cache = c.get("/_next/static/chunks/abc123.js").headers["cache-control"]
        assert html_cache != asset_cache
