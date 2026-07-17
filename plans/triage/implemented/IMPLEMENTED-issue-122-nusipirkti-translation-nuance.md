# Issue #122 — /dashboard/lists/154/study

**Reported:** 2026-06-09 07:56:03
**Status:** open
**Description:** pirkti — покупать / купить (само действие). nusipirkti — купить себе, приобрести для себя, успешно завершить покупку.

## Root cause

Two translation accuracy issues:

1. **`nusipirkti`** (IDs 5079, 5082, 5262) — stored as `купить`. This misses the reflexive/completive semantic: "to buy for oneself, to successfully complete a purchase". Correct: `купить себе`.

2. **`pirkti`** (IDs 6992, 7418) — stored as `купить, покупать`. Since `pirkti` is the imperfective verb only, including `купить` (perfective) is linguistically wrong. Correct: `покупать`.

**Words in list 154:**
- `nusipirkti` (IDs 5079, 5262) — both need fix
- `apsipirkti` (IDs 5052, 5248) — `делать покупки` is correct, no change

**`pirkti` does not appear in list 154** — it's in lists 80, 102, 103, 217, 297 — but the global translation is still wrong.

## Fix plan
1. Fix all `nusipirkti` entries (both RU and EN — `translation_en = 'buy'` also misses the reflexive aspect):
   ```sql
   UPDATE word SET translation_ru = 'купить себе', translation_en = 'buy for oneself' WHERE lithuanian = 'nusipirkti' AND id IN (5079, 5082, 5262);
   ```
2. Fix `pirkti` entries with mixed perfective/imperfective translation and fill missing EN (ID 6992 has empty `translation_en`):
   ```sql
   UPDATE word SET translation_ru = 'покупать', translation_en = 'to buy' WHERE lithuanian = 'pirkti' AND id IN (6992, 7418);
   ```
3. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru, translation_en FROM word WHERE lithuanian IN ('pirkti', 'nusipirkti') ORDER BY lithuanian, id;
   ```
   Expected: all `nusipirkti` rows → `купить себе` / `buy for oneself`; all `pirkti` rows → `покупать` / `to buy`.
4. Create Playwright test `frontend/tests/issue-122-nusipirkti-translation.spec.ts` — mock study API for list 154, assert `купить себе` is visible and bare `купить` is not shown as a standalone answer.

**Scope summary:**
| Word ID | Lithuanian  | Current           | Fix To      | Lists Affected |
|---------|-------------|-------------------|-------------|----------------|
| 5079    | nusipirkti  | купить / buy             | купить себе / buy for oneself | 148, 149, 154  |
| 5082    | nusipirkti  | купить / buy             | купить себе / buy for oneself | 148            |
| 5262    | nusipirkti  | купить / buy             | купить себе / buy for oneself | 154            |
| 6992    | pirkti      | купить, покупать / (empty) | покупать / to buy           | (unassigned)   |
| 7418    | pirkti      | купить, покупать / to buy  | покупать / to buy            | 297            |

IDs 3687 and 6121 (`pirkti` → `покупать`) are already correct — no changes needed.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #122 — nusipirkti/pirkti translation nuance (купить → купить себе). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 122;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-122-nusipirkti-translation-nuance.md` → `plans/triage/implemented/IMPLEMENTED-issue-122-nusipirkti-translation-nuance.md`).
