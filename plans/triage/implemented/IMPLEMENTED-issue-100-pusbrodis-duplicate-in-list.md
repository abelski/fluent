# Issue #100 — /dashboard/lists/210/study

**Reported:** 2026-05-27 15:40
**Status:** open
**Description:** "pusbrodis?" — user is questioning the word pusbrodis in the family vocabulary study session

## Root cause

List 210 "Čia mano šeima" contains two words with identical Russian translation "двоюродный брат":
- `pusbrodis` (id 6039) — regional/dialectal variant, only in list 210
- `pusbrolis` (id 3277) — standard modern Lithuanian word, appears in 6 word lists

A learner studying list 210 sees two consecutive flashcards with the same Russian meaning but different Lithuanian spellings, with no explanation. This appears to be a duplicate/error. The `pickDistractors` function excludes same-translation words from MCQ options, but the flashcard phase still shows both sequentially.

`pusbrolis` is the canonical form. `pusbrodis` is a non-standard variant that should not coexist in the same basic vocabulary list without differentiation.

## Fix plan

1. Remove `pusbrodis` from list 210 by deleting its `word_list_item` row:

```sql
DELETE FROM word_list_item
WHERE word_id = 6039 AND word_list_id = 210;
```

The `word` row (id 6039) itself is preserved — no user progress data is lost.

2. Verify:

```sql
SELECT COUNT(*) FROM word_list_item WHERE word_id = 6039;
-- Expected: 0

SELECT COUNT(*) FROM word_list_item WHERE word_list_id = 210 AND word_id = 3277;
-- Expected: 1 (pusbrolis still present)
```

No frontend or backend code changes are needed. The backend `_list_words()` query in `backend/routers/words.py` is data-driven; removing the `word_list_item` row is sufficient.

## Tests
1. Write a Playwright test in `frontend/tests/issue-100-pusbrodis-removed-from-list.spec.ts` that calls `GET /api/lists/210` and asserts the word `pusbrodis` does not appear in the response.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #100 — pusbrodis removed from list 210 (standard pusbrolis kept). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 100;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
