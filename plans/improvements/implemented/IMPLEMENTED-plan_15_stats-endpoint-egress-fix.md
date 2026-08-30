# Plan #15 — Fix excessive Neon data-transfer usage (no migration)

## Context

Neon's free-tier **data transfer/egress** quota (5GB/month) was exhausted — confirmed directly
from the Neon dashboard by the user, not compute-hours or storage (the DB itself is only 20MB).
Per Neon's docs, once that quota is hit, compute is suspended (data intact) until the next monthly
billing cycle resets it, or the plan is upgraded — a code fix does not restore service for the
*current* period by itself, only prevents recurrence next cycle.

A Render Postgres migration was investigated and fully planned first (see prior conversation), but
the actual root cause turned out to be a query-efficiency bug, not a capacity problem — so the
right fix is to stop over-fetching, not to pay for more headroom. This plan replaces the migration
plan; no infrastructure change, no new cost, stays on Neon's free tier.

## Root cause (confirmed by code reading, not just the research agent's summary)

**`GET /api/me/stats`** — `backend/routers/words.py:974-1052` — powers the stats bar shown on
`/dashboard/lists` (the page every login redirects to) and `/dashboard/grammar`. To compute ~9
summary integers (known/learning/streak/mistakes/due_review/grammar_lessons_passed/
practice_exams_completed/phrases_learned/phrases_due_review), it currently fetches **every row**,
with no `LIMIT`, from 5 tables for the user: `UserWordProgress` (975-987), `GrammarLessonResult`
(999-1001), `PracticeExamResult` (1010-1012), `UserPhraseProgress` (1016-1018), and
`UserCustomPhraseProgress` (1026-1028) — then counts/filters in Python.

`frontend/app/dashboard/components/StatsBar.tsx:52-66` calls this on every mount **and on every
browser tab `visibilitychange` event** — i.e. on essentially every login, every navigation back to
the dashboard home, and every tab-focus, for every active user, all day. For a user with months of
word-progress history (thousands of `UserWordProgress` rows, 10 columns each), that's thousands of
full rows shipped out of Neon on a single page load. This is very likely the dominant contributor
to the 5GB/month figure.

The sibling endpoint `GET /me/lists-progress` (`words.py:883-949`) already avoids this exact
problem — its own comment explicitly calls out "avoids scanning the entire catalogue on every page
load" — confirming this is a known pattern in this codebase that `/me/stats` simply didn't follow.

**Secondary, lower-severity finding (optional follow-up, not required for this pass):**
`backend/grammar_service.py:290-354` fetches the *entire* matching `GrammarSentence` pool for a
case/level on every lesson-task request (docstring: "randomized on every call", so never cached),
even though only 20-35 rows are actually used per lesson. Real, but smaller in absolute row count
than `/me/stats` and confined to lesson-start events rather than every page load — flagged for a
later pass, not bundled into this fix.

## The fix

Rewrite `get_stats()` (`backend/routers/words.py:974-1052`) to compute the same values with far
less data transferred, with **zero change to the response shape** (so `StatsBar.tsx` and every
other caller need no changes):

- `known`, `learning`, `mistakes`, `due_review`, `practice_exams_completed`, `phrases_learned`,
  `phrases_due_review`, `grammar_lessons_passed` → SQL `COUNT(*) FILTER (WHERE ...)` aggregates
  instead of fetching full rows and counting in Python. `grammar_lessons_passed` needs a
  "best score per lesson_id, then threshold" aggregate (`MAX(score::float / NULLIF(total,0))
  GROUP BY lesson_id`, then count where > 0.75) rather than a flat count.
- **Streak** (the one genuinely stateful part: consecutive days with activity in
  `UserWordProgress`/`GrammarLessonResult`/`UserPhraseProgress`/`UserCustomPhraseProgress`) → fetch
  only **distinct calendar dates** per table via SQL instead of every raw row (at most a few
  hundred rows even for a very long streak, vs. thousands of progress rows), then keep the exact
  same backward-walk-from-today loop in Python over that much smaller set. Same result, same logic.
- Also apply the identical fix to `GET /me/activity-calendar` (`words.py:1055-1099`) — same
  fetch-all-then-filter-in-Python pattern, same file, trivial to fix in the same pass even though
  it's lower-volume (used from the public landing-page demo, not the authenticated dashboard).

## Why this is safe

- **No API/response contract change** — same endpoint, same JSON field names, same semantics.
  Frontend needs zero changes.
- **No schema/migration change** — pure query rewrite inside one router file.
- **Mathematically equivalent, not approximated** — every aggregate is a direct SQL translation of
  the existing Python filter/count logic, verified line-by-line above.
- **Testable directly**: write a regression test that seeds known `UserWordProgress` /
  `GrammarLessonResult` / `UserPhraseProgress` / `UserCustomPhraseProgress` rows covering the edge
  cases (no progress at all, a streak with a gap, `due_review` exactly on today's boundary, a
  grammar lesson with multiple attempts where only the best counts, mistakes) and asserts the exact
  expected numbers — both before touching the code (to lock in current behavior) and after (to
  prove the rewrite matches).

## Steps

1. Read `backend/routers/words.py:974-1099` in full (both `get_stats` and `get_activity_calendar`)
   and confirm the exact current field semantics one more time immediately before editing (already
   done once above, re-confirm at implementation time in case of drift).
2. Write `backend/tests/test_stats_query_efficiency.py` (or extend an existing stats test file if
   one exists — check first): seed a test user with rows across all 5 tables covering the edge
   cases listed above, assert the exact expected `/me/stats` response. This test should pass
   against the *current* (unfixed) code first, proving it's a faithful behavior spec, not a test
   written to match new code.
3. Rewrite `get_stats()` to use SQL aggregates + distinct-date streak calculation as described
   above. Re-run the test from step 2 — it must still pass unchanged.
4. Apply the same fix to `get_activity_calendar()`.
5. Run the full backend test suite (`cd backend && pytest`) to catch any regression elsewhere.
6. Start the local backend + frontend (checking neither is already running first, per this repo's
   one-server-per-side rule) and manually verify the dashboard stats bar and activity calendar
   render correctly and match pre-change values for a real local account.
7. Update `documentation/CHANGELOG.md` with entry **#15** describing the fix (root cause, the
   endpoint, the egress impact) and note the deliberately-deferred `grammar_service.py` follow-up.

## Explicitly out of scope for this change

- The `grammar_service.py:290-354` sentence-pool over-fetch (flagged above as a smaller, separate
  follow-up).
- Any Render/Neon infrastructure change — this fix is expected to keep the app within Neon's free
  tier going forward; no migration, no new cost.
- The current period's suspension itself isn't something this code fix can undo — that's on
  Neon's automatic monthly reset (or a temporary paid upgrade, if the user wants service restored
  before the reset date — a decision for the user, not part of this plan).

## Verification

- Step 2/3's regression test is the primary correctness check (same numbers, before and after).
- Full backend suite (step 5) for no unrelated regressions.
- Local manual check (step 6) against a real account's data.
- Egress reduction itself can't be verified from code — recommend the user watch Neon's
  usage-dashboard trend over the following days/weeks after this ships, once compute resumes.
