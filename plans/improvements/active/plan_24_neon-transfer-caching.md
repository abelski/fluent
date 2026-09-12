---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #24 — App-wide read caching to cut Neon network transfer

> **Order:** implement **before #23 (inbox)**. #23's caches are built on `backend/cache.py` from
> this plan.

## Context

Neon's plan caps **network transfer**. #15 used up the free-tier 5GB/month quota, confirmed
on the Neon dashboard. The user asked to cache reads **everywhere in the app where it is safe**,
to reduce Neon traffic.

Measured / verified 2026-09-11 (read-only):
- **The database is tiny, so transfer comes from repeated reads.** Largest tables:
  `user_word_progress` 2.0MB (15.9k rows), `verb` 1.3MB (358 rows, **~3.7KB/row**), `word` 576KB,
  `word_list_item` 552KB, `phrase` 240KB, `article` 88KB (33 rows, 2.7KB/row), `practice_test`
  64KB (52 rows, 1.26KB/row), `news_post` 32KB. 146 users, 100 active in 30 days.
- **Neon is `us-east-1`; Render has no region set (default Oregon).** Each round trip costs
  ~0.2–0.3s in production (`documentation/production-db-latency.md`). Caching also cuts latency.
- **One process.** `render.yaml` starts a single `uvicorn main:app` (no workers). The scheduler
  (`BackgroundScheduler`) runs inside it. A zero-downtime deploy briefly runs old and new
  instances side by side.
- `pg_stat_statements` is preloaded on Neon but the extension isn't created, so there are no
  per-query stats. Creating it is DDL on production (needs explicit approval), and Neon resets
  those stats on every compute suspend. Priorities below come from table sizes × request frequency.
- **All app writes go through a SQLModel `Session`** (routers, `scheduler.py`, `main.py`
  startup, `verb_lookup`). Only seed/backfill scripts and Alembic write through their own
  processes/engines. No bulk `update(User)` anywhere; `LangSync` never writes to the server.

Hot spots found (bytes × frequency):

| Where | What it reads today | Frequency |
|---|---|---|
| `grammar_service._generate_verb_conjugation_tasks` / `_generate_verb_case_tasks` | **the whole `verb` table, ~1.3MB, then parses JSON per row** | every verb-lesson task request |
| `GET /footer-articles` | full `Article` rows **incl. bodies** to return slug+titles | every full page load, anonymous traffic included (Footer is in the root layout) |
| `GET /articles` | full rows incl. bodies (~90KB) to return summaries | articles page |
| `GET /news` | 20 posts with bodies (~30KB) | every landing page load |
| `GET /lists` | all public `word_list` rows + `subcategory_meta` + two aggregations | every `/dashboard/lists` load |
| `_list_words(list_id)` | a list's full `Word` rows | list detail, study, list progress |
| `GET /me/lists-progress` | `(list_id, word_id, star)` for every enrolled list | `/dashboard/lists` |
| `GET /practice/categories`, `/me/practice-categories` | every `PracticeTest` row (~65KB, incl. `lesson_text_lt`) just to count tests | practice pages |
| practice / constitution exam | a test's full question pool | each exam start |
| `grammar_service.get_lessons` | all case rules + **full linked `Article` rows** for titles | grammar page |
| `_generate_sentence_tasks` | a case's full sentence pool (#15 noted this) | each grammar lesson |
| phrase program page / study | a program's full `Phrase` rows | each visit |
| `auth.require_user` / `try_get_user` | full `User` row | **every authenticated request** |
| `GET /me/quota` | `User` + today's `DailyStudySession` | 12 frontend call sites (Header, lists, phrases, StatsBar, QuizSession, pricing…) |

**Model rationale:** `opus`/`high`. The work touches the auth path used by every endpoint,
SQLAlchemy session events, and cache invalidation across ~10 routers. A subtle mistake here
serves stale or wrong data app-wide.

## Goals

- One small stdlib cache module that every cached read goes through. It invalidates itself
  **automatically from the SQL the app actually commits**, so a new admin edit path can't
  forget to clear a cache.
- Admin-edited content (verbs, grammar, words/lists, phrases, practice, articles, news,
  settings) is read from Neon once and then served from memory until it changes.
- The authenticated user row and per-user enrollment/quota rows are served from memory, and
  evicted precisely when that user's rows change.
- Every change an admin or user makes is visible **on the next request** in the same process.
- Warm-cache statement counts drop sharply on the hot paths, and tests pin that in place.

## Non-Goals

- **No caching of anything that changes on every answer or depends on `now`:** word/phrase/
  grammar progress rows, `/me/stats`, streak, activity calendar, review queues, due counts,
  continue-session pools (they join against progress). Rule: cache *inputs*, compute
  time-dependent results per request.
- No caching in admin GET endpoints. Admins need fresh data and traffic is tiny. Admin
  *writes* still drive invalidation.
- No HTTP `Cache-Control`/CDN. That doesn't reduce Neon reads.
- No shared cache (Redis etc.). Single instance; TTLs bound deploy-overlap staleness.
- No change to `verb_lookup`'s curated cache (#22) or the extension's `_TRANSLATION_CACHE`.
  Both already exist and were recently tuned.
- No `pool_pre_ping` change. It isn't caching, costs a few bytes, and removing it risks
  errors after Neon autosuspends.
- No row-level tags for `word`. Any `word` write, including lazy verb enrichment and personal
  words, evicts every word-list cache (a documented ceiling).
- Skipped as low traffic (safe, but not worth the code yet): community/custom programs,
  personal word/phrase lists, extension endpoints.
- No `pg_stat_statements` enablement (production DDL; ask separately if wanted).

## Requirements

### `backend/cache.py` — the only cache mechanism
- API: `get_or_load(key: tuple, loader, *, tags, ttl=600, store_if=None)`,
  `evict_after_commit(session, *tags)`, `clear()`.
  - `tags` is a set or a `callable(value) -> set`.
  - `store_if(value) -> bool` lets a caller refuse to cache, e.g. a partially enriched list.
- **Cached values are plain data** (dicts/tuples/`types.SimpleNamespace`), never ORM instances.
  Every read returns `copy.deepcopy(value)`, so callers may mutate results (e.g. `/lists/{id}`
  adds `w["status"]`).
- Thread-safe: one `threading.Lock` around store mutations. The loader runs outside the lock.
  Concurrent misses may load twice (acceptable; `# ponytail:` note).
- Size cap: 5000 entries (clear expired first, then everything, when exceeded).
- **Tag semantics.** `t` is a table name.
  - An entry is tagged with `t` (whole-table data), `t:pk=<id>` or `t:user=<user_id>`.
  - A committed **ORM flush** of a row emits `t`, `t:pk=<pk>` and, if the model has `user_id`,
    `t:user=<user_id>`. The bare `t` from a row event evicts only entries tagged exactly `t`.
  - A committed **Core/text DML** statement (`update()`, `delete()`, bulk `insert()`,
    `text("UPDATE …")`) emits bare `t`, which evicts `t` **and every `t:*` entry**.
  - A DML statement may narrow its own eviction via `.execution_options(cache_tags={…})`.
    This exists for known-scoped statements such as #23's per-user inbox actions.
- **Write detection via SQLAlchemy `Session` class events** (covers SQLModel sessions, request
  sessions, scheduler and tests):
  - `after_flush` → tags from `session.new | dirty | deleted` (`type(obj).__table__.name`, PK,
    `user_id`).
  - `do_orm_execute` → for `is_insert/is_update/is_delete`, the statement's table (or its
    `cache_tags` option). For `TextClause`, regex
    `^\s*(insert\s+into|update|delete\s+from)\s+"?(\w+)` (case-insensitive).
  - Tags accumulate in `session.info`. **`after_commit` applies them. `after_rollback`
    discards them.** Evicting before commit would let a concurrent read re-cache old data.
- **Stale-refill guard:** a per-table version counter is bumped on every applied eviction.
  `get_or_load` snapshots the versions of its tables before calling the loader and **doesn't
  store** if any changed meanwhile.
- **TTL is the safety net** for writes the listeners can't see: seed/backfill scripts and
  Alembic run against production from another process, plus the other instance during a deploy
  overlap. Default 10 min; `user` entries 60s (security-relevant flags). Documented: "after
  running a seed script against prod, changes appear within 10 min, or restart the service".
- Listeners are installed on import. `database.py` imports `cache` so every process has them.
  `backend/conftest.py` gets an autouse fixture calling `cache.clear()`. Tests that write
  through a raw engine connection must call `cache.clear()` themselves.

### What gets cached

Each loader returns plain data. The per-user / per-request parts of each handler stay uncached.

| # | Loader (file) | Key | Tags | Used by | Notes |
|---|---|---|---|---|---|
| 1 | verb pool, JSON pre-parsed (`grammar_service`) | `("verbs",)` | `verb` | verb conjugation + case-governance tasks | **largest win**; random sampling stays per request |
| 2 | sentence pool after the #156 invariant filter (`grammar_service`) | `("sentences", cases, level)` | `grammar_sentence` | `get_lesson_tasks`, continue-session grammar phase | sampling per request |
| 3 | case rules + linked article **titles only** (`select(Article.slug, title_ru, title_en)`) | `("grammar_rules",)` | `grammar_case_rule`, `article` | `get_lessons` | `is_admin` filtering per request |
| 4 | public grammar programs (`routers/grammar.py`) | `("grammar_programs",)` | `grammar_program` | `/grammar-programs` | enrollments → row 15 |
| 5 | subcategory meta rows (`routers/words.py`) | `("subcategory_meta",)` | `subcategory_meta` | `/subcategory-meta`, `/lists` | `SimpleNamespace` rows keep attribute access |
| 6 | enrollment counts per subcategory | `("enrollment_counts",)` | `user_program` | `/subcategory-meta` | |
| 7 | public non-archived word lists | `("public_lists",)` | `word_list` | `/lists` | custom-program lists per request (uncached) |
| 8 | word + star counts for a set of list ids | `("list_counts", tuple(sorted(ids)))` | `word_list_item`, `word` | `/lists` | most users share the same id set |
| 9 | `_list_words(list_id)` | `("list_words", list_id)` | `word`, `word_list_item` | `/lists/{id}`, `/lists/{id}/study`, `/lists/{id}/progress` | `store_if`: every word has `part_of_speech` set (enrichment settled), so `lazy_enrich_words` still runs on misses |
| 10 | `(list_id, word_id, star)` mapping per list-id set | `("list_items", tuple(sorted(ids)))` | `word_list_item`, `word` | `/me/lists-progress` | user progress join stays per request |
| 11 | articles index per category, **summary columns only** | `("articles", category)` | `article` | `/articles` | |
| 12 | footer articles, **slug + titles only** | `("footer_articles",)` | `article` | `/footer-articles` | |
| 13 | published article by slug (incl. `published` flag; 404 decided per request) | `("article", slug)` | `article` | `/articles/{slug}`, `/me/welcome` | |
| 14 | news page | `("news", limit, offset)` | `news_post` | `/news` | |
| 15 | per-user enrollments: `UserProgram` keys, `UserGrammarProgram`, `UserPhraseProgramEnrollment`, `UserPracticeCategoryEnrollment` ids | `("enroll", table, user_id)` | `<table>:user=<user_id>` | `/me/programs`, `/grammar-programs`, `/phrase-programs`, `/practice/categories`, `/me/practice-categories` | enrollment only, **not** progress |
| 16 | public phrase programs + phrase counts | `("phrase_programs",)` | `phrase_program`, `phrase` | `/phrase-programs` | stage distribution stays per request |
| 17 | phrases of a program, ordered | `("phrases", program_id)` | `phrase` | `/phrase-programs/{id}`, `/phrase-programs/{id}/study` | progress + selection per request |
| 18 | practice categories; tests meta **without `lesson_text_lt`**; question counts per test | `("practice_meta",)` | `practice_category`, `practice_test`, `practice_question` | `/practice/categories`, `/me/practice-categories`, `/practice/categories/{id}/tests`, `/practice/tests` | visibility (`status`, `is_admin`, `created_by`) per request |
| 19 | practice test by id + active question pool | `("practice_exam", test_id)` | `practice_test`, `practice_question` | `/practice/tests/{id}/exam` | `random.sample` per request |
| 20 | active constitution questions | `("constitution_pool",)` | `constitution_question` | `/practice/constitution/exam` | sampling per request |
| 21 | CEFR thresholds setting | `("setting", "cefr_thresholds")` | `app_setting` | public `GET /admin/settings/cefr-thresholds` | |
| 22 | today's `DailyStudySession` for a user | `("quota_day", user_id, today)` | `daily_study_session:user=<user_id>` | `/me/quota` | date in key handles midnight; `premium_active` still computed per request |
| 23 | leaderboard top 10 | `("leaderboard", period, week_start)` | **none: TTL 60s only** | `/leaderboard` | public, eventually consistent; its tables change on every answer, so no tag |
| 24 | **auth user row** (`auth.py`) | `("user_by_email", email)` | `user:pk=<id>` (from value) | `require_user`, `try_get_user` → **every endpoint** | see below |

### Auth user cache (row 24) — details and safety
- JWT signature and expiry are still verified on every request. Only the DB lookup is cached.
- Cache the row's column values. Per request build `User(**values)`, call
  `sqlalchemy.orm.make_transient_to_detached()`, then `session.merge(user, load=False)`. The
  handler gets a session-attached `User` with **no SELECT**. Mutations and commits work as
  today, and the flush evicts `user:pk=<id>`.
- A miss with no row falls through to the existing auto-create path (`enroll_default_programs`
  unchanged). Don't cache "no such user".
- TTL 60s. Every in-process change (settings, premium via webhook/admin/scheduler, admin flags,
  login `last_login`, user delete) evicts immediately. 60s bounds the other instance during a
  deploy overlap.

### Standing constraints
- All validation must be server-side (never frontend-only). Unchanged: caching never skips a validation or permission check; access checks (`_can_access_list`, test visibility, `is_admin`) still run per request on the cached data.
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. **N/A** — backend-only.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/cache.py` (new) — store, `get_or_load`, deepcopy on read, tag semantics, TTL,
  size cap, per-table versions + stale-refill guard, lock, `evict_after_commit`, `clear`,
  `Session` listeners (`after_flush`, `do_orm_execute`, `after_commit`, `after_rollback`),
  `cache_tags` execution option. `# ponytail:` notes: per-process (single uvicorn); no
  single-flight; move to a shared cache if Render ever runs >1 instance.
- [x] 2. `backend/database.py` — `import cache` so listeners are always installed.
  `backend/conftest.py` — autouse fixture `cache.clear()`.
- [x] 3. `backend/tests/test_cache.py` (new) — hit/miss; deepcopy isolation (mutating a result
  doesn't change the next read); ORM insert/update/delete evicts `t`, `t:pk=`, `t:user=`
  correctly and **doesn't** evict another user's `t:user=` entry; Core `update()/delete()` and
  `text("UPDATE …")` evict all `t*`; `cache_tags` narrows eviction; rollback evicts nothing; a
  write committed while the loader runs prevents storing (stale-refill guard); `store_if=False`
  isn't stored; TTL expiry reloads (monkeypatched clock); size cap.
- [x] 4. `backend/auth.py` — row 24: cached lookup + `make_transient_to_detached` +
  `merge(load=False)` in `require_user` and `try_get_user`.
- [x] 5. `backend/grammar_service.py` — rows 1–3 (verb pool with pre-parsed JSON, sentence pools,
  case rules + article-title columns). `backend/routers/grammar.py` — row 4 + grammar enrollments (row 15).
- [x] 6. `backend/routers/words.py` — rows 5–10, 13 (`/me/welcome`), 15 (`/me/programs`), 22, 23.
- [x] 7. `backend/routers/articles.py` — rows 11–13. `backend/routers/news.py` — row 14.
- [x] 8. `backend/routers/phrases.py` — rows 15 (phrase enrollments), 16, 17.
- [x] 9. `backend/routers/practice.py` + `backend/routers/constitution.py` — rows 15 (practice
  enrollments), 18–20.
- [x] 10. `backend/routers/admin.py` — row 21 on the public CEFR-thresholds GET only.
- [x] 11. `backend/tests/test_cache_endpoints.py` (new). For each cached endpoint: (a) a
  **warm-call statement count** (`before_cursor_execute` listener, as in `test_verb_lookup.py`)
  equal to only its uncached per-user parts, with the auth lookup = 0; (b) **invalidation through
  the real write endpoint**, visible on the very next request:
  - admin edits article body/title → `/articles/{slug}`, `/articles`, `/footer-articles`
  - admin edits word → `/lists/{id}`
  - admin changes subcategory status → `/lists` visibility
  - admin publishes practice test → `/practice/categories` count
  - admin edits question → exam pool
  - admin edits grammar sentence/rule → lesson tasks / lessons
  - admin creates news → `/news`
  - admin sets CEFR thresholds → GET
  - enroll/unenroll → `/me/programs` etc.
  - start session → `/me/quota.sessions_today`
  - admin grants premium / sets admin flag → next `/me/quota` reflects it
  - `PATCH /me/settings` → persisted and reflected (proves `merge(load=False)` writes)
  - user A's writes don't evict user B's user-scoped entries

  Also: verb pool read = 0 statements on a warm verb-lesson task request; `_list_words` for a
  list with an unenriched word isn't cached; `/lists/{id}` word `status` mutation doesn't leak
  into another user's response.
- [x] 12. Run the whole backend suite. Fix any test that writes through a raw engine connection
  or relies on uncached reads (add `cache.clear()` or write through a `Session`). Don't weaken
  assertions.
- [x] 13. `documentation/caching.md` (new) — how the cache works and why: tag semantics,
  automatic invalidation from committed SQL, the stale-refill guard, TTL for
  out-of-process/deploy-overlap writes (incl. "seed scripts: ≤10 min or restart"), the
  deepcopy rule, **what must never be cached** (progress, `now`-relative results, admin GETs),
  how to add a new cached loader, and the `word` table ceiling. Link
  `production-db-latency.md` and #15.
- [x] 14. `CLAUDE.md` — under Code Style add one line: "Reads of shared, admin-edited content
  go through `backend/cache.py` (see `documentation/caching.md`); never cache progress or
  `now`-relative results."
- [x] 15. `documentation/CHANGELOG.md` — `#24` entry once validated.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_cache.py tests/test_cache_endpoints.py -q`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types (unchanged frontend, sanity): `cd frontend && npx tsc --noEmit`
- [x] Full Playwright suite, since live-API specs exercise cached endpoints: `cd frontend && npx playwright test`
- [x] Smoke (local, one uvicorn + one next dev, `ps` first):
  - Log in; browse lists, a list, study, phrases, grammar (incl. a verb lesson), practice, articles, landing.
  - In admin, edit an article, a word and a practice question. Each change is visible
    immediately without a restart.
  - Grant/revoke premium on a test account: header badge and quota follow on the next request.
  - Nav, header, footer and login intact vs production.
- [x] Auth safety: revoke admin on a test account, and the next request to an admin endpoint → 403.
- [ ] Post-deploy (manual, user): Neon console → "Data transfer" for the 7 days after deploy
  vs the 7 days before. Record the numbers in `documentation/caching.md`.
- [ ] News post written and published via /news-writer ("pages load faster").

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
