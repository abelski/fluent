# Issue #102 — /dashboard/lists/

**Reported:** 2026-05-27 16:50
**Status:** open
**Description:** "В разделе 'Слова', в теме 'Namai ir buitis' ошибка в слове 'лампа': написано 'lampa', а верно будет 'lempa'"
(In "Words", topic "Namai ir buitis", the word for lamp is 'lampa' but should be 'lempa')

## Root cause

Two `word` rows store the Lithuanian word for "lamp" incorrectly as `lampa` instead of `lempa`. The correct Lithuanian word is `lempa` — `lampa` is not a Lithuanian word (it resembles Spanish/Portuguese). Both rows also have the wrong `accented` value (`*lam*pa` instead of `*lem*pa`).

| id | Current lithuanian | Current accented | Lists |
|---|---|---|---|
| 4715 | lampa | *lam*pa | home_household (136, 137), Namai ir buitis (170) |
| 4718 | lampa | *lam*pa | home_household (136) |

These are separate word rows (not duplicates) — each has distinct `word_list_item` memberships.

## Fix plan

1. Fix both word rows:

```sql
UPDATE word SET lithuanian = 'lempa', accented = '*lem*pa' WHERE id = 4715;
UPDATE word SET lithuanian = 'lempa', accented = '*lem*pa' WHERE id = 4718;

-- Verify
SELECT id, lithuanian, accented FROM word WHERE id IN (4715, 4718);
```

No other tables are affected (no grammar sentences or articles reference this word). No frontend or backend code changes needed — `_list_words()` in `backend/routers/words.py` is data-driven.

## Tests
1. Write a Playwright test in `frontend/tests/issue-102-lempa-spelling.spec.ts` that:
   - Mocks `GET /api/lists/*/study` to return word id=4715 with `lithuanian: 'lempa'`
   - Navigates to the study route and asserts `page.getByText('lempa')` is visible and `page.getByText('lampa')` is not visible
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #102 — 'lampa' corrected to 'lempa' (lamp) in Namai ir buitis and home_household lists. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 102;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
