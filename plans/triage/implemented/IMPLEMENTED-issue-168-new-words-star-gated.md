---
kind: bugfix
status: done
iteration: 1
max_iterations: 20
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #168 — /dashboard/lists/

**Reported:** 2026-09-06 12:52:25
**Status:** open
**Description:** Что-то не так с "настройками". мне при изучении новых слов (100% новые слова в настройках)новые слова в выбранном разделе не показываются. Вместо этого показываются слова, которые я уже выучил и те, в которых делал ошибки. 0% новых слов в сессии

## Root cause

Confirmed with production data for the reporting user (`user_id='13a14ec2-ec25-4717-9e69-d3b5d28edde7'`).
The setting itself is saved and read correctly: `user.words_per_session = 50`,
`user.new_words_ratio = 1.0`, via `/api/me/settings` (`backend/routers/words.py:577-630`) and the
frontend slider (`frontend/app/dashboard/settings/page.tsx:203-217`). This rules out "wrong
key"/"slider not wired" theories. The user's overall word bank also has plenty of unstudied words
(3424 active words across 101 lists) — not global pool exhaustion either.

The real interaction bug is in `get_study_words()` (`backend/routers/words.py`, the
`/lists/{list_id}/study` endpoint used by `frontend/app/dashboard/lists/[id]/study/page.tsx:34`):

- Line 426: `all_words = [w for w in all_words if w["star"] <= star_level]` — the ★-complexity
  filter runs **before** the words are split into new/learning/known pools and before the
  `new_words_ratio` math (lines 475-488).
- Line 455: `if not new_words and not learning_words and not include_known: return {"words": [],
  ..., "all_known": True}` — the "level complete" guard only fires when **both** pools are empty
  at the current star_level.

For the user's list #183 ("Teisė ir konstitucija", part of the `konstitucija` program they enrolled
in 4 days before filing): at `star_level=1` (the default — set via a cookie in
`frontend/lib/starLevel.ts`, never bumped automatically), `new_words = []` but `learning_words =
[1 word]`, so the `all_known` guard does not fire. Execution falls through to the ratio logic: with
`new_count = round(50*1.0) = 50`, `actual_new = min(0, 50) = 0`, the entire session becomes review
words — 0% new — even though the list genuinely has 9 unlearned new words, just gated behind ★★,
which the ratio algorithm never sees because the star filter runs upstream of it. Nothing in the
response tells the frontend that higher-level content exists; the session is silently served as if
"no new words" were a fact about the list.

This is a real, data-confirmed interaction bug between two independently-correct features (★
complexity gating and new/review ratio selection) — not a typo, and the review-fallback behavior
itself is defensible (no new words truly available at the user's *current* level). The bug is the
missing signal, not the fallback. Do not change the core ratio/gap-fill algorithm (lines 475-488).

**Model/effort reason:** `sonnet` / `medium` — root cause is precisely diagnosed with production
data (not a guess) and the fix is additive (new response flag + frontend banner + i18n + tests)
rather than a rewrite, but it spans backend + frontend + i18n + two test suites and touches the
most heavily-used session endpoint.

## Fix plan
- [x] 1. In `backend/routers/words.py`, `get_study_words()`: before the star_level filter at line
  426, keep an unfiltered word list (or a cheap count) to detect "new" words with
  `star > star_level` that got excluded.
- [x] 2. After computing `new_words` (post-filter, ~line 448): if `len(new_words) == 0` and the
  unfiltered set contains new words with `star > star_level`, set a response flag
  `more_new_at_higher_level: true` plus `new_words_at_higher_level: <count>`.
- [x] 3. Include this flag in **both** return paths: the existing `all_known` early return (~line
  456) and the normal `session_words` response (~line 534) — today only the `all_known` path gives
  the frontend any "advance level" signal; the fallback-to-review path (this bug's actual trigger)
  gives none.
- [x] 4. In `frontend/app/dashboard/lists/[id]/study/page.tsx`, in the `.then((data) => ...)`
  handler (~lines 42-55): read the new flag and, when true, show a banner above the quiz — "No new
  words at ★{level} in this list — {N} new words unlock at ★{level+1}" — with a button that calls
  `setStarLevel(nextLevel)` (from `frontend/lib/starLevel.ts`) and reloads via `loadWords()`.
- [x] 5. Reuse the existing "Advance to next level" CTA copy from the `allKnown` block (~lines
  111-145 of the same file) for the new banner so the UX is consistent.
- [x] 6. Add the new banner strings to `frontend/lib/i18n/ru.ts` and `en.ts` (under `tr.study`).
- [x] 7. Extend `backend/tests/test_review_flow.py` (or a new test file): seed a list where
  star=1 words are all known/learning and star=2 has new words; call `GET
  /lists/{id}/study?star_level=1` with `new_words_ratio=1.0`; assert `more_new_at_higher_level:
  true` with the correct count, and that session composition is unchanged (still review words) —
  no regression to existing selection behavior.
- [x] 8. Do **not** modify the word-selection/ratio algorithm itself (lines 475-488) — confirm in
  the PR/commit description that this is additive only. Confirmed via `git diff -- backend/routers/words.py`:
  the ratio/gap-fill block (now ~lines 526-539: `total = user.words_per_session ...` through
  `session_words = new_words[:actual_new] + review_words[:actual_review]`) has zero diff lines —
  all changes are new code inserted before/around it (the unfiltered-list capture, the
  higher-level-new-words check, and the two additive response keys).

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-168-new-words-star-gated.spec.ts` mocking
  the `/study` response with `more_new_at_higher_level: true`, asserting the banner renders and the
  level-bump button calls `setStarLevel`/reloads (mirror the pattern in
  `plans/triage/implemented/IMPLEMENTED-issue-105-list-locked-after-mistakes.md`, a closely related
  star-level/`all_known` fix).
- [x] Run it: `cd frontend && npx playwright test tests/issue-168-new-words-star-gated.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #168 — with '100% new words' selected, sessions silently fell back to already-known/review words because new words existed only behind a higher ★ complexity level than the user was on; added a banner that surfaces this and offers to advance the level. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 168;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-168-new-words-star-gated.md` → `plans/triage/implemented/IMPLEMENTED-issue-168-new-words-star-gated.md`).
