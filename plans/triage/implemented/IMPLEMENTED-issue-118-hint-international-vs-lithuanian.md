# Issue #118 — /dashboard/lists/172/study

**Reported:** 2026-06-04 11:08:51
**Status:** open
**Description:** Не показывайте ответ. Лучше давать подсказку : международное это слово или литовское. Kolega -Bendragarbis

(Translation: "Don't show the answer. Better to give a hint: whether the word is international or Lithuanian. Kolega - Bendradarbis")

## Root cause
List 172 ("Profesijos ir darbas") contains both `kolega` (international loanword) and `bendradarbis` (native Lithuanian), which share the identical Russian translation `коллега`.

The study endpoint `get_study_words()` in `backend/routers/words.py:369-375` has a disambiguation block: when two session words share `translation_ru`, it appends the Lithuanian word in parentheses to **both** translations, producing e.g. `коллега (kolega)`.

That mutated `translation_ru` is then rendered verbatim as the **prompt** in:
- Stage `2r` (reverse MC, "select the Lithuanian word") — `QuizSession.tsx:878`
- Stage 3 (type the word, "how to say in Lithuanian?") — `QuizSession.tsx:927`, cloze sub-label `:932`

So the prompt literally spells out the answer the learner must produce. This is the same root cause as **issue #120**.

## Fix plan
1. **Stop revealing the answer in the answer-producing stages.** In `backend/routers/words.py:369-375`, stop mutating `w["translation_ru"]` in place. Instead expose a separate non-leaking signal (e.g. boolean `ambiguous_ru`) so the frontend can decide per-stage whether to show disambiguation. (Coordinate with issue #120 — same code block.)
2. **Direction-aware rendering** in `QuizSession.tsx`: in stages 2r and 3 (answer = Lithuanian) show only the bare `translation_ru`; the parenthetical is acceptable only in the meaning-revealing stages (1, 2).
3. **Add the category hint the user requested.** The `word.hint` field already exists end-to-end (`models.py:79`, returned at `words.py:400`, rendered under the prompt at `QuizSession.tsx:880/931`). Populate `hint` for the two colliding words via the admin word-edit path (`backend/routers/admin.py:930-969`):
   - `kolega` → `международное слово` (or LT `tarptautinis žodis`)
   - `bendradarbis` → `литовское слово` (or LT `lietuviškas žodis`)
   Confirm hint language (RU vs LT) with the user — LT matches existing hint values like `veiksmažodis`; RU matches the reporter's wording.
4. **Keep distractor exclusion intact** (`words.py:380-388`, `pickDistractors` at `QuizSession.tsx:120-123`): ensure these still compare the raw un-parenthesized `translation_ru` so the two synonyms never appear as each other's MC distractors.
5. Ship steps 1–3 together: removing the parenthetical leaves a `2r`/stage-3 prompt of just `коллега` (ambiguous between two valid answers), and the hint resolves it.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #118 — Не показывайте ответ. Лучше давать подсказку: международное это слово или литовское (Kolega - Bendradarbis). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 118;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.

### Critical files
- `backend/routers/words.py` (disambiguation block 369-375, distractor exclusion 380-388)
- `frontend/app/dashboard/components/QuizSession.tsx` (prompt rendering 878-932, hint display 880/931)
- `backend/routers/admin.py` (word-edit / hint write, 930-969)
- `backend/models.py` (`Word.hint`, line 79)
