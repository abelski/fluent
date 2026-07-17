# Issue #71 — /dashboard/lists/162

**Reported:** 2026-05-11 11:12:41
**Status:** open
**Description:** Ne 'Įvairiai', bet 'Įvairūs'

## Root cause
Word list #162 is titled `"Įvairiai"` (an adverb meaning "variously/in various ways"), but the user argues it should be `"Įvairūs"` (an adjective meaning "various/diverse"). The list contains general/miscellaneous vocabulary (documents, objects, numbers). The adjective form is more natural as a list category title in Lithuanian.

DB query confirms: `SELECT id, title FROM word_list WHERE id = 162;` → `(162, 'Įvairiai', 'Общее и разное')`.

## Fix plan
1. Run the following SQL on production:
   ```sql
   UPDATE word_list SET title = 'Įvairūs' WHERE id = 162;
   ```
2. Verify by re-querying: `SELECT title FROM word_list WHERE id = 162;`
3. No frontend code change needed — the title is fetched and displayed dynamically.

## Tests
1. Write a Playwright test in `frontend/tests/` that navigates to `/dashboard/lists` and confirms the list previously titled "Įvairiai" now shows "Įvairūs".
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #71 — List 162 title changed to 'Įvairūs'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 71;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
