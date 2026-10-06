---
kind: feature
status: done
iteration: 3
max_iterations: 30
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Plan #59a — IndexNow for Bing + Yandex

## Context
Idea: `plans/ideas/idea_59_bing-yandex-visibility.md` (part **#59a**; #59b — crawlable home page,
`/en/` home, Yandex region — is planned separately after the 2026-10-24 #48c check).

Bing and Yandex discover our pages slowly (Yandex sitemap queued since 2026-09-25; Bing 2
impressions in 6 days). Both accept IndexNow pushes via `https://api.indexnow.org/indexnow`
(one request takes up to 10,000 URLs).

**Why deploy-time, not save-time (decided with the user 2026-10-06, "publish queues, deploy
sends"):** article, program and phrase-program pages are prerendered by `next build`. Until the
next deploy, a just-published article URL is served by the `_` placeholder (`backend/main.py`
`_resolve_static`) whose canonical points to the article index (`documentation/seo.md`, "The
alternates-replace trap"). Pinging at save time would send crawlers to that placeholder. So a
publish/edit only makes a URL *pending*; the first start of a **new build** sends it.

**Pending is derived, not queued** — no admin endpoint changes. On a new build:
- candidate URLs = sitemap `<loc>`s **whose page exists in the build**
  (`out/<unquoted path>/index.html`; `/` → `out/index.html`). This also covers a page published
  *during* a deploy: it isn't in the build yet, so it isn't pushed or recorded, and the next
  build pushes it;
- push = candidates not in the previous push's `urls` ∪ articles whose `updated_at` lies between
  the previous and the current build time (`BUILD_ID` mtime), mapped to their RU + `/en/` locs;
- no stored state (first run) → push every candidate (the one-time full push).

`updated_at` is bumped on admin update (`routers/articles.py:311`) and import (`:468`); it is
naive UTC (`routers/articles.py:31-32`), so build times are stored and compared as naive UTC too.

Reused: `sitemap()` (`main.py:178`), `_has_en` (`main.py:173`), `AppSetting` key/value table
(`models.py:381`), `httpx` (already in `requirements.txt`), `on_startup()` (`main.py:65`, already
imports `engine` locally at `:72`), `OUT_DIR` (`main.py:45`; `OUT_DIR.parent/.next/BUILD_ID` is
written by the Render build).

**Safety:** the local backend talks to the **production** Neon DB. A local start must never push
or overwrite stored state, so pushing requires both `INDEXNOW_KEY` and `RENDER` (Render sets it).
Tests pop both at **module level** in `conftest.py`, because the `client` fixture is
session-scoped and runs `on_startup()` before any function-scoped fixture (same trap as Telegram,
`conftest.py:23-26`).

Suggested sonnet/medium: one small pure module + a startup routine in `main.py` + tests. The
derived-pending logic and the prod-DB guard need care; no UI, auth or migrations.

## Goals
- Every deploy that brings new pages or edited articles tells Bing and Yandex about exactly those
  URLs, automatically, and only once their prerendered page is live.
- The first production deploy pushes all sitemap URLs (~89) once.
- A maintainer can force a full push by hand.
- Bing Webmaster and Yandex Webmaster show the URLs as received via IndexNow.

## Non-Goals
- #59b: home page server render, `/en/` home, Yandex region (separate plan after 2026-10-24).
- Duplicate meta descriptions (user: later).
- Pinging on admin save.
- **Edits to existing word programs and phrase programs:** `SubcategoryMeta` and `PhraseProgram`
  have no `updated_at`, so only *new* program URLs are pushed automatically; edits go out via the
  manual full push. Adding timestamps isn't worth a migration now.
- **Removed pages:** a deleted/unpublished article's URL still serves the `_` placeholder with
  200, so there is nothing useful to report.
- Google (ignores IndexNow). A queue table or retry logic — a failed push is logged and simply
  retried on the next new build (state is saved only on success).
- **Deliberate change from the idea:** the key is served at a fixed `/indexnow-key.txt` and sent as
  `keyLocation` (allowed by IndexNow), not at `/<key>.txt` — no dynamic route needed.

## Requirements
- `GET/HEAD /indexnow-key.txt` → the key as text/plain; 404 when `INDEXNOW_KEY` is unset.
- Push: `POST https://api.indexnow.org/indexnow`, JSON `{host, key, keyLocation, urlList}` with
  `host = urlparse(FRONTEND_URL).netloc` and `keyLocation = <FRONTEND_URL>/indexnow-key.txt`,
  timeout 10 s. 200/202 = success. Log status and URL count; never log the key.
- Startup push runs in a daemon thread with its own `Session(engine)`; it never blocks or fails
  startup; it first waits 90 s so the new instance is serving the key file before IndexNow checks
  it (`# ponytail:` comment — fixed delay, poll the key URL if it ever proves too short).
- Push only when `INDEXNOW_KEY` and `RENDER` are both set and the build id differs from the stored
  one. State: `AppSetting` key `indexnow_state` = `{build_id, built_at (naive-UTC ISO), urls}`,
  saved only after a 200/202 (or when there was nothing to push).
- Manual script: pushes every URL of the live sitemap; needs `INDEXNOW_KEY` and `--yes`; touches
  neither the DB nor the stored state.

### Standing constraints
- All validation must be server-side (never frontend-only).
- Markup/styling/component rules: **N/A** — backend-only plan, no UI.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/indexnow.py` (new, pure — no `main`/`database` import) — `ENDPOINT`,
  `KEY_PATH = "/indexnow-key.txt"`, `key()` (env `INDEXNOW_KEY`, stripped), `enabled()` (`key()`
  and env `RENDER`), `submit(base_url, urls) -> int | None` (POST as in Requirements; returns the
  status code, `None` on any httpx error; logs count + status, never the key), and
  `pending_urls(prev_urls: list[str] | None, candidates: list[str], changed: list[str]) -> list[str]`
  (`None` → all candidates; else candidates not in `prev_urls` ∪ changed ∩ candidates; sitemap
  order, deduped).
- [x] 2. `backend/main.py` — extract `_article_locs(base, article) -> list[str]` from
  `sitemap()` (`quote(slug, safe='')` path, plus the `/en` twin when `_has_en`) and
  `_sitemap_locs(session) -> list[str]`; `sitemap()` uses both, output unchanged
  (`tests/test_sitemap_hreflang.py` must stay green).
- [x] 3. `backend/main.py` — `_in_build(loc) -> bool` (`OUT_DIR / unquote(urlparse(loc).path).strip("/") / "index.html"`, `/` → `OUT_DIR / "index.html"`) and
  `push_indexnow_on_new_build(engine, out_dir)`: sleep 90 s; read `out_dir.parent/.next/BUILD_ID`
  (missing → return) and its mtime as naive UTC; load `indexnow_state`; same build id → return;
  candidates = `[u for u in _sitemap_locs(s) if _in_build(u)]`; changed = `_article_locs` of
  published articles with `prev.built_at < updated_at <= built_at`; `pending_urls(...)`; if
  non-empty → `indexnow.submit`; on 200/202 or empty → save `{build_id, built_at, urls: candidates}`.
- [x] 4. `backend/main.py` — route `GET/HEAD /indexnow-key.txt` next to `robots.txt` (before the
  catch-all). In `on_startup()`: `if indexnow.enabled(): threading.Thread(target=push_indexnow_on_new_build, args=(engine, OUT_DIR), daemon=True).start()`.
- [x] 5. `backend/scripts/indexnow_push_all.py` (new) — fetch `https://fluent.lt/sitemap.xml`,
  `indexnow.submit` all locs, print status + count; refuse without `--yes` or without
  `INDEXNOW_KEY`.
- [x] 6. `backend/conftest.py` — module level, before `main` is imported (near line 26):
  `os.environ.pop("INDEXNOW_KEY", None); os.environ.pop("RENDER", None)`.
- [x] 7. `backend/tests/test_indexnow.py` (new):
  - `pending_urls`: first run = all; new URL only; changed article; changed URL not in candidates
    is dropped; order + dedup.
  - `submit` (monkeypatch `httpx.post`): payload has `host`, `key`, `keyLocation`, `urlList`,
    `timeout=10`; 202 → 202; httpx exception → `None`; `caplog` never contains the key.
  - key route: 200 + key with env set (monkeypatch), 404 without.
  - `push_indexnow_on_new_build` with `tmp_path/out/...index.html` files, `tmp_path/.next/BUILD_ID`,
    the test engine, `submit` monkeypatched, sleep monkeypatched to no-op: first run pushes all
    built URLs; a sitemap URL without a built page is neither pushed nor saved; same build id →
    no submit; new build → only new + changed; failed submit → state not saved.
  - `enabled()` is false without `RENDER`, and false at test start (guard from item 6).
- [x] 8. `render.yaml` — add `INDEXNOW_KEY` (`sync: false`) to `envVars`.
- [x] 9. `specs/seo.md` (new) — scenarios as built: key file at `/indexnow-key.txt`; "a publish
  or article edit is sent on the next deploy, once its page is in the build"; "new word/phrase
  program URL is sent on the next deploy"; "full push" (one request, no batches); "no pings outside
  production (needs `INDEXNOW_KEY` + `RENDER`)"; "a failed push never breaks startup and is retried
  on the next build". Update the idea's Proposed spec block for `specs/seo.md` to match.
- [x] 10. `documentation/seo.md` — new "IndexNow (#59a)" section: how it works, the deploy-time
  decision and why (placeholder canonical), the in-build filter, the prod-DB guard (never put
  `INDEXNOW_KEY` in local `.env`), the 90 s delay, rollout steps, how to check Bing/Yandex.
- [x] 11. `.claude/commands/seo.md` — Steps 3/4: also read Bing "IndexNow" and Yandex IndexNow
  status and record received URL counts in the log Notes.
- [x] 12. `plans/reminders.md` — add:
  - `- 2026-10-24 — plan #59b (home page SSR + /en/ home + Yandex region): /sdlc-feature-analyst on idea_59, after the #48c check (#59)`
  - rollout follow-ups are added at rollout (item in Validation), dated from the actual deploy.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_indexnow.py tests/test_sitemap_hreflang.py -q`
- [x] Full backend suite: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Rollout (user, after merge + push): generate a key (`python3 -c "import secrets;print(secrets.token_hex(16))"`),
  set `INDEXNOW_KEY` on Render, deploy; `curl https://fluent.lt/indexnow-key.txt` returns it;
  ~2 min later the Render log shows "IndexNow: pushed N URLs, status 200/202". Then add to
  `plans/reminders.md`: deploy+2 days — Bing Webmaster → IndexNow and Yandex show the URLs (#59a);
  deploy+14 days — Yandex pages in search > 43, Bing impressions > 2/week (#59a).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest tests/test_indexnow.py tests/test_sitemap_hreflang.py -q
cd backend && .venv/bin/python -m pytest -q
```

UI checks (RU + EN, 375px, screenshots): **N/A** — this plan changes no page anyone sees; the only
new URL is a plain-text key file. Close-out adds the `#59a` CHANGELOG entry.

## Review (cold, 2026-10-06)
Fixed from the cold review: module-level env guard in conftest; thread args + own session; pure
`indexnow.py` with orchestration in `main.py` (no circular import); shared `_article_locs` so
pushed URLs match sitemap locs byte for byte; in-build filter (pages published mid-deploy);
build-time watermark in naive UTC; 90 s delay for the first-deploy key check; `host` from
`FRONTEND_URL`; `submit` tests incl. key-not-logged; dropped the manual second-server check (one
server per side, prod DB); program edits + removals named as Non-Goals; "batches" dropped.
Rejected: nothing.

## Code review
- [x] Code review passed (round 3)
- note: time.sleep(90) in the startup thread is an acknowledged ceiling (ponytail comment).
- note: /indexnow-key.txt serves the key publicly, as IndexNow requires; enabled() fails closed without RENDER.
- note: tests/test_random_phrase.py::test_random_phrase_returns_only_public_program_phrases is flaky (random sampling, ~1 in 5 runs), unrelated to #59a; 733/733 otherwise.
