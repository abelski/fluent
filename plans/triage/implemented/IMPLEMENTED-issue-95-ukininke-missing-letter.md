# Issue #95 — /dashboard/lists/209/study

**Reported:** 2026-05-26 12:34:02
**Status:** open
**Description:** в литовской версии слова фермерша пропустили последнюю букву

## Root cause

Pure data bug in `word` table, list 209 ("Kaip sekasi?"):
- **id 6009**: `lithuanian = 'ūkinink'` (missing final `ė`), `accented = '*ūki*ninke'` (missing final `ė`, and stress marker placement inconsistent with its masculine pair).

Correct: `ūkininkė` / `*ūk*ininkė`. The masculine sibling (id 6008) is stored as `*ūk*ininkas` — stress on `ūk` — so the feminine accented form should mirror that (`*ūk*ininkė`), matching the established convention in other paired rows (`*dai*lininkas`/`*dai*lininke`, `*gyd*ytojas`/`*gyd*ytoja`).

No seed file or fixture in the repo contains these strings (grep verified). List 209's source markdown is not in the working tree. Reads are uncached via `backend/routers/words.py`, so the fix is live immediately on COMMIT.

## Fix plan

1. **Verify current state** via the `sql` skill:
   ```sql
   SELECT id, lithuanian, accented, translation_ru, translation_en
   FROM word
   WHERE id = 6009;
   ```
2. **Apply UPDATE** with idempotency guard:
   ```sql
   BEGIN;
   UPDATE word
   SET lithuanian = 'ūkininkė',
       accented   = '*ūk*ininkė'
   WHERE id = 6009
     AND lithuanian = 'ūkinink'
     AND accented   = '*ūki*ninke';
   COMMIT;
   ```
   Expected: `UPDATE 1`.
3. **Re-verify** with the SELECT from step 1.

Out-of-scope sister cases (note to user, do **not** include in this fix): rows 5998, 5999, 6001, 6003, 6005, 6007 in list 209 use `e` where they likely should use `ė` in `accented` (and 6003 also in `lithuanian`). User-reported scope is id 6009 only.

## Tests

1. Write a Playwright test in `frontend/tests/issue-95-ukininke-missing-letter.spec.ts` that loads `/dashboard/lists/209/study` (or hits the list-209 words API) and asserts the Lithuanian word for "фермерша" is `ūkininkė` (ends in `ė`).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify in the browser.

## Confirm resolution

Ask the user: "Issue #95 — `ūkininkė` was missing the final letter. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 95;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-95-ukininke-missing-letter.md`.
