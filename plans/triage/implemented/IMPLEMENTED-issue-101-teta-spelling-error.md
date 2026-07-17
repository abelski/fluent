# Issue #101 — /dashboard/lists/210/study

**Reported:** 2026-05-27 15:45
**Status:** open
**Description:** "tėtė, в начале слова е стоит у вас" — the word tėtė/tetė starts with plain "е" where the user expects a different letter

## Root cause

Word id=6038 in list 210 "Čia mano šeima" (family vocabulary) is stored as:
- `lithuanian` = `tetė` (starts with plain `e`)
- `accented` = `*te*tė`
- `translation_ru` = тетя (aunt)

The correct Lithuanian nominative form for "aunt" is `teta` (plain final `a`), not `tetė`. The form `tetė` does not exist as a standard Lithuanian word. This is a data-entry typo — the final `a` in `teta` was accidentally written as `ė`, producing the invalid form `tetė`.

The `accented` field also reflects this typo and needs correction.

## Fix plan

1. Fix the word data:

```sql
UPDATE word
SET lithuanian = 'teta',
    accented   = '*te*ta'
WHERE id = 6038;

-- Verify
SELECT id, lithuanian, accented, translation_ru FROM word WHERE id = 6038;
-- Expected: id=6038 | lithuanian=teta | accented=*te*ta | translation_ru=тетя
```

No other tables need changes. The `word_list_item` row stays unchanged (word remains in list 210 at same position). User progress tracked by `word_id` is unaffected.

No frontend or backend code changes are needed. `renderAccented('*te*ta')` correctly produces bold "te" + plain "ta".

## Tests
1. Write a Playwright test in `frontend/tests/issue-101-teta-spelling.spec.ts` that:
   - Mocks `GET /api/lists/*/study` to return word id=6038 with `lithuanian: 'teta'` and `translation_ru: 'тетя'`
   - Navigates to `/dashboard/lists/_/study`
   - Asserts `page.getByText('teta')` is visible
   - Asserts `page.getByText('tetė')` is not visible
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #101 — teta (aunt) spelling corrected from 'tetė' to 'teta' in list 210. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 101;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
