# Issue #75 (+ #78, #79, #80, #81, #82, #84, #85) — /dashboard/lists/166/study

**Reported:** 2026-05-15 05:04:30 (first report; related reports through 2026-05-19)
**Status:** open
**Description:** Что-то с временами не то в этом разделе. Conjugated verb forms (present and past tense) in list 166 "Ligos ir simptomai" have the same `translation_ru` as their infinitive, ignoring tense.

Related issues filed for specific words:
- #78: Vemti vemia — перевод не учитывает время
- #79: viduriavo — перевод не учитывает время
- #80: Vėmė — перевод не учитывает время
- #81: Peršalo
- #82: Sirgo — перевод не учитывает время
- #84: Viduriuoja — перевод не учитывает время
- #85: skaudėjo — перевод не учитывает время

## Root cause
When list 166 was seeded, conjugated forms were given the same `translation_ru` as their infinitive parent. For example:
- `peršalti`, `peršąla`, `peršalo` all → "простудиться"
- `sirgti`, `serga`, `sirgo` all → "болеть"

The quiz renders `translation_ru` directly with no tense-awareness. This also causes `pickDistractors()` to filter out conjugated twins from the MCQ pool, weakening the quiz options. Only `karščiuoja/karščiavo` and `kosėja/kosėjo` already have correct tense-specific translations.

## Fix plan
1. Run the following SQL UPDATEs against the production Neon DB:
   ```sql
   UPDATE word SET translation_ru = 'простужается' WHERE id = 5429;       -- peršąla
   UPDATE word SET translation_ru = 'простудился/простудилась' WHERE id = 5430; -- peršalo
   UPDATE word SET translation_ru = 'болеет' WHERE id = 5432;             -- serga
   UPDATE word SET translation_ru = 'болел/болела' WHERE id = 5433;       -- sirgo
   UPDATE word SET translation_ru = 'болит' WHERE id = 5435;              -- skauda
   UPDATE word SET translation_ru = 'болело' WHERE id = 5436;             -- skaudėjo
   UPDATE word SET translation_ru = 'рвёт' WHERE id = 5438;               -- vemia
   UPDATE word SET translation_ru = 'вырвало/тошнило' WHERE id = 5439;    -- vėmė
   UPDATE word SET translation_ru = 'поносит' WHERE id = 5441;            -- viduriuoja
   UPDATE word SET translation_ru = 'поносило' WHERE id = 5442;           -- viduriavo
   ```
2. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru FROM word
   WHERE id IN (5429, 5430, 5432, 5433, 5435, 5436, 5438, 5439, 5441, 5442)
   ORDER BY id;
   ```
3. No frontend code changes needed — `translation_ru` is passed through to UI without transformation.
4. Resolve related issues #78, #79, #80, #81, #82, #84, #85 together with this fix.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #75 (+ #78, #79, #80, #81, #82, #84, #85) — Tense-correct translations for conjugated verbs in list 166. Mark all as resolved?"
Only if the user confirms:
1. Run:
   ```sql
   UPDATE mistake_report SET status = 'resolved'
   WHERE id IN (75, 78, 79, 80, 81, 82, 84, 85);
   ```
2. Move this plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
