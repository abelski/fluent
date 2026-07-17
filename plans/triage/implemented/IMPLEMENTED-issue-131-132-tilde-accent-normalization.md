# Issue #131 / #132 — Tilde accent mark causes false wrong answer

**Reported:** 2026-06-26 21:45 / 21:47
**Status:** open
**Description:** User typed "Plaukti" for word `plaũkti` (id 7382, list 296) and was marked wrong. The tilde diacritic (U+0169) cannot be typed on a standard keyboard. Two reports from the same study session.

## Root cause

`normalizeLt()` in `QuizSession.tsx` (line 71) and `PhraseSession.tsx` (line 37) strips the 9 standard Lithuanian diacritics (ą, č, ę, ė, į, š, ų, ū, ž) but does NOT strip Lithuanian stress/tone marks (combining tilde U+0303, combining acute U+0301, combining grave U+0300) or precomposed variants like `ũ` (U+0169).

The grammar page (`grammar/page.tsx` line 86) already has the correct implementation using NFD decomposition + regex stripping of combining marks. This fix was never propagated to the quiz components.

## Fix plan

1. **Create shared utility** `frontend/lib/normalizeLt.ts` with a single canonical `normalizeLt` function that:
   - Applies `normalize('NFD')` to decompose precomposed characters (e.g. `ũ` → `u` + COMBINING TILDE)
   - Strips combining marks: U+0300 (grave), U+0301 (acute), U+0303 (tilde)
   - Re-composes with `normalize('NFC')` so standard Lithuanian letters remain intact
   - Applies `.toLowerCase()` and the existing 9 Lithuanian diacritic replacements

2. **Update `QuizSession.tsx`** — remove local `normalizeLt` (lines 67-80), import from shared utility. All call sites (lines 97, 98, 202, 684) use the new version.

3. **Update `PhraseSession.tsx`** — remove local `normalizeLt` (lines 37-43), import from shared utility.

4. **Update `grammar/page.tsx`** — remove local `normalizeLt` (lines 86-101), import from shared utility.

5. **Data investigation** — check how many words have stress marks in `lithuanian` field. Also check `verb_translations_en.py` line 191 for seed data containing tilde marks.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - `normalizeLt('plaũkti') === normalizeLt('plaukti')` (tilde stripped)
   - `normalizeLt('Plaukti') === normalizeLt('plaũkti')` (case + tilde)
   - Standard Lithuanian diacritics still normalize correctly
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issues #131/#132 — tilde accent on plaũkti causing false wrong answers. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id IN (131, 132);` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
