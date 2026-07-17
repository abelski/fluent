# Issue #121 — /dashboard/lists/154/study

**Reported:** 2026-06-09 07:52:39
**Status:** open
**Description:** rezervuoti — резервировать, бронировать / užrezervuoti — зарезервировать (совершенный вид). rezervuoti != зарезервировать

## Root cause

All 3 `word` table rows for `rezervuoti` carry the Russian translation `зарезервировать` (perfective aspect), which is incorrect. `rezervuoti` is the imperfective verb ("to reserve / to book", ongoing action) and should be `резервировать` or `резервировать, бронировать`. The perfective `зарезервировать` belongs to `užrezervuoti`. This was a data-entry error when the list was seeded.

**Confirmed DB state:**
| id   | lithuanian  | translation_ru    |
|------|-------------|-------------------|
| 5091 | rezervuoti  | зарезервировать   |
| 5094 | rezervuoti  | зарезервировать   |
| 5271 | rezervuoti  | зарезервировать   |

## Fix plan
1. Verify `užrezervuoti` entries (if any) and confirm their translations are `зарезервировать` (correct — no change needed):
   ```sql
   SELECT id, lithuanian, translation_ru, translation_en FROM word WHERE lithuanian LIKE '%rezervuoti%' ORDER BY id;
   ```
2. Apply the fix for all 3 `rezervuoti` rows (both RU and EN):
   ```sql
   UPDATE word SET translation_ru = 'резервировать, бронировать', translation_en = 'reserve, book' WHERE id IN (5091, 5094, 5271);
   ```
   Current `translation_en = 'reserve'` also misses the "book" meaning — both languages need the fix.
3. Verify: re-run the SELECT and confirm both `translation_ru = 'резервировать, бронировать'` and `translation_en = 'reserve, book'` for all 3.
4. Create Playwright test `frontend/tests/issue-121-rezervuoti-translation.spec.ts` following the pattern of `issue-58-prosenelis-translation.spec.ts` — mock the study API for list 154, assert `резервировать, бронировать` is visible and `зарезервировать` is not.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #121 — rezervuoti has wrong translation (зарезервировать → резервировать, бронировать). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 121;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-121-rezervuoti-wrong-translation.md` → `plans/triage/implemented/IMPLEMENTED-issue-121-rezervuoti-wrong-translation.md`).
