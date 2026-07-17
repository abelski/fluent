# Issue #144 — /dashboard/phrases/lists/2/study

**Reported:** 2026-07-17 10:10:09
**Status:** open
**Description:** думаю гдето надо добавить небольшую кнопку забыл (add a small "I forgot" button somewhere in the phrase study session)

## Root cause
Not a bug — a UX gap in the shared `PhraseSession` component (`frontend/app/dashboard/components/PhraseSession.tsx`), which serves `/dashboard/phrases/lists/[id]/study`, `/dashboard/phrases/[id]/study`, and `/dashboard/phrases/review`.

The flow per phrase: stage 0 intro has escape hatches ("Сложно" → quality 2, "Запомнил" → quality 5). Stage 2 (type full phrase) has a "Показать ответ" reveal toggle. But **the stage 1 "type the blanked word" step (~lines 840–913) has no way out**: if the user forgot the word, they must type a wrong guess just to see the answer. Stage 2's "Показать ответ" also silently lets the user copy the answer and be scored quality 5, so an honest "Забыл" that records a mistake is the right mechanic.

Precedent: word study (`QuizSession.tsx`, `handleStage1Quality`) has a "Не знал" self-assessment button (i18n key `didntKnow`, SM-2 quality 1).

**No backend change needed.** `POST /api/me/phrase-lists/phrases/{phrase_id}/progress` (`update_my_phrase_progress` in `backend/routers/phrase_lists.py`) already accepts quality 0–5; the wrong-answer path already sends `quality: 1` (+ `mistake_word`), which records the mistake, blocks `lesson_stage` advancement, and resets the SM-2 interval (`_apply_sm2_phrase` in `backend/routers/phrases.py`). A "Forgot" button drives the existing wrong path deliberately — scoring stays server-side.

## Fix plan
1. **i18n** — add `forgotBtn` key to the `phraseSession` block in `frontend/lib/i18n/types.ts`, `ru.ts` (`'Забыл'`), `en.ts` (`'I forgot'`).
2. **PhraseSession stage 1 type step** (`!typeResult` block, ~lines 861–878): add a small secondary "Забыл" button (gray `bg-gray-100` styling, under the input row) with `data-testid="forgot-btn"`. On click: `setTypeResult('wrong')` (reuses existing wrong-answer UI revealing `phrase.blank_word` → syllable challenge → `advanceQueue(1, phrase.blank_word)` → gap_retry ×2 + full_retake re-queue); add phrase to `mistakePhraseIdsRef` and bump `mistakeCount` (same as `handleWordSubmit` wrong branch and the timer-timeout path at ~lines 292–312).
3. **PhraseSession stage 2** (`!typeResult` block, ~lines 945–970): add the same small "Забыл" button next to "Показать ответ" / "Проверить". On click: `setTypeResult('wrong')` + mistake-counter update, reusing the existing wrong path (CharDiff panel → syllable challenge → `advanceQueue(1)`). Guard: if `typeInput.trim()` is empty, show just the correct answer (`phrase.text`) instead of `CharDiff` so it doesn't render an all-red diff.
4. **Backend** — no change; verify with existing tests in `backend/tests/test_phrase_lists.py`.
5. Keep the button visually small (per the report), disabled while `saving`; do not touch the Enter/Space key handler. Never edit `frontend/out/` (build output).

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (pattern: `frontend/tests/issue-140-hard-button-feedback.spec.ts`; phrase-session helpers in `frontend/tests/phrases.spec.ts`): start a custom-list study session, reach the stage 1 type step, click `forgot-btn`, assert the correct word is revealed, the mistake counter increments, and the phrase is re-queued. Cover stage 2's forgot button similarly.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #144 — думаю гдето надо добавить небольшую кнопку забыл. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 144;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-144-forgot-button-phrase-study.md` → `plans/triage/implemented/IMPLEMENTED-issue-144-forgot-button-phrase-study.md`).
