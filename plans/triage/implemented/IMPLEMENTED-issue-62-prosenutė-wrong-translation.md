# Issue #62 — /dashboard/review/

**Reported:** 2026-05-07 16:18:23
**Status:** open
**Description:** prosenutė - прабабушка, а не внучка

## Root cause

The `word` table row for `prosenutė` (id=6036) was seeded with the wrong translations. The source was `temp_files/Ne_denos_belietuviu_Kalba/03_Cia_mano_seima.md` (now deleted), which had a data entry error: `prosenutė` was written with the same Russian/English gloss as `anūkė` (внучка / granddaughter), when it should say прабабушка / great-grandmother.

This is the same class of bug as Issue #58 (`prosenelis` seeded as внук instead of прадед). Both words come from the same family-vocabulary lesson and involve the Lithuanian "pro-" prefix (meaning "great-") being confused with its base form. No code changes are needed — this is a pure data correction.

Current wrong state:
- id=6036: lithuanian="prosenutė", translation_ru="внучка", translation_en="granddaughter"
- id=4016: lithuanian="anūkė", translation_ru="внучка", translation_en="granddaughter" ← correct

Both `translation_ru` and `translation_en` for id=6036 need fixing.

## Fix plan

1. Run the SQL correction against the production Neon DB:
```sql
UPDATE word
SET translation_ru = 'прабабушка',
    translation_en = 'great-grandmother'
WHERE id = 6036;

-- Verify
SELECT id, lithuanian, translation_ru, translation_en
FROM word
WHERE id IN (6036, 4016);
```

2. Audit related "pro-" words for similar errors:
```sql
SELECT id, lithuanian, translation_ru, translation_en
FROM word
WHERE lithuanian LIKE 'pro%' AND archived = false
ORDER BY lithuanian;
```
(`prosenelis` id=6037 was already fixed in Issue #58.)

3. No `user_word_progress` changes needed — progress rows track study state by `word_id` only; the review page reads translations live from `word` table via `_word_to_dict()`.

## Tests
1. Write a Playwright test in `frontend/tests/issue-62-prosenutė-translation.spec.ts` (use `frontend/tests/issue-58-prosenelis-translation.spec.ts` as template) that verifies the word `prosenutė` is shown with translation "прабабушка" and not "внучка" in the review/study flow.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #62 — prosenutė has wrong translation 'внучка' (granddaughter) instead of 'прабабушка' (great-grandmother). Fix is a SQL UPDATE on word id=6036. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 62;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-62-prosenutė-wrong-translation.md` → `plans/triage/implemented/IMPLEMENTED-issue-62-prosenutė-wrong-translation.md`).
