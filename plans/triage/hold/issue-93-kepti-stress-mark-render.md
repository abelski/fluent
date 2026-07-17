# Issue #93 — /dashboard/grammar/

**Reported:** 2026-05-26 09:48:26
**Status:** open
**Description:** kèpti — tu / печь, жарить / Правильно: kepi̇̀ / Что-то с шрифтом. Непонятно как правильно

## Root cause

Two distinct problems in the `verb.conjugations` JSON (verb id 100, `kèpti`):

1. **Bad combining-mark sequences.** Cells contain `i` + U+0307 (COMBINING DOT ABOVE) + U+0300 (COMBINING GRAVE) instead of precomposed `ì` (U+00EC). Lithuanian dictionaries use `ì` for grave-stressed `i`, but the PDF-extraction step preserved a glyph stack that visually stacks two dots and a grave on top of `i`. About 1880 occurrences of `i + U+0307` exist across `temp_files/verbs_extracted.json` — this is sitewide.
2. **A truly broken cell.** `conjugations.conditional.tu` for verb 100 is just `"̃"` (a lone combining tilde) — the actual form was lost during extraction.

The frontend grader (`normalizeLt` in `frontend/app/dashboard/grammar/page.tsx`) already strips grave/acute/tilde, so grading is fine — but the rendered "correct answer" span (line ~1032) displays the raw JSON value with the broken combining sequence, hence "Что-то с шрифтом".

## Fix plan

1. **Data fix for verb 100** (the user-visible row) via the `sql` skill. In a single transaction:
   - `indicative_present.tu`: `"kepi̇̀"` → `"kepì"` (precomposed)
   - `indicative_past_simple.tu`: `"kepei̇"` → `"kepei"` (strip stray U+0307; verify the correct stress against the textbook before committing)
   - `conditional.tu`: `"̃"` → `"keptum"` or `"kèptum"` (reconstruct against textbook reference)
   ```sql
   BEGIN;
   UPDATE verb
   SET conjugations = jsonb_set(
     jsonb_set(
       jsonb_set(conjugations::jsonb,
         '{indicative_present,tu}', '"kepì"'::jsonb),
       '{indicative_past_simple,tu}', '"kepei"'::jsonb),
     '{conditional,tu}', '"keptum"'::jsonb
   )::text
   WHERE id = 100;
   COMMIT;
   ```

2. **Bulk audit + fix** for all verbs with the same `i + U+0307` pattern. Read-only audit first:
   ```sql
   SELECT id, number, infinitive
   FROM verb
   WHERE conjugations LIKE '%i' || U&'\0307' || '%';
   ```
   Then bulk fix:
   ```sql
   BEGIN;
   UPDATE verb
   SET conjugations = REGEXP_REPLACE(
     REGEXP_REPLACE(conjugations,
       'i' || U&'\0307' || U&'\0300', U&'\00EC', 'g'),  -- i + dot + grave → ì
     'i' || U&'\0307', 'i', 'g'                          -- bare i + dot above → i
   )
   WHERE conjugations LIKE '%' || U&'\0307' || '%';
   COMMIT;
   ```
   For lone-combining-mark cells (`"̃"`, `"́"`, `"̀"`), surface a list to the user rather than auto-fix.

3. **Frontend NFC normalization + harden the grader** in `frontend/app/dashboard/grammar/page.tsx`:
   - Add `function nfc(s: string) { return (s ?? '').normalize('NFC'); }` near `normalizeLt` (~line 86).
   - Wrap `nfc()` at every render site of backend Lithuanian strings: lines ~932 (`task.prompt_lt`), ~954 (`task.base_lt`), ~976 (display string in `InlineSentenceInput`), ~992 (`task.verb_infinitive`), ~994 (`task.example_lt`), and crucially **line ~1032 `{shownAnswer}` → `{nfc(shownAnswer)}`**.
   - Update `normalizeLt`'s strip regex to also remove U+0307: `.replace(/[̀́̃̇]/g, '')` (replaces the existing `.replace(/[́̀̃]/g, '')` at line ~90).

## Tests

1. Write a Playwright test in `frontend/tests/issue-93-kepti-stress-mark-render.spec.ts` that:
   - Navigates to the grammar dashboard, starts the conjugation lesson containing `kèpti`.
   - Submits a wrong answer to force the correct-answer reveal.
   - Asserts the displayed correct-answer span does **not** contain U+0307 or a lone combining tilde.
   - Asserts the rendered text matches the precomposed form `kepì`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #93 — kèpti tu-form stress-mark rendering. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 93;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-93-kepti-stress-mark-render.md`.
