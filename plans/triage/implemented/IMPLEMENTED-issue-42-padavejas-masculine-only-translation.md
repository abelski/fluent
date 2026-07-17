# Issue #42 — /dashboard/review/

**Reported:** 2026-04-12 14:39:10
**Status:** open
**Description:** Padavejas - переведен как официант официантка А это только официант (padavėjas is only the masculine form but is translated as both "официант / официантка")

## Root cause

Pure data problem — no code changes needed. Word id=5478 (`padavėjas`, masculine-only form) has `translation_ru = 'официант, официантка'` but should be `'официант'`. The paired entries (ids 3491, 5014, 5015) that include the feminine form in the Lithuanian column correctly carry both translations.

## Fix plan

1. Verify the bad row:
   ```sql
   SELECT id, lithuanian, translation_ru FROM word WHERE id = 5478;
   ```

2. Apply the fix:
   ```sql
   UPDATE word
   SET translation_ru = 'официант'
   WHERE id = 5478
     AND lithuanian = 'padavėjas'
     AND translation_ru = 'официант, официантка';
   ```

3. Verify result:
   ```sql
   SELECT id, lithuanian, translation_ru
   FROM word
   WHERE lithuanian ILIKE '%padavėjas%'
   ORDER BY id;
   ```
   Expected: id=5478 shows `'официант'`; ids 3491, 5014, 5015 still show both forms.

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #42 — padavėjas incorrectly translated as 'официант, официантка' (masculine-only word). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 42;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
