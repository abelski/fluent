# Issue #87 — /dashboard/lists/160/study

**Reported:** 2026-05-20 08:46:53
**Status:** open
**Description:** не vaisinė arbata, а Vaisių

The user reports that the word for "фруктовый чай" in list 160 (Gerimai) should be `vaisių arbata` (genitive plural of *vaisius* = "of fruits") instead of `vaisinė arbata`.

## Root cause

Pure DB content error. Word id=3588 in list 160 ("Gerimai") is stored as `lithuanian="vaisinė arbata"` but the natural Lithuanian collocation for "фруктовый чай" is `"vaisių arbata"` (genitive plural noun). The adjective form `vaisinė` exists in Lithuanian but is not the established collocation for tea — the sibling entries in the same list use the same genitive-plural-noun pattern (`mėtų arbata`, `žolelių arbata`), and color/type adjectives (`juoda arbata`, `žalia arbata`) follow a different syntactic pattern. No code/frontend changes needed; `word.lithuanian` is rendered as-is.

## Fix plan

1. Inspect current state to know whether `accented` needs clearing:
   ```sql
   SELECT id, lithuanian, accented, translation_ru, translation_en, hint
   FROM word WHERE id = 3588;
   ```
2. Apply content fix:
   ```sql
   UPDATE word
   SET lithuanian = 'vaisių arbata',
       accented = NULL
   WHERE id = 3588;
   ```
   Keep `translation_ru = 'фруктовый чай'` and `translation_en` unchanged.
3. Verify:
   ```sql
   SELECT id, lithuanian, accented, translation_ru FROM word WHERE id = 3588;
   ```
   Expected: `vaisių arbata`.
4. Manual UI verification: navigate to `/dashboard/lists/160/study`, locate the фруктовый чай card; assert it displays `vaisių arbata`. Also check `/dashboard/lists/160` (flashcards page) for the same word.

## Tests
1. Write a Playwright test at `frontend/tests/issue-87-vaisiu-arbata.spec.ts` modeled on `frontend/tests/issue-31-sakotis-translation.spec.ts`:
   - Mock `**/api/lists/160` with a minimal payload containing word id=3588 with `lithuanian: 'vaisių arbata'`, `translation_ru: 'фруктовый чай'`.
   - Mock `**/api/me/quota`.
   - `page.goto('/dashboard/lists/160')`, assert `vaisių arbata` is visible and `vaisinė arbata` is NOT visible.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #87 — vaisinė arbata → vaisių arbata in list 160. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 87;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-87-vaisine-arbata-wrong-form.md`.
