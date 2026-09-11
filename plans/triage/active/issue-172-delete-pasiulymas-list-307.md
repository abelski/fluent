---
kind: bugfix
status: done
iteration: 1
max_iterations: 12
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #172 — /dashboard/lists/my/307/edit

**Reported:** 2026-09-10 14:30:25
**Status:** open
**Description:** пробую удалить pasiūlymas\n\nПредложение - не выходит

## Root cause

> **CORRECTION (2026-09-11, found by the user testing locally).** The conclusion below —
> "fully covered by #171, no distinct code fix needed" — is **wrong**. #172 is a real,
> separate, server-side bug. Deleting the word still fails; #171's fix merely made the
> failure *visible* ("Request failed" in red) instead of silent, which is why the two look
> alike from the UI.
>
> The server returns 500 on every delete, from a genuine `ForeignKeyViolation`:
>
> ```
> update or delete on table "word" violates foreign key constraint
> "word_list_item_word_id_fkey" on table "word_list_item"
> DETAIL:  Key (id)=(7721) is still referenced from table "word_list_item".
> ```
>
> `delete_my_word` (`backend/routers/word_lists.py`) calls `session.delete(item)` then
> `session.delete(word)` — correct on the page, but **the order you write is not the order
> SQLAlchemy emits**. It sorts deletes by dependency edges taken from ORM `relationship()`
> declarations, and `models.py` declares none, so it emitted `DELETE FROM word` first.
> Fixed with a `session.flush()` between the two.
>
> **Why the analysis below reached the wrong answer:** it verified the data (correctly — the
> row counts it reports are all accurate) and read the frontend, then *assumed* the backend
> "would cleanly return 200 under the current code" without executing it. The backend test
> suite agreed, because it runs on SQLite, which does not enforce foreign keys unless asked.
> Green tests plus a plausible story is not proof; the endpoint was never actually called.
> Write-up: `documentation/testing-foreign-keys.md`.
>
> The two "theoretical latent bugs" dismissed at the bottom of this section were also
> re-checked against production data: no personal-list word is shared (0 of 637), so that
> part still holds and no guard was added for it.

Original (incorrect) analysis, kept for the record:

Fully covered by #171's fix (`7f2fc21`, 2026-09-10 17:10:23) — no distinct code fix needed. This
report is the same page (`.../my/[id]/edit`), same user-facing symptom ("delete doesn't work"),
filed 2h18m *before* the #171 fix shipped. `handleDelete` in
`frontend/app/dashboard/lists/my/[id]/edit/page.tsx` at report time still swallowed
`deleteMyWord()` failures into `console.error` with no UI feedback (the exact #171 bug); the
current code (verified by reading `handleDelete`/`handleActionError`, lines 128-158) already
surfaces every failure via `data-testid="action-error"` or redirects to `/login` on auth failure.

Deeper investigation (production DB, read-only) ruled out every distinct-to-this-word/list/user
alternative explicitly checked:
- `word.id=7723` ("pasiūlymas") has exactly **one** `word_list_item` row (id 11953, list 307,
  `is_public=False`, not archived) and exactly **one** `user_word_progress` row — no duplicate
  rows that could make the frontend's `d.words.filter(w => w.id !== wordId)` remove the wrong
  entry, and no other list/user reference that could cause an FK conflict on delete.
- The reporting user (`07958f81-...`) is `is_admin=True`, `is_premium=True`, active until
  2026-09-29 — `_require_list_creator`'s 403 "Premium only" gate is not triggered.
- `backend/routers/word_lists.py`'s `delete_my_word`/`_get_owned_word` are unchanged since #171
  and, given this word's single-reference state, would cleanly return 200 under the current code.
- Word 7723 is still present in list 307 as of today (2026-09-11) — no successful delete has
  happened since the fix shipped, consistent with "never retried" rather than "still broken,"
  since nothing in the current code/data explains a failure.
- (FYI, not actionable) `delete_my_word` has two theoretical latent bugs — unconditional
  `session.delete(word)` despite `Word` being documented as shared across lists, and a
  `UserWordProgress` delete filtered only by `word_id` — but `add_my_word`/`bulk_add_my_words`
  always create a fresh `Word` row per personal word, so no personal-list word is ever actually
  shared. Unreachable under current app flows; skipped per YAGNI.

Suggested model/effort: sonnet/low — this is a verification pass (DB/code read) plus one small
regression test, no production code changes.

## Fix plan
- [x] 1. No production code change — confirm (already done above) that #171's fix in
  `frontend/app/dashboard/lists/my/[id]/edit/page.tsx` covers this exact failure mode.
- [x] 2. Add a regression Playwright test reproducing this specific report's word/list naming
  ("pasiūlymas" / "Предложение", list titled "From internet") to lock in that the fix holds for
  this exact scenario, following the `mockListsPage`/`setFakeToken` pattern from
  `frontend/tests/issue-171-delete-word-my-list-fails-silently.spec.ts`.
- [ ] 3. Ask the reporting user (or do it yourself, since it's your own admin account) to retry
  deleting word 7723 from list 307 in production now that the fix is live, to close the loop on
  the stale row — do not delete it programmatically as part of this plan's automated pass.

Added after the user tested locally and the delete still failed (see the correction note at the
top). These are the actual fix:

- [x] 4. Add `session.flush()` between the dependent deletes and `session.delete(word)` in
  `delete_my_word` (`backend/routers/word_lists.py`), so `word_list_item` and
  `user_word_progress` are gone before Postgres checks `word_list_item_word_id_fkey`.
  Verified against real Postgres in a rolled-back transaction: the emitted order is now
  `user_word_progress` → `word_list_item` → `word`, and the delete succeeds for both word
  7721 and 7723.
- [x] 5. Make this class of bug testable at all: add an `enforce_foreign_keys()` context
  manager to `backend/conftest.py` that switches on `PRAGMA foreign_keys=ON` for one test.
  Enforcement is deliberately not global — ~27 existing tests build fixtures with dangling
  references and fail immediately under it (that cleanup is its own task, noted below).
- [x] 6. Document the whole trap in `documentation/testing-foreign-keys.md`: production
  Postgres enforces FKs, test SQLite doesn't, and `models.py` has zero `relationship()`
  declarations so SQLAlchemy never knows the delete order for *any* pair of tables here.

Follow-up worth doing separately (not required to close this ticket): turn FK enforcement on
globally in `conftest.py` and fix the ~27 fixtures that then fail. Until then, latent FK bugs
elsewhere in the app remain invisible to the suite.

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-172-delete-pasiulymas-list-307.spec.ts` — a
  regression test confirming the #171 fix also covers this specific word/list scenario (word
  "pasiūlymas" / "Предложение" in a personal list; delete succeeds and the row disappears from the
  UI with the current fixed `handleDelete`).
- [x] Run it: `cd frontend && npx playwright test tests/issue-172-delete-pasiulymas-list-307.spec.ts --reporter=list`
- [x] Add the test that actually catches this bug — the Playwright one above mocks the API, so
  it can never see a server-side FK violation. `test_delete_word_does_not_violate_foreign_keys`
  in `backend/tests/test_word_lists.py` calls the real endpoint with foreign keys enforced.
  Confirmed to fail without the `flush()` and pass with it.
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_word_lists.py -v`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #172 — пробую удалить pasiūlymas / Предложение - не выходит. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 172;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
