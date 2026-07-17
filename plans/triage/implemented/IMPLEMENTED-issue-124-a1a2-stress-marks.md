# Issue #124 — /dashboard/review/

**Reported:** 2026-06-09 23:03:26
**Status:** open
**Description:** Ошибки в ударениях в словах из раздела «Базовый словарь на А1-А2» (правильные варианты в скобках):
- turgus (tur̃gus)
- glaudės (glaũdės)
- sriuba (sriubà)
- sutartis (sutartìs)
- rudas (rùdas)
- žalias (žãlias)

## Root cause

The `word.accented` column stores asterisk-based markup for bold highlighting of the stressed syllable (e.g., `tu*rgus*` renders as "tu**rgus**"). The current values have the wrong syllable marked as stressed for multiple A1-A2 vocabulary words.

The app uses `renderAccented()` in `frontend/lib/renderAccented.tsx` which splits on `*` and wraps odd segments in `<strong>`. Unicode stress characters (ã, à, ̃) are not supported — the fix must stay in asterisk format.

**Mapping Lithuanian stress notation → asterisk format:**
- `tur̃gus` → tilde on r → stressed syllable "tur" → `*tur*gus`
- `glaũdės` → tilde on u → stressed syllable "glau" → `*glau*dės`
- `sriubà` → grave on final a → stressed syllable "ba" → `sriu*ba*`
- `sutartìs` → acute on final i → stressed syllable "tis" → `sutar*tis*`
- `rùdas` → grave on u → stressed syllable "ru" → `*ru*das`
- `žãlias` → tilde on a → stressed syllable "ža" → `*ža*lias`

**Current vs correct:**

| ID | Word | Current accented | Correct accented | Problem |
|----|------|-----------------|-----------------|---------|
| 3210 | turgus | `tu*rgus*` | `*tur*gus` | Stress on "tur", not "rgus" |
| 4181 | glaudės | `glau*dės*` | `*glau*dės` | Stress on "glau", not "dės" |
| 4216 | glaudės | `glau*dės*` | `*glau*dės` | Same |
| 3502 | sriuba | `sri*ub*a` | `sriu*ba*` | Stress on final "ba", not "ub" |
| 5039 | sutartis | `suta*rtis*` | `sutar*tis*` | Bold starts at "r" not "t" |
| 5485 | sutartis | `*sut*artis` | `sutar*tis*` | Completely wrong syllable |
| 5038 | sutartis | NULL | `sutar*tis*` | Missing entirely |
| 5503 | rudas | `ru*das*` | `*ru*das` | Stress on "ru", not "das" |
| 4240 | rudas | NULL | `*ru*das` | Missing entirely |
| 3485 | žalias | `žali*as*` | `*ža*lias` | Stress on "ža", not "as" |
| 4246 | žalias | NULL | `*ža*lias` | Missing entirely |

## Fix plan

1. Run the SQL UPDATEs against the production database:
   ```sql
   UPDATE word SET accented = '*tur*gus' WHERE id = 3210;
   UPDATE word SET accented = '*glau*dės' WHERE id IN (4181, 4216);
   UPDATE word SET accented = 'sriu*ba*' WHERE id = 3502;
   UPDATE word SET accented = 'sutar*tis*' WHERE id IN (5038, 5039, 5485);
   UPDATE word SET accented = '*ru*das' WHERE id IN (4240, 5503);
   UPDATE word SET accented = '*ža*lias' WHERE id IN (3485, 4246);
   ```

2. Verify all 11 rows were updated correctly:
   ```sql
   SELECT id, lithuanian, accented FROM word
   WHERE id IN (3210, 4181, 4216, 3502, 5038, 5039, 5485, 4240, 5503, 3485, 4246)
   ORDER BY lithuanian;
   ```

3. No code changes required — this is a pure data fix.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #124 — Incorrect stress marks in 6 A1-A2 vocabulary words (turgus, glaudės, sriuba, sutartis, rudas, žalias). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 124;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-124-a1a2-stress-marks.md` → `plans/triage/implemented/IMPLEMENTED-issue-124-a1a2-stress-marks.md`).
