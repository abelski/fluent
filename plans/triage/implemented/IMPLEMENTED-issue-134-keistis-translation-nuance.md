# Issue #134 — /dashboard/lists/294/study

**Reported:** 2026-06-29 18:16:54
**Status:** open
**Description:** keistis - это наверное скорее обмен.

## Root cause
Word id 7331 (`keistis`, in list 294 "Основные глаголы") has `translation_ru = 'меняться, обмениваться'`, which leads with the "to change (oneself)" sense. The user feels the primary sense should be "обмениваться" (to exchange/swap), since `keistis` in this vocabulary set is meant as the reciprocal "exchange" verb. Comparison with other reflexive `-tis` pairs in the DB (e.g. `skirti`/`skirtis`) shows reflexive forms are expected to carry a genuinely adjusted meaning, not just a reordering — supporting a real (if nuanced) translation fix rather than dismissing this as noise.

There is no seed file or reseed script involved — `keisti`/`keistis` are plain `word` table rows (ids 7330/7331), not linked to the `verb` textbook table, so the `word` row is the sole source of truth and a DB fix is durable.

## Fix plan
1. Confirm current row: `SELECT id, lithuanian, translation_en, translation_ru, hint FROM word WHERE id = 7331;`
2. Apply the correction (via direct SQL, or through `/dashboard/admin` → open list "Основные глаголы" → edit `keistis` → Save):
   ```sql
   UPDATE word
   SET translation_ru = 'обмениваться, меняться (местами)',
       translation_en = 'to exchange, to swap'
   WHERE id = 7331;
   ```
3. Leave word id 7330 (`keisti`) and `hint='глагол'` untouched — the report is specifically about `keistis`.
4. No code changes, no migration, no reseed/deploy needed — this is a data-only fix against the production DB.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (load `/dashboard/lists/294/study`, find the `keistis` card, assert the Russian translation now leads with "обмениваться").
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #134 — keistis - это наверное скорее обмен.. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 134;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-134-keistis-translation-nuance.md` → `plans/triage/implemented/IMPLEMENTED-issue-134-keistis-translation-nuance.md`).
