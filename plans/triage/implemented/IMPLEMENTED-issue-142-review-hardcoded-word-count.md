# Issue #142 — /dashboard/lists/

**Reported:** 2026-07-16 14:35:14
**Status:** open
**Description:** я сконфигурировал 10 слов в занятии но когда делаю повтор мне дает только 5 слов
(Translation: "I configured 10 words per session, but when I do a review it only gives me 5 words")

## Root cause

The "Повторение" (Review) flow (`frontend/app/dashboard/review/page.tsx`) calls
one of four backend endpoints depending on mode, all in
`backend/routers/words.py` (lines 570-723):
- `GET /api/review/known`
- `GET /api/review/known/upcoming`
- `GET /api/review/known/random`
- `GET /api/review/mistakes`

All four hardcode their batch size to a legacy constant instead of the user's
`words_per_session` setting:

```python
# words.py:262
QUIZ_SIZE = 10           # legacy constant kept for review endpoints
```

used at `.limit(QUIZ_SIZE)` in `get_review_known` (~593),
`get_review_known_upcoming` (~633), `get_review_known_random` (~670), and
`get_review_mistakes` (~707).

This diverges from the correct pattern already used by the main study-session
endpoint (`GET /lists/{list_id}/study`, `words.py:348`):

```python
total = user.words_per_session if user.words_per_session is not None else DEFAULT_SESSION_SIZE
```

The `QUIZ_SIZE` comment itself ("legacy constant kept for review endpoints")
confirms this was simply never migrated when `words_per_session` became a
per-user setting — an inconsistency, not an intentional design choice. The
settings save/read path (`words.py:447-494`, `GET/PATCH /me/settings`) is
confirmed correct — `words_per_session` is validated and persisted properly, so
that's not where the bug is.

**Nuance on the specific number "5":** no literal hardcoded `5` was found
anywhere in the backend or frontend review code. `QUIZ_SIZE` is `10`, matching
`DEFAULT_SESSION_SIZE`, so it currently coincides with this user's configured
value. The review endpoints only return words matching `status == "known"` (or
`mistake_count > 0`) AND due today, `.limit(QUIZ_SIZE)`. The most likely
explanation for seeing exactly 5 is that only 5 of the user's words currently
qualify as "known and due" (SM-2 scheduling staggers due dates) — this should be
verified against production data before/after the fix ships, but does not
change the fix itself: the endpoints must respect `words_per_session` regardless
of how many words happen to be due on a given day.

## Fix plan

1. `backend/routers/words.py` — in each of the four review endpoints
   (`get_review_known` ~582, `get_review_known_upcoming` ~622,
   `get_review_known_random` ~661, `get_review_mistakes` ~698), right after
   `user = _require_user(...)`, add:
   ```python
   limit_size = user.words_per_session if user.words_per_session is not None else DEFAULT_SESSION_SIZE
   ```
2. Replace `.limit(QUIZ_SIZE)` with `.limit(limit_size)` at lines 593, 633, 670, 707.
3. Delete the now-unused `QUIZ_SIZE = 10` constant (line 262) and its comment —
   reuse `DEFAULT_SESSION_SIZE` (already defined at line 263) everywhere so
   study and review share one source of truth.
4. Update the docstrings that currently say "Return up to 10 known words..."
   (lines 575, 617, 657, 694) to say "up to the user's configured session size
   (words_per_session)".
5. No frontend change required — `frontend/app/dashboard/review/page.tsx`
   already just renders whatever array the backend returns.
6. Verify in production (once the fix ships) how many words are actually
   "known & due" / "mistaken" for the reporting user, to confirm whether their
   specific "5" was a data/SRS-scheduling artifact now fully resolved, or if
   something else is still off.

## Tests
1. Extend `backend/tests/test_review.py`: set a user's `words_per_session` to a non-default value (e.g. 3 or 15), seed that many eligible known/mistake words, and assert the review endpoint returns up to that count instead of the old fixed 10 — guards against regressing to a hardcoded value.
2. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix end-to-end (configure words_per_session, seed due words, confirm review session size matches).
3. Rebuild the frontend and restart the local server.
4. Run the new tests and confirm they pass.
5. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #142 — я сконфигурировал 10 слов в занятии но когда делаю повтор мне дает только 5 слов. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 142;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-142-review-hardcoded-word-count.md` → `plans/triage/implemented/IMPLEMENTED-issue-142-review-hardcoded-word-count.md`).
