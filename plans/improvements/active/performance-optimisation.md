# Performance Optimisation — slow page loads

**Created:** 2026-07-20
**Status:** planned

## Summary

Several dashboard pages are slow because list endpoints run per-row queries
(N+1) instead of batching. Every extra query is a separate network round trip to
Neon, so latency scales with how much content the user has. The worst offender
is the community programs page, which issues hundreds of queries for a single
page load.

All findings below were verified by reading the code, not inferred.

## Prior art

`plans/triage/implemented/IMPLEMENTED-issue-119-optimize-lists-page-load.md`
covered `/dashboard/lists` and is **already implemented** — composite index
`ix_user_word_progress_user_word` exists (`models.py:111`, migration
`e5f6a7b8c9d0`), and `/api/me/lists-progress` was scoped to enrolled lists.
This plan does not revisit those endpoints.

Worth carrying over from #119: it identified a second cost class beyond N+1 —
**over-fetching**, where an endpoint aggregates the whole catalog when the page
only renders the user's enrolled subset. The endpoints below are N+1 problems
specifically; a follow-up pass should check the same endpoints for over-fetching
once query counts are flat.

---

## Findings

### P0 — `/dashboard/lists` request waterfall (user-reported slow page)

**File:** `frontend/app/dashboard/lists/page.tsx:125-148`

This is the page the user actually reports as slow. **The bottleneck is not
query count — it is frontend request sequencing.**

`/api/me/lists-progress` is chained *inside* the `.then()` of
`Promise.all([/api/lists, /api/me/programs])`, so it does not even start until
both have returned. Critical path is serial:

```
max(/api/lists, /api/me/programs)  →  /api/me/lists-progress
```

The only real dependency is the guard `if (allLists.length === 0) return;`
(`:137`). `lists-progress` takes no input from either response — it derives
everything from the user's own enrollments server-side and returns a map keyed
by list ID. The chaining is incidental, not required.

Note `/api/lists` is also the heaviest call on the page (see P1b), so this
waterfall stacks the two slowest requests end to end.

### P1b — `GET /api/lists` aggregates the entire catalogue

**File:** `backend/routers/words.py:186-200`

The `counts` and `_star_rows` aggregations group over **all** `WordListItem`
rows with no visibility filter — `_star_rows` joins `word_list_item → word`
across the whole DB on every page load. Cost scales with total catalogue size,
not with the user's enrolled subset, and the page discards most of it
(`page.tsx` filters by `enrolledKeys`).

This is exactly the "optional step 3" of issue #119 that was never done.

### Verified as already fixed by #119

`/api/me/lists-progress` itself (`words.py:769-855`) is now well-implemented:
scoped to enrolled subcategories, 4 queries regardless of list count, aggregated
in Python. No N+1. Do not re-optimise it — the remaining cost is *when* it is
called, not what it does.

### P1 — `GET /api/programs/community` (worst by query count, different page)

**File:** `backend/routers/custom_programs.py:168-180`, helper `_program_detail` at `:44`

`list_community_programs` calls `_program_detail(p, session)` per program. Each
call runs:

- 1 query for `CustomProgramList` rows
- **1 query per word list** via `_word_count_for_list` (`:36`) inside a `sum(...)`
- 1 query for enrollments
- 1 query for the author (`session.get(User, ...)`, `author` arg is never passed here)

Cost = `P × (3 + L)` queries for P programs averaging L lists each.
30 programs × 5 lists ≈ **240 queries** per page load.

### P1 — `GET /api/programs/community/{share_token}/word-sets`

**File:** `backend/routers/custom_programs.py:198-231`

Nested N+1. For each link: 1 `session.get(WordList)` + 1 query for items, then
**one `session.get(Word, ...)` per word** (`:228`). A program with 10 sets ×
30 words = **~320 queries**. Same pattern repeats at `:105-110` and `:293-302`.

### P2 — `GET /api/me/word-lists`

**File:** `backend/routers/word_lists.py:169-182`, helper `_list_summary` at `:143`

`_list_summary` runs 2 queries per list (word IDs, then progress rows).
Cost = `1 + 2N`. 20 lists = **41 queries**; batched it is 3.

### P2 — `GET /api/phrase-programs`

**File:** `backend/routers/phrases.py:103-155`

Counts and enrollments are already batched correctly, but the stage-distribution
block loops enrolled programs and runs a `Phrase.id` query per program (`:137`)
plus a progress query per program (`:146`) — 2 queries per enrolled program.

### P3 — Header quota fetch

**File:** `frontend/components/Header.tsx:46-60`

`/api/me/quota` fires on every mount. It does not block content render (only
populates the admin/premium badge), so this is polish, not load time.

### Not a code issue — Render cold start

If the service is on Render's free tier, the first request after idle costs
**30-60s**. That would dominate every item above. Confirm the plan tier before
attributing slowness to queries.

---

## Fix plan

> Ordering note: Steps A and B below target the user-reported slow page and
> should be done first. Steps 1-6 target other pages and are a separate,
> higher-risk effort.

### Step A — Un-chain `lists-progress` (P0) — DONE & VERIFIED

Status 2026-07-22: applied to `page.tsx:125-136` (fetch hoisted to top level,
`if (allLists.length === 0) return;` guard removed). Typecheck (0 app errors)
and production build pass.

**Verified by observation** against a freshly restarted dev server. Network
timing captured on `/dashboard/lists/`:

- After fix: `/api/lists` and `/api/me/lists-progress` both dispatch at
  t≈218ms — in parallel.
- Old chained code (with `/api/lists` artificially delayed 800ms):
  `lists-progress` did not dispatch until t≈1024ms — i.e. it waited the full
  duration of `/api/lists`.

Regression test `frontend/tests/lists-progress-parallel.spec.ts` passes on the
fix and fails on the old code (progressStart 1024ms > 400ms threshold), so it
genuinely guards the parallelism. It navigates directly to
`http://localhost:3000/dashboard/lists/` because the :8000 backend redirects
`/dashboard/*` to the dev server and drops the path.

Real-world win = one full `/api/lists` round trip removed from the critical
path. Magnitude equals whatever `/api/lists` latency is in production — which
Step B (below) also reduces, so these compound.


**File:** `frontend/app/dashboard/lists/page.tsx:125-148`

Move the `/api/me/lists-progress` fetch out of the `Promise.all().then()` and
fire it alongside the other top-level calls. Drop the
`if (allLists.length === 0) return;` guard — the endpoint already returns `{}`
cheaply for a user with no enrolled lists, and the `setProgress` map merge is
tolerant of an empty object.

Why this first:
- **Frontend-only.** No SQL, no batching, no regrouping.
- **Carries none of R1-R5.** No ordering to preserve, no payload shape change,
  no shared helper, no ownership filter, no migration.
- ~5 lines. Removes one full serialized round trip from the critical path.

### Step B — Scope `/api/lists` aggregations (P1b)

**File:** `backend/routers/words.py:186-200`

Resolve the visible list IDs first (public lists already selected at `:159`,
plus `custom_program_lists`), then constrain both aggregations with
`.where(col(WordListItem.word_list_id).in_(visible_ids))`.

Lower risk than Steps 1-4: these are `func.count` aggregations feeding a dict,
so there is **no ordering to preserve** (R2 does not apply). Still verify the
response shape — lists with zero items must keep defaulting to 0 rather than
disappearing from the map.

### Step 1 — Batch `_program_detail` (P1)

Add a bulk variant used by `list_community_programs` and `list_my_programs`:

1. Fetch all `CustomProgramList` rows for all program IDs in one
   `col(...).in_(program_ids)` query; group into `dict[program_id, list[word_list_id]]`.
2. One grouped count query for word counts:
   `select(WordListItem.word_list_id, func.count(WordListItem.id)).where(col(WordListItem.word_list_id).in_(all_list_ids)).group_by(...)`
3. One grouped count for enrollments per program (currently loads full rows just
   to call `len()` — use `func.count`).
4. One `User` query for all `created_by` IDs.

Keep single-program `_program_detail` for the by-token endpoint; have it delegate
to the batch helper with a one-element list so there is one code path.

### Step 2 — Batch the word-sets endpoints (P1)

Applies to the two **read** endpoints only: `:198`
(`get_community_program_word_sets`) and `:293` (`get_program_word_sets`).

**Do not batch `_delete_owned_word_sets` (`:97`).** It shares the loop shape but
is a delete path with an ownership filter (`wl.created_by == user_id`) and a
hand-ordered four-phase flush to satisfy FK constraints. It runs on program
update/delete, not on page load, so it carries no page-latency win — only
data-loss risk. Leave it alone.

For `:198` and `:293`:

1. One query for all `WordList` rows by ID.
2. One query for all `WordListItem` rows across those lists.
3. One query for all `Word` rows via `col(Word.id).in_(word_ids)`; build a
   `dict[id, Word]` and resolve in Python.

Result: 3 queries regardless of program size.

### Step 3 — Batch `_list_summary` (P2)

Rewrite `list_my_word_lists` to:

1. One query for all `WordListItem` rows for the owned list IDs → group word IDs
   per list.
2. One query for `UserWordProgress` across the union of all word IDs.
3. Compute known/learning/new per list in Python.

Total 3 queries instead of `1 + 2N`. Keep `_list_summary` for the single-list
endpoint.

### Step 4 — Batch phrase stage distribution (P2)

In `phrases.py:135-155`, replace the per-program loop with one query for all
`Phrase.id, Phrase.program_id` where `program_id in enrolled_ids`, and one
`UserPhraseProgress` query across all those phrase IDs. Group in Python.

### Step 5 — DB indexes (mostly already covered)

Verified against `backend/models.py` — batching turns N small lookups into one
`IN (...)` scan, so these need to be indexed:

| Column | State |
| --- | --- |
| `WordListItem.word_list_id` | indexed (`models.py:92`) |
| `WordListItem.word_id` | indexed (`:93`) |
| `UserWordProgress(user_id, word_id)` | composite exists (`:111`) — added by issue #119 |
| `CustomProgramList.custom_program_id` | indexed (`:390`) |
| `Phrase.program_id` | indexed (`:425`) |
| `UserPhraseProgress(user_id, phrase_id)` | **gap** — `user_id` (`:480`) and `phrase_id` (`:481`) indexed separately, no composite |

Only action: consider a composite `ix_user_phrase_progress_user_phrase`
mirroring the word-progress one, for the Step 4 query. Add via `__table_args__`
+ an Alembic migration (follow
`migrations/versions/e5f6a7b8c9d0_add_composite_index_user_word_progress.py`).
Do this *after* measuring Step 4 — a composite may not be needed if the two
single-column indexes already suffice at current row counts.

### Step 6 (optional) — Header quota

Fold the quota/role fields into an existing dashboard payload, or cache the
response in `sessionStorage` for the session. Low value; do last.

---

## Expected improvement

Per-query latency to Neon is the unknown; assume **5-15ms** warm same-region,
higher cold or cross-region. Improvement = queries eliminated × that latency.

| Endpoint | Queries before | After | Est. saved (warm) |
| --- | --- | --- | --- |
| `/programs/community` (30 programs × 5 lists) | ~240 | ~4 | **~2.4s** |
| `/community/{token}/word-sets` (10 sets × 30 words) | ~320 | 3 | **~3.2s** |
| `/me/word-lists` (20 lists) | ~41 | 3 | **~380ms** |
| `/phrase-programs` (10 enrolled) | ~23 | ~5 | **~180ms** |

The two P1 endpoints are where the "really slow" complaint most likely comes
from — those are multi-second wins. The P2 endpoints are a 3-4× reduction in DB
time, noticeable but not dramatic. New users with little content see almost no
change, since the cost scales with content volume.

**Caveat:** these are derived from query counts, not measurement. Step 0 of
implementation should establish a real baseline (see Verification), and the
table should be updated with measured numbers before considering this done.

If the service is on Render free tier, cold start (30-60s) will still dominate
and none of this will be felt on the first request. Resolve that separately.

---

## Verification

### The existing suite will NOT catch these bugs

Assessed directly — 15 backend test files (`test_custom_programs.py`,
`test_word_lists.py`) and 72 Playwright specs exist, but they do not cover the
failure modes this refactor introduces:

- **They assert auth and CRUD, not payload shape or order.**
  `test_word_lists.py` checks `detail["words"][0]["lithuanian"] == "namas"` with
  a *single* word in the list, and `len(detail["words"]) == 3` for bulk add —
  a count, never a sequence. Nothing pins per-parent ordering, so **R2 passes
  green while shipping shuffled study order**.
- **Fixtures are tiny.** 1-3 words, 1-2 lists. At that size a batched
  implementation and an N+1 implementation are indistinguishable — no
  regression signal, and no way to observe query growth.
- **Tests run on SQLite in-memory, not Postgres** (`backend/conftest.py`
  patches `database.engine` to `sqlite:///:memory:`). Consequences:
  - **R3 is invisible** — `IN (...)` plan degradation and driver parameter
    ceilings are Postgres behaviours SQLite never exhibits.
  - **Ordering can pass falsely** — SQLite and Postgres return unordered rows
    in different natural orders. A batch regroup that happens to work on SQLite
    can still shuffle on Neon.
  - No timing signal exists at all; wall-clock numbers must come from elsewhere.
- **`_list_summary`'s `known`/`learning`/`new` counts are untested.** Grep finds
  no assertion on those keys anywhere. Step 3 rewrites exactly that arithmetic.

What the suite *does* cover well: ownership/permission boundaries
(`test_non_owner_gets_404_everywhere`), which is genuine protection for R1.

### What to add before touching code

1. **Golden-payload diff (highest value).** For a seeded user with realistic
   volume, capture JSON from all four endpoints to files. After each step,
   re-capture and `diff`. Byte-identical output is the single strongest
   guarantee that shape, ordering, key presence, and skip-missing semantics
   are unchanged. This catches R2 and R4 together and needs no new assertions.
2. **Realistic-volume fixture.** A seed producing ~20 lists, ~10 programs ×
   ~5 sets × ~30 words. Every check below is meaningless without it.
3. **Query-count assertion.** An SQLAlchemy `before_cursor_execute` listener
   counting statements per request; assert the count is *constant* between a
   5-list and a 25-list seed. This is what stops the N+1 silently returning
   later. Works correctly on SQLite, so it belongs in the normal suite.
4. **Explicit order assertions.** Assert full ordered lists
   (`[w["front"] for w in set["words"]] == [...]`), not lengths or membership.
5. **At least one run against Postgres.** SQLite cannot validate R3 or confirm
   ordering. Point the suite at a scratch Postgres/Neon branch for the
   pre-merge run, even if CI stays on SQLite.

### Sequence

1. Add fixture + golden capture + query-count test **against current code**;
   confirm they pass and that the golden files reflect today's behaviour.
2. Baseline measurement: query counts and wall time per endpoint, on Postgres.
3. Implement one step at a time. After each: golden diff must be empty, query
   count must drop, ordering assertions must hold.
4. Re-measure; replace the estimate table with real numbers.
5. Rebuild frontend, restart local server, run the full Playwright suite.
6. Manually exercise `/dashboard/programs`, a community program's word sets,
   `/dashboard/lists`, and `/dashboard/phrases` — the four surfaces touched.

### Rollback

Each step is independently revertible and touches a distinct endpoint. Land them
as **separate commits**, not one refactor, so a regression found in production
can be reverted without losing the other wins.

## Risks

Ordered by blast radius.

### R1 — Data loss if the delete path gets batched (severe, avoidable)

`_delete_owned_word_sets` (`custom_programs.py:97`) looks like the same N+1 loop
as the read endpoints and is a tempting target for "consistency". It is not
safe to touch:

- It filters by ownership *inside* the loop (`wl.created_by == user_id`) —
  a batched rewrite that drops this deletes other users' word lists.
- It deletes in four explicit `flush()` phases to satisfy FK constraints
  (items+links → lists → progress → words). Reordering these raises
  `IntegrityError`, or worse, orphans rows.

**Mitigation:** explicitly out of scope (see Step 2). If it is ever revisited,
that is its own plan with its own tests.

### R2 — Silent ordering regression (likely, low visibility)

Both `_program_detail` and the word-set endpoints rely on SQL `ORDER BY
position`. Batching replaces N ordered queries with one query grouped through a
Python dict — the per-parent ordering is no longer guaranteed by the DB.

This fails *silently*: the page renders, the data is all present, only the
sequence is wrong. Word sets and words within a set would appear shuffled, which
matters because study order is pedagogically meaningful here.

**Mitigation:** keep `ORDER BY parent_id, position` on the batch query and
append into per-parent lists in row order; assert exact list order in tests, not
just set membership.

### R3 — Large `IN (...)` clauses (moderate)

Step 2 collects every word ID in a program into one `col(Word.id).in_(...)`.
A large program (10 sets × 100 words) yields a 1000-element `IN` list. Postgres
handles this, but plans can degrade and drivers have parameter ceilings
(~32k for psycopg). The failure mode is a *slower* query than before — the exact
opposite of the goal.

**Mitigation:** chunk `IN` lists at ~500-1000 IDs, or join through
`WordListItem` instead of collecting IDs client-side. Measure the largest real
program before assuming the single-query form wins.

### R4 — Response shape drift (moderate, easy to catch)

The frontend consumes these payloads directly. Regrouping in Python makes it
easy to change key order, omit a key when a group is empty, or return `[]`
where the old code returned an absent key. Note the existing `if not wl:
continue` / `if word:` guards — batched code must reproduce the same
skip-missing behaviour rather than emitting nulls.

**Mitigation:** capture JSON responses for a real user before the change, diff
after. This is the single highest-value check in the whole plan.

### R5 — Shared helpers used by untouched endpoints (moderate)

`_list_summary` and `_program_detail` have callers beyond the endpoints being
optimised. Rewriting them in place changes behaviour for those callers too.

**Mitigation:** add batch variants; keep single-item helpers delegating to them,
so there is one code path but no signature break.

### R6 — Estimates are upper bounds (affects expectations, not correctness)

The query counts in the table assume every `session.get(Word, id)` is a round
trip. SQLAlchemy's identity map serves repeats of the *same* ID from memory
within a session, so the real count is lower wherever IDs repeat across sets.
The direction of the win is certain; the magnitude may be smaller than quoted.

**Mitigation:** the measured baseline (Verification step 1) supersedes the
estimate table. Do not report the estimates as results.

### R7 — Index migration on a live DB (low)

If the `UserPhraseProgress` composite is added, `CREATE INDEX` takes a write
lock. On Neon at current table sizes this is brief, but use
`CREATE INDEX CONCURRENTLY` if the table is large.
