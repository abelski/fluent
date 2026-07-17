# Issue #140 — /dashboard/phrases/lists/2/study

**Reported:** 2026-07-16 14:25:05
**Status:** open
**Description:** когда я нажимаю кнопку сложно какоето поведение не очень понятное
(Translation: "when I press the 'hard' button, some kind of unclear behavior happens")

## Root cause

Not specific to custom phrase lists — this is pre-existing shared behavior in
`frontend/app/dashboard/components/PhraseSession.tsx` (predates the "Мои списки"
feature; the user simply hit it for the first time while dogfooding the new
custom-lists study flow, same component as admin-program study).

Stage-0 intro card wires the buttons as:

```tsx
<button onClick={() => advanceQueue(2)} ...>{tr.phraseSession.hardBtn}</button>   // "Сложно"
<button onClick={() => advanceQueue(5)} ...>{tr.phraseSession.gotItBtn}</button>  // "Запомнил →"
```

Tracing `advanceQueue(2)` (lines ~377-456):

1. `recordProgress(phrase.id, { quality: 2, stage_completed: 0 })` fires with **no
   visible UI feedback** — no toast, no interstitial.
2. `quality < 3` → phrase is not counted toward `phrasesDone`; only `mistakeCount`
   ticks up (a small `✗ 1` in the header, easy to miss).
3. Requeue logic (~412-436): since `lesson_stage === 0` (not `1`), the richer
   differentiated retry branch is skipped. It falls into the generic branch:
   ```tsx
   } else if (quality < 3 && current.retries < 2) {
     const insertAt = Math.min(currentIdx + 1, next.length);
     next.splice(insertAt, 0, { phrase, retries: current.retries + 1, mode: 'normal' });
   }
   ```
   The **same phrase object** is reinserted as the very next queue item.
4. `phrase.lesson_stage` is a static field from the initial batch fetch (never
   mutated client-side), so the requeued card is still stage 0.
5. Net effect: user taps "Hard" → nothing explains what happened → the *exact
   same intro card* (same text, same translation, same buttons) reappears
   immediately as the next card. Indistinguishable from "nothing happened" or a
   glitch, since there's no acknowledgment screen (unlike wrong answers
   elsewhere in the component, which show a red "Not quite" box before
   continuing).

**Secondary correctness bug found in the same investigation:** if a user presses
"Hard" 3 times on one phrase, `current.retries` caps at 2 and the requeue stops,
but `donePhrasesRef`/`phrasesDone` is never incremented for that phrase (only the
`quality >= 3` and `full_retake` branches mark a phrase done). The progress bar
(`phrasesDone / phrases.length`) can then never reach 100% for that session.

Backend (`backend/routers/phrase_lists.py` / `backend/routers/phrases.py`) is
confirmed **not** the cause — both correctly refuse to advance `lesson_stage`
when `quality < 3`, consistent with the frontend; no change needed there.

## Fix plan

1. `frontend/app/dashboard/components/PhraseSession.tsx` — add a brief
   acknowledgment when "Hard" is pressed at stage 0 (mirror the existing
   wrong-answer feedback pattern, e.g. the `mcqResult === 'wrong'` block): show
   a short message ("Хорошо, покажем эту фразу ещё раз" / "OK, we'll show this
   phrase again soon") for ~600-800ms before advancing, so the tap has visible
   confirmation instead of an instant, unexplained repeat.
2. `frontend/app/dashboard/components/PhraseSession.tsx` — space out the requeue
   so the same phrase doesn't reappear as the literal next card: change
   `insertAt` in the generic retry branch from `currentIdx + 1` to something
   further back (e.g. `currentIdx + 3`, clamped to queue length).
3. `frontend/app/dashboard/components/PhraseSession.tsx` — fix the progress
   undercount: when the retry cap is hit (`quality < 3 && current.retries >= 2`),
   explicitly mark the phrase done via `donePhrasesRef`/`setPhrasesDone` (same
   pattern as the `full_retake` branch) so the progress bar and end-of-session
   stats stay accurate even for phrases always marked "Hard".
4. Optional: `frontend/lib/i18n/ru.ts` / `en.ts` — clarify the "Hard" button
   copy/tooltip so first-time users understand its effect before pressing it.

Implement steps 1 and 3 first (visible feedback + the unambiguous progress-count
fix) as the core resolution; step 2 is a stronger but more invasive UX
improvement to include if desired.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #140 — когда я нажимаю кнопку сложно какоето поведение не очень понятное. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 140;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-140-hard-button-confusing-behavior.md` → `plans/triage/implemented/IMPLEMENTED-issue-140-hard-button-confusing-behavior.md`).
