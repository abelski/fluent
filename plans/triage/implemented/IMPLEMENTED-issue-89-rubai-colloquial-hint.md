# Issue #89 — /

**Reported:** 2026-05-21 18:19:56
**Status:** open
**Description:** В разделе «Слова» в теме "Drabužiai ir aksesuarai" дается два слова с переводом «одежда»: drabužiai и rūbai. Гугл говорит, что «rūbai» — это, скорее, разговорный вариант. К нему можно добавить пометку «(разг.)», чтобы на случай, если эти оба слова попадутся в упражнении/повторении, не возникло путаницы.

## Root cause

In list 157 ("Drabužiai ir aksesuarai"), two words share the exact translation `одежда`:
- `word.id=4178` — `drabužiai` → `одежда`
- `word.id=4207` — `rūbai` → `одежда`

The MCQ distractor logic (`pickDistractors` in [frontend/app/dashboard/components/QuizSession.tsx:118-125](frontend/app/dashboard/components/QuizSession.tsx#L118-L125)) already filters out words sharing `translation_ru`, so they don't appear as wrong options against each other in MCQ. However, in the typed-answer stage they remain ambiguous: when prompted by `одежда`, the user cannot know which Lithuanian word the prompt expects. The user wants the colloquial register marked on `rūbai`.

The fix must go through the `hint` column, **not** `translation_ru`, because:
- `checkAnswer` (lines 94–103) compares normalized strings with `===` — changing `translation_ru` to `"одежда (разг.)"` would break acceptance of plain `"одежда"` as the answer.
- MCQ options would render the parenthetical visibly, polluting the option text.
- `pickDistractors` compares `translation_ru` literally — changing one would silently allow the other to be picked as a distractor.

The `hint` column is already wired up everywhere needed:
- Study quiz: QuizSession.tsx lines 817, 839, 882, 933, 1031
- List page: [frontend/app/dashboard/lists/[id]/page.tsx:113](frontend/app/dashboard/lists/[id]/page.tsx#L113)
- Word model: [backend/models.py:79](backend/models.py#L79) (`hint: Optional[str]`)

Matches the established disambiguation pattern from issues #76 (kuras/degalai) and #68 (namai/namie).

## Fix plan

1. SQL update on production DB — set hint on `rūbai` only:
   ```sql
   UPDATE word SET hint = 'разг.' WHERE id = 4207;
   ```
2. Verify:
   ```sql
   SELECT id, lithuanian, translation_ru, hint FROM word WHERE id IN (4178, 4207);
   ```
3. No backend or frontend code changes required — `hint` flows through the API serializer and is rendered in all relevant places.
4. Manual smoke: open `/dashboard/lists/157` — confirm the right column on the `rūbai` row shows `разг.`.

## Tests
1. Write a Playwright test at `frontend/tests/issue-89-rubai-colloquial-hint.spec.ts` modeled on `frontend/tests/issue-58-prosenelis-translation.spec.ts`:
   - Mock `/api/lists/157/study` with `rūbai` (id=4207, translation_ru="одежда", hint="разг.") and `drabužiai` (id=4178, translation_ru="одежда", hint=null), plus a few unrelated distractors.
   - Stage 1 flashcard for `rūbai`: assert `text=разг.` is visible alongside `одежда`.
   - Stage 3 (typed Russian → Lithuanian) for `rūbai`: type `одежда`, submit, assert success — proves the parenthetical is in `hint`, not `translation_ru`.
   - `drabužiai` card has no `разг.` hint.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #89 — added 'разг.' hint to rūbai to disambiguate from drabužiai. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 89;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-89-rubai-colloquial-hint.md`.
