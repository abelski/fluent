---
kind: bugfix
status: done
iteration: 1
max_iterations: 20
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #169 — /dashboard/lists/182/study

**Reported:** 2026-09-08 07:47:51
**Status:** open
**Description:** Функционал по сбору слова из слогов: не хватает функционала, чтобы собрать слово заново, если понимаешь что ошибся, или случайно нажал не на тот слог (translation: in the "assemble word from syllables" quiz, there's no way to redo/reset the assembly if the user realizes they made a mistake or accidentally tapped the wrong syllable)

## Root cause
The syllable-assembly quiz (stage `2a` in `frontend/app/dashboard/components/QuizSession.tsx`, rendered for `/dashboard/lists/[id]/study`) already lets a user tap a placed syllable back out of the "assembled row" (lines 1130-1140, `onClick={() => { if (answerState === 'unanswered') setAssembledSyllables((a) => a.filter((_, j) => j !== pos)); }}`), but two things make this feel like "no undo" exists to users. First, `handleStage2aTileClick` (lines 644-671) scores the attempt synchronously the instant the tile count reaches `assembly.tiles.length` (line 649 `if (next.length !== assembly.tiles.length) return;`), immediately flipping `answerState` to `'correct'`/`'wrong'`. That disables the tap-to-remove buttons (guarded by `answerState === 'unanswered'`), so a stray/misclicked *last* syllable locks in a wrong answer with zero chance to fix it before scoring — exactly the "случайно нажал не тот слог" complaint. Second, there is no bulk "clear/reset" control and the assembled tiles have no visual affordance (no icon, no hover/cursor styling) signalling they're tappable-to-remove, so even the mid-assembly undo that does exist is not discoverable — matching "не хватает функционала, чтобы собрать слово заново". (Suggested tier: sonnet/medium — contained to one component plus i18n files, but removing the instant-auto-submit-on-last-tile touches scoring/state-machine timing and requires updating existing Playwright assertions, so it's more than a trivial one-line UI tweak.)

## Fix plan
- [x] 1. In `frontend/app/dashboard/components/QuizSession.tsx`, add a "Clear" reset control to the stage `2a` block (around lines 1130-1160): a small text button, visible when `assembledSyllables.length > 0 && answerState === 'unanswered'`, that calls `setAssembledSyllables([])` — styled like the existing secondary text button used for `handleStage3Forgot` (`tr.study.didntKnow`, ~lines 1226-1232) for visual consistency.
- [x] 2. Add the new label's translations in `frontend/lib/i18n/types.ts`, `frontend/lib/i18n/en.ts`, and `frontend/lib/i18n/ru.ts` (sibling keys next to `assembleWord`/`assemblePhrase`, e.g. `tr.study.clearAssembly` — "Clear" / "Очистить").
- [x] 3. Improve discoverability of the already-working tap-to-remove behavior on assembled tiles (lines 1131-1139): add `cursor-pointer` and a subtle hover/active style (and optionally a small "×" glyph) so it visually reads as removable, not a static tag. CSS-only, no behavior change.
- [x] 4. Close the real gap — the final-tile instant-lock — by changing `handleStage2aTileClick` (lines 644-654) so reaching full tile count no longer scores instantly. Reveal an explicit "Проверить" (Check) button, reusing the pattern/label from stage 3 (`tr.common.check`, ~line 1221), that the user must press to submit; keep tap-to-remove enabled on all tiles (including the last) until Check is pressed. This is the piece that actually prevents a misclick from being scored, so treat it as required, not optional, for the fix to fully resolve the reported issue.
- [x] 5. Update `frontend/tests/syllable-assemble.spec.ts` for the new flow: `'assembling correctly advances to the typing stage'` and `'a wrong assembly reveals the answer and counts a mistake'` currently assume scoring happens on the last tile click — add a Check click before asserting the result. Add a test asserting the Clear button empties `assembled-row` and re-enables all pool tiles, and a test asserting a misplaced tile can be removed and corrected even after all slots are filled but before Check is pressed.

## Tests
- [x] 6. Run `npx playwright test syllable-assemble` (and the broader study-flow suite, e.g. `schedule-cards.spec.ts`, `issue-145-assemble-phrase.spec.ts`) from `frontend/` to confirm nothing else depends on the old auto-submit timing.
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #169 — Функционал по сбору слова из слогов: не хватает функционала, чтобы собрать слово заново, если понимаешь что ошибся, или случайно нажал не на тот слог. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 169;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-169-syllable-assembly-undo.md` → `plans/triage/implemented/IMPLEMENTED-issue-169-syllable-assembly-undo.md`).
