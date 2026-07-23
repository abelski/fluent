# Issue #147 — /dashboard/lists/294/study

**Reported:** 2026-07-18 08:50:43
**Status:** open
**Also resolves:** #107 (on hold) — "нужно добавить какойто более понятный юай который бы говорил пройден ли урок или слишком много ошибок и лучше повторить". The pass/fail banner below is exactly that request.

## Decisions (confirmed with user, 2026-07-23)
- The outcome emoji must reflect the result: **😊 when passed, 😢 when not**. Today's 🎉 is hardcoded and shows even on a bad session.
- The screen must state **explicitly, in words**, whether the lesson was passed — not leave it to be inferred from numbers.
- Three tiles, with the third hidden when zero (so a clean lesson still shows two).
**Description:** Сессия завершена! / Верно 10 из 10 — 10 Верно, 6 Ошибок — "Не страшно! Попробуйте пройти урок ещё раз — так слова запомнятся гораздо лучше 💪" — непонятно урок пройден успешно или нет.

(The completion screen headline says 10 of 10 correct, but a tile says 6 mistakes and the copy is failure-flavored. The user cannot tell whether the lesson was passed.)

## Root cause

The done screen is `QuizSession`'s completion view at [QuizSession.tsx:716-759](frontend/app/dashboard/components/QuizSession.tsx#L716-L759), rendered for the study route via [study/page.tsx:154-162](frontend/app/dashboard/lists/[id]/study/page.tsx#L154-L162) (also reused by [review/page.tsx](frontend/app/dashboard/review/page.tsx)). The backend is not implicated — `GET /api/lists/{id}/study` and `POST /api/words/{word_id}/progress` ([words.py:545](backend/routers/words.py#L545)) return no summary numbers; every figure is computed client-side.

The three displayed numbers live in **different, overlapping domains**, so they are not comparable:

1. `correctWords` ([QuizSession.tsx:224](frontend/app/dashboard/components/QuizSession.tsx#L224), incremented only at [:625-628](frontend/app/dashboard/components/QuizSession.tsx#L625-L628)) = unique words **eventually mastered**. A word failed three times and finally typed right still counts.
2. `mistakeWordCount` ([:234](frontend/app/dashboard/components/QuizSession.tsx#L234)) = unique words that **stumbled at least once**. Incremented at four sites — [:386](frontend/app/dashboard/components/QuizSession.tsx#L386) (timer expiry), [:509](frontend/app/dashboard/components/QuizSession.tsx#L509), [:551](frontend/app/dashboard/components/QuizSession.tsx#L551), [:608](frontend/app/dashboard/components/QuizSession.tsx#L608) — each correctly guarded by `if (!mistakeWordIdsRef.current.has(id))`, so it stays in lockstep with `mistakeWordIdsRef.current.size` and never double-counts a word. The number itself is right; it is only the *pairing* with `correctWords` that misleads.
3. `totalWords` ([:222](frontend/app/dashboard/components/QuizSession.tsx#L222), set at [:276](frontend/app/dashboard/components/QuizSession.tsx#L276)) = words in the lesson.

Sets 1 and 2 are neither disjoint nor complementary. In a thorough lesson every word is re-queued until typed correctly (`buildRetryCards`, [:395-456](frontend/app/dashboard/components/QuizSession.tsx#L395-L456)), so the normal end state is `correctWords === totalWords` with `mistakeWordCount` counting whichever words stumbled en route — exactly the reported 10/10 + 6 mistakes. Each number is individually right; the layout implies `correct + errors = total`, which is false. The "Ошибок / Errors" label also reads as *attempts*, reinforcing the misreading.

The discouraging message comes from [:717](frontend/app/dashboard/components/QuizSession.tsx#L717):

```
const highMistakes = sessionMode === 'study' && totalWords > 0 && mistakeWordCount / totalWords > 0.3;
```

rendered at [:739-741](frontend/app/dashboard/components/QuizSession.tsx#L739-L741) with `tr.common.relearnSuggestion` ([ru.ts:11](frontend/lib/i18n/ru.ts#L11), [en.ts:11](frontend/lib/i18n/en.ts#L11)). 6/10 = 0.6 > 0.3, so the failure nudge fires even though 100% of the lesson was mastered. There is no pass/fail state on this screen at all — unlike the grammar result screen, which has one ([grammar/page.tsx:789-816](frontend/app/dashboard/grammar/page.tsx#L789-L816): `passed = scorePct > 0.75`, explicit banner, 🎉 vs 📚).

Two secondary contributors to fix in the same pass:

- **Not-mastered words vanish from the summary.** When retries are exhausted a word is marked done but never enters `correctWordIdsRef` ([:530-533](frontend/app/dashboard/components/QuizSession.tsx#L530-L533), [:571-574](frontend/app/dashboard/components/QuizSession.tsx#L571-L574), [:647-650](frontend/app/dashboard/components/QuizSession.tsx#L647-L650)), so `correctWords < totalWords` can happen with no on-screen explanation.
- **Quick-mode early abort is invisible.** `finishSession()` is called mid-queue when ≥25% of words have mistakes ([:538](frontend/app/dashboard/components/QuizSession.tsx#L538), [:579](frontend/app/dashboard/components/QuizSession.tsx#L579), [:662](frontend/app/dashboard/components/QuizSession.tsx#L662)), yet the screen still reads "N of totalWords" and looks like a completed lesson.

## Fix plan

1. **Introduce one coherent outcome model in `QuizSession`.** Keep the existing refs but derive four consistent numbers on the done screen ([:716](frontend/app/dashboard/components/QuizSession.tsx#L716)):
   - `mastered = correctWordIdsRef.current.size` (today's `correctWords`)
   - `stumbled = |correctWordIds ∩ mistakeWordIds|` — mastered, but after a mistake
   - `firstTry = mastered − stumbled`
   - `notMastered = totalWords − mastered`

   Invariant: `firstTry + stumbled + notMastered === totalWords`. Compute the intersection in a derived `useMemo`; do not add new state that can drift.
2. **Add an explicit pass/fail banner and make the emoji conditional.** `passed = notMastered === 0 && !endedEarly`. Replace the hardcoded 🎉 at [:723](frontend/app/dashboard/components/QuizSession.tsx#L723) with **😊 when passed, 😢 when not**. Directly under it, state the outcome in words — "Урок пройден" / "Lesson passed" vs "Урок не пройден" / "Lesson not passed" + hint. The user must never have to infer pass/fail from the numbers. Mirror the structure of [grammar/page.tsx:802-816](frontend/app/dashboard/grammar/page.tsx#L802-L816) for app-wide consistency, but use the 😊/😢 pair rather than grammar's 🎉/📚.
3. **Make the headline match the tiles.** Keep `tr.common.correctOf` but feed it `mastered`/`totalWords`. Replace the two tiles at [:729-738](frontend/app/dashboard/components/QuizSession.tsx#L729-L738) with three: `firstTry` ("с первого раза", emerald), `stumbled` ("со второй попытки", amber), `notMastered` ("не выучено", rose — **hidden entirely when 0**, so a clean lesson still renders two tiles and the layout doesn't shift). No tile may use a different denominator than the headline — this is the core of the fix. Retire `mistakeWordCount` from the done screen altogether; it remains only as the quick-mode threshold input.
4. **Rewrite message selection** at [:717](frontend/app/dashboard/components/QuizSession.tsx#L717):
   - `notMastered > 0 || endedEarly` → `tr.common.relearnSuggestion` (existing retry nudge)
   - `notMastered === 0 && stumbled > 0` → new `tr.common.masteredWithMistakes` ("Урок пройден! N слов далось не сразу — они вернутся в повторении")
   - `notMastered === 0 && stumbled === 0` → new `tr.common.perfectSession`

   Delete the `mistakeWordCount / totalWords > 0.3` heuristic — it is the direct cause of the contradictory copy.
5. **Surface the quick-mode early exit.** Add an `endedEarly` flag set by the three `finishSession()` calls at [:538](frontend/app/dashboard/components/QuizSession.tsx#L538), [:579](frontend/app/dashboard/components/QuizSession.tsx#L579), [:662](frontend/app/dashboard/components/QuizSession.tsx#L662) (pass it through `finishSession`; while there, clean up its stale `useCallback` deps at [:330](frontend/app/dashboard/components/QuizSession.tsx#L330) — `sessionMode`/`totalWords`/`saveProgress` are unused). When `endedEarly`, show the not-passed banner plus a line explaining the lesson was cut short, and make the primary button "Пройти урок заново" instead of "Ещё один урок" ([:743-748](frontend/app/dashboard/components/QuizSession.tsx#L743-L748)).
6. **Keep review mode sane.** `sessionMode === 'review'` currently suppresses the message entirely. Show the same tiles and banner in review, but gate only the retry nudge on `sessionMode === 'study'` — review has no fail state.
7. **Add i18n keys** to the `common` block in all three files: [types.ts:11-26](frontend/lib/i18n/types.ts#L11-L26), [ru.ts:11-22](frontend/lib/i18n/ru.ts#L11-L22), [en.ts:11-22](frontend/lib/i18n/en.ts#L11-L22). New: `lessonPassed`, `lessonNotPassed`, `lessonNotPassedHint`, `endedEarly`, `firstTryLabel`, `stumbledLabel`, `notMasteredLabel`, `masteredWithMistakes`, `perfectSession`. Keep `relearnSuggestion`. Match the RU/EN tone of the existing `tr.grammar.passed` / `failedScore` / `failedHint`. Every string must land in **both** `ru.ts` and `en.ts` and be declared in `types.ts`, or the build fails — and per issue #98/#104/#125 history, untranslated leftovers are a recurring user complaint in this app.
8. **Follow-up, do not bundle:** [PhraseSession.tsx:537-548](frontend/app/dashboard/components/PhraseSession.tsx#L537-L548) has the same class of inconsistency but counts mistakes *per attempt* ([:334](frontend/app/dashboard/components/PhraseSession.tsx#L334), [:440](frontend/app/dashboard/components/PhraseSession.tsx#L440), [:871](frontend/app/dashboard/components/PhraseSession.tsx#L871), [:977](frontend/app/dashboard/components/PhraseSession.tsx#L977), [:1008](frontend/app/dashboard/components/PhraseSession.tsx#L1008)). Apply the same model once this lands.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue — suggested `frontend/tests/issue-147-session-summary-consistency.spec.ts`, following the existing `issue-NNN-*.spec.ts` convention. Drive a short list where some words are answered wrong then right, and assert: (a) the tiles sum to the headline total, (b) the "passed" banner shows when all words were eventually mastered despite mistakes, (c) `relearnSuggestion` is *not* rendered in that case, (d) the not-passed banner and nudge do appear when quick mode aborts early.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #147 — session summary says 'Верно 10 из 10' but also '6 Ошибок' with a discouraging message; unclear whether the lesson was passed. This also covers #107. Mark both as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id IN (147, 107);` and report success.
2. Move this plan file to `plans/triage/implemented/IMPLEMENTED-issue-147-session-summary-contradiction.md`.
3. Move `plans/triage/hold/issue-107-stuck-learning-word-ui.md` to `plans/triage/implemented/IMPLEMENTED-issue-107-stuck-learning-word-ui.md`.

Note: #107 is currently `onhold` in the DB and its plan file sits in `hold/`. Both stay put until the fix actually ships — no DB write is needed before then.
