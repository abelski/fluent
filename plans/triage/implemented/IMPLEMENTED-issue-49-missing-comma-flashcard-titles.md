# Issue #49 — /programs/

**Reported:** 2026-04-14 19:43:25
**Status:** open
**Description:** «Флешкарты для тех, кто…» - пропущена запятая в названиях наборов слов (missing comma in flashcard set names)

## Root cause
The `subcategory_meta` table contains program names in `name_ru` that are missing a comma after "тех". The correct Russian grammar requires a comma before "кто" in relative clauses.

Confirmed in DB:
- `lithuanian_daily_language`: "Флешкарты для тех кто изучает Литовский язык по учебнику Ne dienos be lietuvių kalbos"
- `lithuanian_daily_language_2`: "Флешкарты для тех кто изучает Литовский язык по учебнику Ne dienos be lietuvių kalbos — Книга 2"
- `lithuanian_daily_language_3`: "Флешкарты для тех кто изучает Литовский язык по учебнику Ne dienos be lietuvių kalbos — Книга 3"
- `sekmes`: "Флешкарты для тех кто изучает Литовский язык по учебнику Sekmės"

All four need "тех кто" → "тех, кто".

## Fix plan
1. Run SQL to fix all four entries:
```sql
UPDATE subcategory_meta
SET name_ru = REPLACE(name_ru, 'тех кто', 'тех, кто')
WHERE name_ru ILIKE '%тех кто%';
```
2. Verify the update with `SELECT key, name_ru FROM subcategory_meta WHERE name_ru ILIKE '%тех%';`
3. Reload the /programs/ page and confirm the comma is now present in all flashcard set names.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens `/programs/`, finds the flashcard program cards, and checks that all names containing "Флешкарты" also contain "тех, кто" (with comma).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #49 — Missing comma added to all flashcard set names. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 49;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
