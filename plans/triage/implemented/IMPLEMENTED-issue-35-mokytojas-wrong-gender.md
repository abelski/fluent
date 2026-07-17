# Issue #35 — /dashboard/lists/187/study

**Reported:** 2026-03-28 10:45:32
**Status:** open
**Description:** учитель, учительница в вопросе mokytojas ответ. это неправильно. тк mokytojas это мужской род

## Root cause
Pure data error. Word id 5474 has `lithuanian = "mokytojas"` with `translation_ru = "учитель, учительница"`. `mokytojas` is the masculine form; the feminine is `mokytoja`. The translation should only say "учитель". No code changes needed — the study page renders `translation_ru` verbatim with no gender-splitting logic.

## Fix plan
1. Run SQL: `UPDATE word SET translation_ru = 'учитель' WHERE id = 5474;`
2. (Optional) Also check `translation_en` on the same row for similar issue.
3. (Optional / Option B) Add a separate word row for `mokytoja → учительница` and attach it to list 187 via `word_list_item`.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #35 — mokytojas should translate to учитель only (not учительница). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 35;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
