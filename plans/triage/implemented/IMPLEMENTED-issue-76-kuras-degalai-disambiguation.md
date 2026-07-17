# Issue #76 — /dashboard/lists/155/study

**Reported:** 2026-05-16 20:24:00
**Status:** open
**Description:** В разделе "Слова" в теме "Automobilis ir vairavimas" есть слова kuras и degalai, оба переводятся как "топливо". Было бы здорово сделать пометки, чтобы не допускать ошибки в упражнениях. Например, "топливо (для транспорта)" и "топливо (в целом)".

## Root cause
`degalai` (id=4140) and `kuras` (id=4145) both have `translation_ru = "топливо"` in list 155 "Automobilis ir vairavimas". This causes ambiguity in all quiz stages (MCQ, reverse MCQ, MatchRound). The `hint` field is the correct vehicle — it's already rendered in all quiz stages and the word list UI. Changing `translation_ru` directly would break distractor-deduplication logic.

## Fix plan
1. Apply SQL UPDATE to set disambiguation hints:
   ```sql
   UPDATE word SET hint = 'топливо для транспорта' WHERE id = 4140;  -- degalai
   UPDATE word SET hint = 'топливо в целом'        WHERE id = 4145;  -- kuras
   ```
2. Verify in DB:
   ```sql
   SELECT id, lithuanian, translation_ru, hint FROM word WHERE id IN (4140, 4145);
   ```
3. No frontend or backend code changes needed — `word.hint` is already rendered in all quiz stages (Stage 1/2/2r/3) and in the word list page.
4. Optionally verify via admin UI at `/dashboard/admin` → list 155 → find degalai and kuras.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #76 — Added disambiguation hints for kuras/degalai in list 155. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 76;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
