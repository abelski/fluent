# Issue #92 — /dashboard/lists/155/study

**Reported:** 2026-05-24 07:44:52
**Status:** open
**Description:** Degalai - горючее, Kuras - топливо. Надо исправить

## Root cause
Issue #76 disambiguated `degalai` / `kuras` by adding `hint` text while keeping both `translation_ru = "топливо"`. That choice was driven by concern that changing `translation_ru` would break distractor-deduplication logic. The reporting user (native/fluent Russian speaker) is now telling us the translations themselves are wrong: Russian has a clean lexical pair mirroring the Lithuanian pair exactly.

- `degalai` (liquid combustible fuel — petrol, diesel, kerosene) → `горючее`
- `kuras` (general fuel — firewood, coal, gas) → `топливо`

The dedup concern from #76 is now inverted: with two distinct `translation_ru` values, dedup logic still works correctly (`backend/routers/words.py:351,359` filters by `not_in(session_translations_ru)`; `frontend/app/dashboard/components/QuizSession.tsx:131-138` `pickDistractors` filters `w.translation_ru !== word.translation_ru`). After the fix, the two words become eligible to act as distractors for each other — legitimate and desired.

With distinct translations, the current hints (`топливо для транспорта`, `топливо в целом`) become redundant noise. Clear them — the Russian words now carry the distinction (other words in list 155 reserve `hint` for grammatical notes like `m. / f.`).

## Fix plan
1. Run SQL update:
   ```sql
   UPDATE word SET translation_ru = 'горючее', hint = NULL WHERE id = 4140;  -- degalai
   UPDATE word SET translation_ru = 'топливо', hint = NULL WHERE id = 4145;  -- kuras
   ```
2. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru, hint FROM word WHERE id IN (4140, 4145);
   ```
   Expect: `4140 | degalai | горючее | NULL` and `4145 | kuras | топливо | NULL`.
3. No code changes, no migration, no frontend rebuild — values are read live from the DB on each study session fetch.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #92 — Updated degalai → горючее and kuras → топливо in list 155, cleared the now-redundant hints. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 92;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `plans/triage/implemented/IMPLEMENTED-issue-92-degalai-kuras-translations.md`).
