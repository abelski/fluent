# Issue #46 — daiktavardžiai-linksniavimas article

**Reported:** 2026-04-14 19:30:56
**Status:** open
**Description:** Moteris- Kilmininkas "moters" - the genitive singular (kilmininkas) of "moteris" should be "moters" not "moteries"

## Root cause
The article `daiktavardžiai-linksniavimas` (id=5) contains the declension table for "moteris" with the genitive form shown as `moter-**ies**` (= "moteries"). The correct Lithuanian genitive singular of "moteris" is "moters" (not "moteries"). The article body_ru in the DB has the wrong form.

Confirmed in DB:
- `body_ru` contains: `| Родительный | moter-**ies** | moter-**ų** |`
- Correct form: `moter-**s**` (genitive singular = "moters")

## Fix plan
1. Run the following SQL to fix the article content:
```sql
UPDATE article
SET body_ru = REPLACE(body_ru, 'moter-**ies**', 'moter-**s**'),
    body_en = REPLACE(body_en, 'moter-**ies**', 'moter-**s**'),
    updated_at = NOW()
WHERE slug = 'daiktavardžiai-linksniavimas';
```
2. Verify the update was applied correctly by querying the article.
3. Verify on the live site that the moteris table now shows "moters" as the genitive form.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens `/dashboard/articles/daiktavardžiai-linksniavimas`, finds the moteris declension table, and checks that "moters" appears and "moteries" does not.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #46 — moteris genitive form corrected to 'moters'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 46;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
