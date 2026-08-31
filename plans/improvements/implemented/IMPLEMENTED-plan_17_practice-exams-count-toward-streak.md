---
kind: feature
status: done
iteration: 1
max_iterations: 12
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Plan #17 — Practice exams count toward the streak

## Context

The dashboard "streak" (`GET /api/me/stats` → `streak`, `GET /api/me/activity-calendar`) is meant
to count a day as active whenever the user did *any* learning activity. Today it unions distinct
dates from four tables in `backend/routers/words.py`:

```python
studied_dates = _distinct_dates(session, UserWordProgress.last_seen, ...)
studied_dates |= _distinct_dates(session, GrammarLessonResult.created_at, ...)
studied_dates |= _distinct_dates(session, UserPhraseProgress.last_seen, ...)
studied_dates |= _distinct_dates(session, UserCustomPhraseProgress.last_seen, ...)
```

**Practice exams** (`/dashboard/practice`) already write a `PracticeExamResult` row per completed
test (`created_at` field, `backend/routers/practice.py:396-399`, model at `backend/models.py:300-308`)
but that table was never added to either union in `words.py` (`get_stats` lines 1061-1074,
`get_activity_calendar` lines 1112-1131), so finishing a practice test silently does not count as
an active day. This is the exact same bug class as issue #141 (`UserCustomPhraseProgress` missing
from the same unions, fixed and regression-tested in `backend/tests/test_streak.py`) — a new
activity table was added elsewhere in the app without anyone updating this manually-maintained
union list.

**Spaced-repetition review** ("refresh knowledge", `/dashboard/review`) already counts correctly:
`/review/known`, `/review/known/upcoming`, `/review/known/random` and `/review/mistakes` all serve
words that get answered through the same `POST /words/{word_id}/progress` endpoint list-study uses
(`words.py:640-684`), which updates `UserWordProgress.last_seen` — already in the union. No fix
needed there, but it has no regression test pinning that it stays true, unlike the phrase-list fix.

**Articles** (`/dashboard/articles`) have no per-user progress tracking at all — the article
endpoints don't even require auth — so they cannot be added to the streak without designing new
tracking from scratch. Confirmed with the user this is explicitly out of scope for this plan;
recorded as a known gap in the CHANGELOG entry so it isn't silently forgotten.

**Model/effort:** mechanical, well-patterned change identical in shape to the already-shipped
issue #141 fix — `sonnet` / `medium` is sufficient, no architectural decisions involved.

## Goals

- Completing a practice exam (`POST /practice/tests/{id}/results`) counts that day toward the
  user's streak (`/me/stats`) and toward `/me/activity-calendar`.
- Regression test proving spaced-repetition review already counts toward the streak, so a future
  refactor of the review endpoints can't silently break it.
- The "what counts toward the streak" gap (articles) is written down, not just fixed and forgotten.

## Non-Goals

- Building article read-tracking (no DB table, no endpoint, no UI change for `/dashboard/articles`
  in this plan) — explicitly deferred per user decision.
- Any change to the daily free-tier session quota (`DailyStudySession` / `quota.py` /
  `DAILY_LIMIT`) — that is a separate mechanism from the streak and is out of scope.
- Any UI/frontend change — `/me/stats`'s response shape is unchanged (same keys, just a more
  complete `streak`/activity-calendar computation), so `StatsBar.tsx` needs no changes.

## Requirements

- Adding a practice exam result must extend the *current* streak (i.e. `today` becomes a counted
  date) the same way studying a word, passing a grammar lesson, or progressing a phrase already do.
- The 28-day activity calendar must include dates on which the user completed a practice exam.
- Must not double-count or alter behavior for the four existing sources.

### Standing constraints
- All validation must be server-side (never frontend-only). N/A here — this change is backend-only
  and purely additive to an existing server-side computation; no new user input is introduced.
- Design system: N/A — no markup/styling/component touched.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/routers/words.py` — in `get_stats()`, add a fifth union branch:
      `studied_dates |= _distinct_dates(session, PracticeExamResult.created_at, PracticeExamResult.user_id, user.id)`
      right after the existing `UserCustomPhraseProgress` branch (~line 1074). `PracticeExamResult`
      is already imported/used earlier in the same function (line 1046-1048).
- [x] 2. `backend/routers/words.py` — in `get_activity_calendar()`, add the matching
      `practice_dates = {d for d in _distinct_dates(session, PracticeExamResult.created_at, PracticeExamResult.user_id, user.id) if d >= window_start}`
      and fold it into `active_dates = sorted(word_dates | grammar_dates | phrase_dates | custom_phrase_dates | practice_dates)`
      (~lines 1112-1131). Import `PracticeExamResult` into this module's import list if not already
      in scope at that point (it's already used at line 1046, so no new import needed).
- [x] 3. `backend/routers/words.py` — update both endpoints' docstrings (lines ~1002-1011 and
      ~1100-1106) to mention practice exams alongside words/grammar/phrases, so the doc doesn't go
      stale the way it did for phrases before issue #141.
- [x] 4. `backend/tests/test_streak.py` — add `test_practice_exam_counts_toward_streak` and
      `test_practice_exam_appears_in_activity_calendar`, mirroring the existing
      `test_custom_phrase_progress_counts_toward_streak` / `..._appears_in_activity_calendar` pair:
      create a `PracticeCategory` + `PracticeTest` directly via a DB session (same helper pattern as
      this file's `_make_premium`), `POST /api/practice/tests/{id}/results` with a valid
      `{score, total}` body, then assert `/api/me/stats` streak is `>= 1` and today's date appears
      in `/api/me/activity-calendar`.
- [x] 5. `backend/tests/test_streak.py` — add `test_review_counts_toward_streak`: seed a
      `UserWordProgress` row with `status="known"` and no/past `next_review` so it's due, fetch it
      via `GET /api/review/known`, `POST /api/words/{word_id}/progress` with a review-shaped body
      (`{"status": "known", "quality": 5}`), then assert `/api/me/stats` streak is `>= 1`. This pins
      down that the review flow (not just list study) reaches the same progress endpoint the streak
      already reads from.
- [x] 6. `documentation/CHANGELOG.md` — append entry `#17`: practice exams now count toward the
      streak/activity-calendar (same bug class as issue #141's phrase-list gap); note that article
      reads still do not count and remain a known, deliberately deferred gap; reference this plan
      file.

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest tests/test_streak.py -v`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Smoke: log in locally, complete one practice test on `/dashboard/practice`, then check the
      dashboard stats bar / streak reflects today as active (or re-fetch `/api/me/stats` and
      confirm `streak >= 1`)
- [ ] Smoke: complete one spaced-repetition review session on `/dashboard/review`, confirm streak
      still reflects today as active (regression, should already pass)
- [x] Edge case: existing word/grammar/phrase streak tests in `test_streak.py` and
      `test_stats_query_efficiency.py` still pass unchanged (no regression to the four existing
      sources) — covered by the full-suite run above (366 passed, includes both files)
- [x] Auth gate: unauthenticated `GET /api/me/stats` and `GET /api/me/activity-calendar` still
      return 401 (unchanged, no new auth surface introduced) — verified directly via TestClient,
      both return 401

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
```
</content>
