# Issue #68 — /dashboard/lists/170/study

**Reported:** 2026-05-09 16:10:24
**Status:** open
**Description:** Удобрение надо добавить в слово ДОМА. ТК может быть namai и namie

## Root cause
List 170 contains both:
- `namai` → "дом" (nominative plural: houses/home)
- `namie` → "дома" (locative: at home)
- `namas` → "дом" (nominative singular: a house)

These three words have overlapping or ambiguous Russian translations, making it confusing during study. The user wants a disambiguation hint ("уточнение" — note: "удобрение" is autocorrect for "уточнение") added to the word "дома" / "namie" to clarify it means "at home (where?)" vs "home/houses (what?)".

## Fix plan
1. Add hints to distinguish the three words in the DB:
   ```sql
   UPDATE word SET hint = 'где?' WHERE id = 3172;  -- namie → дома (locative: where?)
   UPDATE word SET hint = 'что? (ед.ч.)' WHERE id = 3187;  -- namas → дом (nominative singular)
   UPDATE word SET hint = 'что? (мн.ч.)' WHERE id = 4730;  -- namai → дом (nominative plural)
   ```
2. Verify the `hint` column is rendered in the study quiz by checking `frontend/app/dashboard/components/QuizSession.tsx` — it is: `{word.hint && <p ...>{word.hint}</p>}`.
3. Run the SQL updates on production.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens list 170 study page and checks that words "namai", "namie", "namas" display their respective hints.
2. Rebuild frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #68 — namai/namie disambiguation hints added. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 68;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
