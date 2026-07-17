# Issue #54 — /dashboard/articles/įvardžiai-linksniavimas/

**Reported:** 2026-04-15 20:06:23
**Status:** open
**Description:** В примерах предложений на литовском было бы удобно видеть выделенные слова, о которых речь в грамматическом разделе: Tai yra **mano** knyga, o tai - **tavo**. (In example sentences, it would be helpful to see the grammatical words highlighted in bold)

## Root cause
Enhancement request. The grammar articles contain example sentences (e.g., in the pronouns article `įvardžiai-linksniavimas`). The request is to bold/highlight the grammatical form being discussed in each example sentence so it stands out visually.

The article body is stored as markdown in the DB. The solution is to update the article content in the DB to use markdown bold (**word**) around the relevant grammatical forms in example sentences.

## Fix plan
1. Query the `įvardžiai-linksniavimas` article content from the DB:
   ```sql
   SELECT body_ru FROM article WHERE slug = 'įvardžiai-linksniavimas';
   ```
2. Review the example sentences in the article.
3. Update the article body to bold the relevant grammatical forms in example sentences using markdown `**word**` syntax.
4. Also check other grammar articles (daiktavardžiai, veiksmažodžiai, etc.) for similar improvements.
5. Run SQL UPDATE to save the changes.
6. Verify the markdown renders correctly in the article page.

## Tests
1. Write a Playwright test that opens the įvardžiai article and checks that at least one example sentence contains a bolded word (strong element in the HTML).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #54 — Grammatical words highlighted in example sentences in article. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 54;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
