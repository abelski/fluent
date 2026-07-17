# Issue #136 — /dashboard/lists/210

**Reported:** 2026-07-02 12:42:27
**Status:** open
**Description:** pusbrolė не двоюродная сестра.  Pusseserė правильно

## Root cause
Word id 6040 (`pusbrolė`) is used in list 210 ("Čia mano šeima") as "cousin (female)" / "двоюродная сестра", but `pusbrolė` is not standard/correct Lithuanian — it's an incorrectly derived feminine of `pusbrolis` (male cousin, id 3277). The real Lithuanian word for "female cousin" is `pusseserė` (id 4017), which already exists correctly in the DB (`translation_en='cousin (female)'`, `translation_ru='двоюродная сестра'`, `hint='daiktavardis'`) but is used in 5 other lists — not list 210.

This is the same category of error as the prior fix `plans/triage/implemented/IMPLEMENTED-issue-100-pusbrodis-duplicate-in-list.md` (a bad variant `pusbrodis` for "male cousin").

Word id 6040 appears in exactly one `word_list_item` row (list 210, position 18) — safe to archive. 3 users have `user_word_progress` on 6040 (all `status='known'`); all 3 already have an equivalent `known` progress row on 4017, so no learning history is lost by removing 6040 from the list.

## Fix plan
1. Archive the incorrect word (soft-delete, preserves FK integrity for existing progress rows):
   ```sql
   UPDATE word SET archived = true WHERE id = 6040;
   ```
2. Remove it from list 210's join table:
   ```sql
   DELETE FROM word_list_item WHERE word_id = 6040 AND word_list_id = 210;
   ```
3. Insert `pusseserė` (id 4017) into list 210 at the same position, preserving the male/female cousin pairing with `pusbrolis` (id 3277):
   ```sql
   INSERT INTO word_list_item (word_list_id, word_id, position) VALUES (210, 4017, 18);
   ```
4. Verify:
   ```sql
   SELECT * FROM word_list_item WHERE word_list_id = 210 AND word_id IN (3277, 4017, 6040);
   -- Expect: 3277 and 4017 present, 6040 absent
   SELECT archived FROM word WHERE id = 6040; -- Expect: true
   ```
5. No frontend/backend code changes or rebuild needed — `_list_words()` in `backend/routers/words.py` is fully data-driven off `word_list_item` + `Word.archived`.
6. Leave the 3 orphaned `user_word_progress` rows on word_id=6040 untouched — harmless since the word is archived.

## Tests
1. Write a Playwright test in `frontend/tests/` (pattern-match the issue-100 test) asserting list 210 contains `pusseserė` and does not contain `pusbrolė`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #136 — pusbrolė не двоюродная сестра.  Pusseserė правильно. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 136;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-136-pusbrole-wrong-word-for-cousin.md` → `plans/triage/implemented/IMPLEMENTED-issue-136-pusbrole-wrong-word-for-cousin.md`).
