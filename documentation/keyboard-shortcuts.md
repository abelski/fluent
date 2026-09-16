# Keyboard shortcuts in study sessions

## Number keys pick an option (feature #30)

`frontend/lib/useNumberKeys.ts` is the single implementation. Anywhere a session shows a short
list of buttons, `1`–`9` select them top to bottom:

| Surface | Keys |
| --- | --- |
| `QuizSession` stage 1 (flashcard self-evaluation) | `1` = «С трудом», `2` = «Легко» |
| `QuizSession` stages 2 and `2r` (multiple choice) | `1`–`4`, in the order the options render |
| `PhraseSession` stage-1 fill-word MCQ | `1`–`4`, same |

Call it from the component's top level and pass `null` for `onPick` to switch it off — several of
these surfaces sit *after* early returns (`QuizSession` derives `stage` only after the match-round
and done screens return), so the hook must read from `queue[0]` instead and cannot be called
conditionally.

### Decisions worth not re-deriving

- **The handlers already guard themselves.** `handleStage2Select` bails when `answerState !==
  'unanswered'`, `handleStage1Quality` bails inside `blockUntilRef`. The hook adds no gating of its
  own for those; don't duplicate it.
- **Digits typed into a field are never stolen.** The listener is on `window`, so it would otherwise
  eat the `1` a user types into a typing-stage answer box or into the feedback modal's textarea.
  It skips when `document.activeElement` is an input, a textarea or contenteditable.
- **Tile assembly (stage `2a`, phrase assembly) is excluded on purpose.** Order matters there and a
  letter-mode pool can exceed 9 tiles, so a number would be ambiguous rather than helpful.
- **Every option prints its number** — an `aria-hidden` span before the label, desktop only
  (`hidden sm:inline-block`). See "Option number badge" in the component library for the spec.
  `aria-hidden` is load-bearing: it keeps the button's accessible name equal to its label, so
  `getByRole('button', { name })` matchers and screen readers are unaffected.
- **The badge changes `textContent`**, though (`"1Легко"`), so any spec comparing raw button text
  must strip it. `stripBadge()` in `frontend/tests/helpers/studyFlow.ts` does that; the specs that
  needed it are `issue-147-…`, `issue-59-…` and `issue-152-…`. Specs that assert on the *label*
  were switched to `getByRole('button', { name, exact: true })`, including the `PROBES` entry in
  `studyFlow.ts` that detects the flashcard stage — it used to be `text="Легко"`.
