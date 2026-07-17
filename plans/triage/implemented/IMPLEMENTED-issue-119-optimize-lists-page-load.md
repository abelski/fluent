# Issue #119 — /dashboard/lists/

**Reported:** 2026-06-04 11:43:57
**Status:** open
**Description:** Нужно оптимизировать страницу она грузится слишком долго

(Translation: "Need to optimize the page, it loads too slowly")

## Root cause
The `/dashboard/lists` page fires 6 parallel API calls on load. Two endpoints scan far more data than the page needs, and one critical index is missing.

**Primary bottleneck — `GET /api/me/lists-progress`** (`backend/routers/words.py:728-806`):
- Over-fetching (`words.py:757-763`): the `public_rows` query joins `word_list_item → word_list → word` for **every public list in the DB**, with no filter on the user's enrollments. The page only renders enrolled subcategories (`page.tsx:299` filters with `enrolledKeys.has(...)`), so most of this work is discarded client-side.
- Missing index on `user_word_progress.word_id` (`models.py:112`): the progress lookup at `words.py:779-784` filters `word_id IN (<all word ids>)`. Only `user_id` is indexed (`models.py:111`); no index on `word_id` (confirmed in `migrations/versions/be15b4e3f2ed_initial_schema.py`).

**Secondary — `GET /api/lists`** (`words.py:118-224`): already batched (no N+1) but computes word counts and star_counts for **all** public lists, not just enrolled ones (`words.py:157-181`), and returns the whole catalog as JSON.

Other endpoints (`/api/me/programs`, `/api/subcategory-meta`, `/api/me/quota`) are single cheap queries — not the problem. No client-side bottleneck.

## Fix plan
1. **Add composite index `user_word_progress(user_id, word_id)`** via `__table_args__` in `models.py` + an Alembic migration in `backend/migrations/versions/`. Cheapest, highest-leverage change; benefits `lists-progress`, `get_list`, and `get_study_words`.
2. **Scope `/api/me/lists-progress` to enrolled lists only.** In `words.py:728-806`, resolve the user's visible list IDs first (enrolled subcategories via `UserProgram` → `WordList.subcategory IN (...)`, plus custom-program list IDs already computed at `words.py:743-753`), then add `WHERE WordListItem.word_list_id IN (<enrolled_list_ids>)` to the `public_rows` query (`words.py:757-763`).
3. **(Optional, after 2) Scope `/api/lists` aggregations** (`words.py:157-181`) to enrolled lists, or add an enrolled-filter path for the dashboard while keeping the catalog query for `/programs` reuse.
4. **Confirm `word_list_item(word_list_id)` index exists** — `models.py:91` declares `index=True`; verify in DB, add via migration if missing.
5. **Validate with `EXPLAIN ANALYZE`** on `lists-progress` before/after, then smoke-test `/dashboard/lists` load time.
6. **(Optional) Short-TTL `Cache-Control` on `/api/lists`** — catalog changes rarely; secondary to steps 1–2.

Sequencing: steps 1 + 2 deliver the bulk of the win.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #119 — Нужно оптимизировать страницу /dashboard/lists, она грузится слишком долго. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 119;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.

### Critical files
- `backend/routers/words.py` (lists-progress 728-806, /api/lists 118-224)
- `backend/models.py` (`UserWordProgress` indexes ~96-112)
- `backend/migrations/versions/` (new index migration)
- `frontend/app/dashboard/lists/page.tsx`
