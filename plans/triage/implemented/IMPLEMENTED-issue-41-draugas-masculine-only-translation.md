# Issue #41 — /dashboard/review/

**Reported:** 2026-04-12 07:38:08
**Status:** open
**Description:** Daugas - переведен как друг подруга но это не правильно это только мужской род (draugas is translated as "друг, подруга" but it's only masculine)

## Root cause

Pure data problem — no code changes needed. Word id=3147 (`draugas`, masculine-only form) has `translation_ru = 'друг, подруга'` but should be `'друг'`. The pairs `draugas, -ė` (ids 4483, 4487) correctly carry both translations. Only the plain masculine entry is wrong.

## Fix plan

1. Verify the bad row:
   ```sql
   SELECT id, lithuanian, translation_ru FROM word WHERE id = 3147;
   ```

2. Run broader audit to find similar mistakes (plain masculine form with paired translation):
   ```sql
   SELECT id, lithuanian, translation_ru
   FROM word
   WHERE archived = false
     AND lithuanian NOT LIKE '%, -%'
     AND translation_ru LIKE '%,%'
   ORDER BY lithuanian;
   ```

3. Apply the fix:
   ```sql
   UPDATE word
   SET translation_ru = 'друг'
   WHERE id = 3147
     AND lithuanian = 'draugas'
     AND translation_ru = 'друг, подруга';
   ```

4. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru FROM word WHERE lithuanian ILIKE '%draugas%' ORDER BY id;
   ```
   Expected: id=3147 shows `'друг'`; ids 4483, 4487 (`draugas, -ė`) still show `'друг, подруга'`.

5. Fix any other rows found in step 2 (one UPDATE per row, manually reviewed).

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #41 — draugas incorrectly translated as 'друг, подруга' (masculine-only word). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 41;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
