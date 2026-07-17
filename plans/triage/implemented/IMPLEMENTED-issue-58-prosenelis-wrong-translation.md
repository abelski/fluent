# Issue #58 — /dashboard/lists/210/study

**Reported:** 2026-04-19 11:11:16
**Status:** open
**Description:** prosenelis -прадед

## Root cause

Data entry error at the source. In `temp_files/Ne_denos_belietuviu_Kalba/03_Cia_mano_seima.md` line 18:

```
- prosenelis = внук = grandson
```

"Prosenelis" in Lithuanian means "great-grandfather" (прадед), not "grandson" (внук). The seed script `backend/seed_ne_dienos.py` faithfully ingested this wrong translation into the `word` table (word id = 6037, word_list 210 "Čia mano šeima").

## Fix plan

1. Run the following SQL against the Neon production database:
   ```sql
   UPDATE word
   SET translation_ru = 'прадед', translation_en = 'great-grandfather'
   WHERE id = 6037;
   ```
2. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru, translation_en FROM word WHERE id = 6037;
   ```
   Expected: `prosenelis | прадед | great-grandfather`
3. Fix the Markdown source to prevent re-introduction on future re-seeds.
   In `temp_files/Ne_denos_belietuviu_Kalba/03_Cia_mano_seima.md`, change line 18 from:
   ```
   - prosenelis = внук = grandson
   ```
   to:
   ```
   - prosenelis = прадед = great-grandfather
   ```

## Tests
1. Write a Playwright test in `frontend/tests/` that opens list 210 study page and confirms "prosenelis" shows translation "прадед".
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #58 — prosenelis shows wrong translation 'внук' instead of 'прадед'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 58;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
