# Issue #77 — /dashboard/lists/155/study

**Reported:** 2026-05-16 20:28:41
**Status:** open
**Description:** Пожалуйста, добавьте ударения в словах и фразах. Ударения в литовском не очень очевидные, и было бы очень удобно сразу видеть правильное ударение, а не искать на сторонних сайтах.

## Root cause
No stress/accent marks exist in any `word.lithuanian` or `phrase.text` data. There is no dedicated field for pronunciation. However, the grammar page (`/frontend/app/dashboard/grammar/page.tsx` lines 88-91) already strips Unicode combining accent characters (U+0300, U+0301, U+0303) before answer comparison — proving this approach was anticipated. The correct implementation is to embed combining Unicode accents directly into the existing `lithuanian` field (e.g. `"lábas"` for stressed `á`), requiring no schema changes.

## Fix plan
1. **Patch `normalizeLt` in QuizSession** (`frontend/app/dashboard/components/QuizSession.tsx` ~line 65) to strip combining accents before answer comparison:
   ```js
   .normalize('NFD').replace(/[̀́̃]/g, '').normalize('NFC')
   ```
2. **Patch `normalizeLt` in PhraseSession** (`frontend/app/dashboard/components/PhraseSession.tsx` ~line 37) with the same strip.
3. **Patch `splitSyllables`** in `QuizSession.tsx` (~line 153) to strip combining marks before syllable detection (combining characters have zero visual width and break vowel-index logic), then display the original accented string.
4. **Add a stress-mark insertion toolbar** in the admin word editor (`frontend/app/dashboard/admin/page.tsx`) next to the `lithuanian` input — clickable buttons to insert ` ́` (acute U+0301), `` ` `` (grave U+0300), `̃` (tilde U+0303) at cursor position.
5. **Populate stress marks via a data migration script** — create `backend/scripts/add_stress_marks.py` that reads a manually-prepared mapping (id → stressed_lithuanian) and bulk-UPDATEs the `word` table. Consider using the Apertium/HFST Lithuanian analyzer for 80–90% auto-annotation with manual review for the rest.
6. No backend API, model, or routing changes needed — `word.lithuanian` is a plain VARCHAR that accepts Unicode.

## Tests
1. Write a Playwright test in `frontend/tests/` that verifies stress marks display on flashcards and that typed answers without accents are still accepted.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #77 — Stress marks feature implemented (normalization patches + admin toolbar + data migration). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 77;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
