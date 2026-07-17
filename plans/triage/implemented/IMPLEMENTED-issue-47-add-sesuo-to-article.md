# Issue #47 — daiktavardžiai-linksniavimas article

**Reported:** 2026-04-14 19:34:53
**Status:** open
**Description:** Taip pat pridėčiau žodį "sesuo" (Would also add the word "sesuo" to the noun declension article)

## Root cause
The noun declension article (`daiktavardžiai-linksniavimas`, id=5) covers 5 declension types using example words (vyras, knyga, gatvė, paukštis, moteris, sūnus). The word "sesuo" (sister) follows the 5th declension (irregular pattern) and is not currently in the article. Adding it would give learners a common irregular noun as an example.

## Fix plan
1. Look up the correct declension of "sesuo" (5th declension, irregular):
   - Vns.: sesuo, sesers, seseriai, seserį, seserimi, seseryje, seserie
   - Dgs.: seserys, seserų, seserims, seseris, seserimis, seseryse, seserys
2. Add a new section "5-е склонение — **sesuo** (неправильное)" to the article `body_ru` (and `body_en` equivalent) in the DB.
3. Run SQL UPDATE to append the section to the article body.
4. Verify the update and check the live article page.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the daiktavardžiai article and confirms "sesuo" appears in the page content.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #47 — Added 'sesuo' declension table to noun article. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 47;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
