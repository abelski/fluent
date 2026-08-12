# Issue #93 — /dashboard/grammar/

**Reported:** 2026-05-26 09:48:26
**Status:** open
**Description:** kèpti — tu / печь, жарить / Правильно: kepi̇̀ / Что-то с шрифтом. Непонятно как правильно

## Root cause

Two distinct problems in the `verb.conjugations` JSON (verb id 100, `kèpti`):

1. **Bad combining-mark sequences.** Cells contain `i` + U+0307 (COMBINING DOT ABOVE) + U+0300 (COMBINING GRAVE) instead of precomposed `ì` (U+00EC). Lithuanian dictionaries use `ì` for grave-stressed `i`, but the PDF-extraction step preserved a glyph stack that visually stacks two dots and a grave on top of `i`. About 1880 occurrences of `i + U+0307` exist across `temp_files/verbs_extracted.json` — this is sitewide.
2. **A truly broken cell.** `conjugations.conditional.tu` for verb 100 is just `"̃"` (a lone combining tilde) — the actual form was lost during extraction.

The frontend grader (`normalizeLt` in `frontend/app/dashboard/grammar/page.tsx`) already strips grave/acute/tilde, so grading is fine — but the rendered "correct answer" span (line ~1032) displays the raw JSON value with the broken combining sequence, hence "Что-то с шрифтом".

## Status update — 2026-08-10 (findings from issue #150, no action taken)

Part of this issue was fixed as a side effect of #150. **Recorded for reference only — nothing below
was applied, and #93 remains on hold by the user's decision.**

**Already fixed by #150:** the bulk `i` + U+0307 cleanup in step 2 ran across 250 verbs.
Verb 100's `indicative_present.tu` is now `kepì` and `indicative_past_simple.tu` is now `kepei`.
The estimate of "~1880 occurrences" in the root cause was measured on the raw extract; in the DB it
was 250 rows.

**Still outstanding — 1: the forms are decomposed, not precomposed.** This is the actual font
complaint and the reason this issue is not closed. `kepì` is stored as `k e p` + `i` (U+0069) +
U+0300, **not** the precomposed `ì` (U+00EC) that step 1 of this plan called for. A bare `i` keeps its
tittle, so a renderer that does not apply the Unicode Soft_Dotted rule stacks the grave on top of the
dot — exactly "Что-то с шрифтом".

Measured across the DB on 2026-08-10:

| Column | Non-NFC values |
| --- | --- |
| `word.lithuanian` | 0 / 3779 |
| `word.accented` | 0 / 2913 |
| `grammar_sentence.full_word` | 0 / 425 |
| **`verb.conjugations`** | **828** |

So `verb` is the only Lithuanian text in the app that is not NFC — which is why the complaint appeared
on the verb page and nowhere else. Most frequent decomposed pairs: `e`+tilde ×277, `n`+grave ×258,
`y`+tilde ×129, `i`+grave ×120 (the `kepì` case), `e`+dot-above ×86.

The one-line fix, **not applied**:

```sql
-- NFC-normalise verb conjugations so they match every other Lithuanian column.
-- Lossless; grading is unaffected because normalizeLt runs NFD first.
UPDATE verb SET conjugations = normalize(conjugations, NFC)
WHERE conjugations <> normalize(conjugations, NFC);
```

Step 3 of the plan below (frontend `nfc()` wrapping) becomes unnecessary if the data is normalised at
rest. Do **not** add U+0307 to `normalizeLt`'s strip set as step 3 suggests — that would mask data
defects rather than surface them, and `ė`/`ų` etc. are precomposed so it is not needed for grading.

**Still outstanding — 2: `conditional.tu` is still `"̃"`.** A lone combining tilde; the real form
(`kèptum`) was lost in extraction. This is not a normalisation problem — it is the column-shift
corruption now tracked as **issue #151**, which covers ~169 verbs and needs a re-extraction pass.
Resolve #151 before closing this one, or close this issue on the rendering half alone.

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
