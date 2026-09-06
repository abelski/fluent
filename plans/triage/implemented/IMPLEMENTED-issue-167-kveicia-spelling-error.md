---
kind: bugfix
status: done
iteration: 1
max_iterations: 8
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #167 — /dashboard/lists/178/study

**Reported:** 2026-09-06 07:58:16
**Status:** open
**Description:** Добрый день, "приглашает" - kviečia, а не kvEIčia, как у вас стоит. С уважением,

## Root cause

Pure data-layer typo, confirmed against production. `word` id=5660 (member of list 178
"Veiksmažodžiai", the list named in the report's URL) has `lithuanian='kveičia'` and
`accented='*kvei*čia'`. The correct 3rd-person present of "kviesti" (to invite) is "kviečia"
(stress on "kvie"), confirmed by sibling conjugation-family rows: `kviesti`→`accented='*kvie*sti'`
and `kvietė`→`accented='*kvie*tė'`.

No code path generates or duplicates this string — a repo-wide search found zero references to
"kveičia" outside this one `word` row; the `Word` model stores static text columns rendered as-is.

Reference check confirms the fix is safe and isolated:
- `word_list_item` has exactly one row for `word_id=5660` (id=8761, list 178, position 118) — no
  duplicate list membership to reconcile.
- `user_word_progress` has 4 rows referencing `word_id=5660` via FK only (status/review_count/SM-2
  fields, no duplicated spelling text) — correcting the parent row's text doesn't desync them.
- No existing correct "kviečia" row elsewhere in `word` to merge into instead — searched
  `lithuanian ILIKE '%kviečia%' OR ILIKE '%kveičia%'`, only id=5660 matched.

This matches an established repo pattern for this exact bug class (10+ prior
`IMPLEMENTED-issue-*-spelling-error.md` plans, e.g. #101 teta, #106 išsiskyrės), all resolved via a
single-row `UPDATE word` plus a Playwright regression test.

**Model/effort reason:** `haiku` / `low` — a single-row text correction with no downstream FK or
duplicate-row complications, following a well-worn repo fix pattern exactly.

## Fix plan
- [x] 1. Apply a guarded, idempotent SQL UPDATE (DB access: parse `DATABASE_URL` from
  `backend/.env`, run via `psycopg3` — there is no `psql` on this machine):
  ```sql
  UPDATE word
  SET lithuanian = 'kviečia',
      accented   = '*kvie*čia'
  WHERE id = 5660
    AND lithuanian = 'kveičia'
    AND accented = '*kvei*čia';
  ```
  **IMPLEMENTED:** 1 row affected. Database update committed successfully.

- [x] 2. Verify: `SELECT id, lithuanian, accented, translation_ru FROM word WHERE id = 5660;` →
  expect `lithuanian=kviečia`, `accented=*kvie*čia`, `translation_ru=приглашает` unchanged. No
  other rows/tables need changes — `word_list_item` (id=8761) and the 4 `user_word_progress` rows
  reference `word_id=5660` by FK only and automatically pick up the corrected spelling.

  (Alternative to raw SQL: the admin endpoint `PATCH /content/words/5660` via
  `/dashboard/admin` → Content → Vocabularies → list "Veiksmažodžiai" → edit "kveičia" inline.)
  
  **VERIFIED:** Confirmed lithuanian='kviečia', accented='*kvie*čia', translation_ru='приглашает' (unchanged).

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-167-kveicia-spelling-error.spec.ts` following
  the pattern of `IMPLEMENTED-issue-101-teta-spelling.spec.ts`: mock the study endpoint (or use
  real data for list 178 / word id 5660) and assert "kviečia" renders and "kveičia" does not.
  **COMPLETED:** Test file created following issue-123 pattern (fetches list 178, verifies correct spelling present and incorrect spelling absent).
- [x] Run it: `cd frontend && npx playwright test tests/issue-167-kveicia-spelling-error.spec.ts --reporter=list`
  **RESULT:** 2 passed (8.6s) — both tests passed: incorrect spelling "kveičia" not found, correct spelling "kviečia" confirmed for word id 5660.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #167 — the word 'kveičia' in list 178 (Veiksmažodžiai) was misspelled; corrected to 'kviečia'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 167;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-167-kveicia-spelling-error.md` → `plans/triage/implemented/IMPLEMENTED-issue-167-kveicia-spelling-error.md`).
