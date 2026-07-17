# Issue #123 — /dashboard/review/

**Reported:** 2026-06-09 23:00:00
**Status:** open
**Description:** В слове išsiskyrės ошибка в написании, верно будет išsiskyręs

## Root cause

Word id 4486 has an incorrect Lithuanian spelling `išsiskyrės` — the final letter `ė` should be `ę`, giving `išsiskyręs`. This is a data error. Multiple correct versions of the word exist in the database (ids 4490, 5492, 3282), with id 3282 being canonical (correct spelling + correct accented markup: `išsi*skyr*ęs`).

The `accented` field for id 4486 (`išsi*sky*rės`) also uses the wrong word form as its base.

## Fix plan

1. Audit references to all four word rows to decide how to handle duplicates:
   ```sql
   -- Check user_word_progress references
   SELECT word_id, COUNT(*) AS progress_rows
   FROM user_word_progress
   WHERE word_id IN (4486, 4490, 5492, 3282)
   GROUP BY word_id;

   -- Check word_list_item references
   SELECT wli.word_id, wl.title, wl.id AS list_id, COUNT(*) AS items
   FROM word_list_item wli
   JOIN word_list wl ON wl.id = wli.word_list_id
   WHERE wli.word_id IN (4486, 4490, 5492, 3282)
   GROUP BY wli.word_id, wl.title, wl.id
   ORDER BY wli.word_id;
   ```

2. Fix id 4486 (mandatory — safe regardless of references):
   ```sql
   UPDATE word
   SET lithuanian = 'išsiskyręs',
       accented   = 'išsi*skyr*ęs'
   WHERE id = 4486;
   ```

3. Handle duplicate rows (ids 4490, 5492) based on audit results:
   - **No progress + no list items** → DELETE
   - **Has progress, no list items** → `UPDATE word SET archived = true WHERE id = <id>`
   - **Has list items** → reassign list items to id 3282, then archive the duplicate

4. Verify:
   ```sql
   SELECT id, lithuanian, accented FROM word WHERE id = 4486;
   -- Expected: lithuanian = 'išsiskyręs', accented = 'išsi*skyr*ęs'

   SELECT id, lithuanian, accented FROM word
   WHERE lithuanian = 'išsiskyrės' AND archived = false;
   -- Expected: 0 rows
   ```

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #123 — Spelling error: išsiskyrės should be išsiskyręs. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 123;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-123-issiskyrys-spelling-fix.md` → `plans/triage/implemented/IMPLEMENTED-issue-123-issiskyrys-spelling-fix.md`).
