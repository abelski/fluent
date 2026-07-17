# Issue #74 — /dashboard/phrases/12/study

**Reported:** 2026-05-14 19:58:56
**Status:** open
**Description:** Reikia važiuoti antru (2) autobusu. - из всех фраз нужно удалить числа в скобках которые дублируют число текстом

## Root cause
Parenthetical numbers like `(2)`, `(19)`, `(30)` are stored verbatim in `phrase.text` and `phrase.translation` for program_id=12. They were copied from the source document `temp_files/numbers_sekmes2.md` when the phrases were seeded. The backend returns raw DB values and the frontend renders them without stripping. 7 rows confirmed affected, only in program_id=12.

## Fix plan
1. Run audit query to confirm scope:
   ```sql
   SELECT id, text, translation FROM phrase
   WHERE program_id = 12 AND (text ~ '\([0-9]+\)' OR translation ~ '\([0-9]+\)');
   ```
2. Apply DB UPDATE to strip parenthetical digit groups:
   ```sql
   UPDATE phrase
   SET
     text        = regexp_replace(text,        ' \([0-9]+\)', '', 'g'),
     translation = regexp_replace(translation, ' \([0-9]+\)', '', 'g')
   WHERE program_id = 12
     AND (text ~ '\([0-9]+\)' OR translation ~ '\([0-9]+\)');
   ```
3. Verify: re-run audit query — should return 0 rows.
4. Update source file `temp_files/numbers_sekmes2.md` to remove parenthetical digits from examples so the source stays consistent.
5. No frontend or backend code changes needed — data fix propagates to all surfaces (study, phrase list, vocabulary, MatchRound, `_pick_blank_word`).

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #74 — Remove duplicate numbers in parentheses from phrase program 12. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 74;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
