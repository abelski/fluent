# Issue #103 — /dashboard/lists/

**Reported:** 2026-05-28 02:32
**Status:** open
**Description:** "В разделе 'Слова', в списке 'Базовый словарь на А1-А2' слово 'обед' указано как 'pietūs'. Но это множественное число и означает 'обеды', а 'обед' — это 'pietus'"
(Word for "lunch" is given as 'pietūs' but user says it should be 'pietus' as nominative form)

## Root cause

The user is mistaken about Lithuanian grammar — this is not a bug in the data. In Lithuanian, "lunch" is a **plurale tantum** (only exists in plural form):
- `pietūs` = nominative plural — this is the **dictionary/headword form**, correctly translating to Russian "обед"
- `pietus` = accusative plural (inflected form, not the headword)

The DB correctly stores: word id=3347 = `pietūs` = обед, accented `*pie*tūs`, in list "Labai skanu!".

However, the user's confusion is understandable. Adding a hint to clarify the grammatical nature would prevent future similar reports.

## Fix plan

1. Add a hint to word id=3347 explaining the plurale tantum nature:

```sql
UPDATE word
SET hint = 'plurale tantum — только во мн.ч.'
WHERE id = 3347;

-- Verify
SELECT id, lithuanian, translation_ru, hint FROM word WHERE id = 3347;
```

This hint will appear in the study session (if the hint field is rendered) and in the admin panel, providing context for learners who question the plural form.

2. Optionally, also check if the list name "Базовый словарь на А1-А2" corresponds to an actual list. No match was found in the DB — the user may have been viewing list "Labai skanu!" or a different list. No list rename needed.

No frontend or backend code changes are needed.

## Tests
1. Write a Playwright test in `frontend/tests/issue-103-pietus-hint.spec.ts` that verifies the hint is displayed in the study session (if hints are shown in the UI) or simply confirms the word `pietūs` is present with correct translation "обед".
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #103 — pietūs is correctly stored as 'обед' (plurale tantum in Lithuanian); added hint to clarify. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 103;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
