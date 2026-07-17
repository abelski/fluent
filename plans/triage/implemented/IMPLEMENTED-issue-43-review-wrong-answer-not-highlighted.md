# Issue #43 — /dashboard/review/

**Reported:** 2026-04-12 14:44:15
**Status:** open
**Description:** Когда в режиме «напомни что я мог» забыть я напечатал ответ в текст поле и нажал энтер ошибка не подсвечиватеся (In spaced-repetition review mode, after typing a wrong answer and pressing Enter, the error is not highlighted — the wrong-answer state is immediately dismissed)

## Root cause

Race condition in `frontend/app/dashboard/components/QuizSession.tsx`.

When Enter is pressed in the input field:
1. `input.onKeyDown` → `handleStage3Submit()` sets `blockUntilRef.current = Date.now() + 300` and calls `setAnswerState('wrong')`
2. React batches the state update — does NOT run effects synchronously
3. The keydown event bubbles; React commits the state, attaches the global `window` keydown dismiss listener
4. On key-repeat or fast subsequent Enter presses (within ~300 ms), the dismiss listener fires and calls `handleStage3Dismiss()`, advancing the queue before the user sees the red highlight

The block duration of 300 ms is too short. More critically, `blockUntilRef.current` is set *inside* the submit handler rather than at the top of `onKeyDown`, creating a tiny window where the block is not yet set when the event propagates.

## Fix plan

**File:** `frontend/app/dashboard/components/QuizSession.tsx`

**Change A — move block-setting to `onKeyDown` on the input (line ~753):**

Current:
```tsx
onKeyDown={(e) => { if (e.key === 'Enter') handleStage3Submit(); }}
```

New:
```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    blockUntilRef.current = Date.now() + 600;
    handleStage3Submit();
  }
}}
```

**Change B — increase block duration inside `handleStage3Submit` (line ~496):**

Current:
```ts
blockUntilRef.current = Date.now() + 300;
```

New:
```ts
blockUntilRef.current = Date.now() + 600;
```

Moving the block-set to `onKeyDown` is the critical fix — it ensures the guard is in place before any React state changes or effect re-registrations occur. The 600 ms duration gives enough time to prevent accidental dismissal from key-repeat while remaining imperceptible to deliberate Enter-to-dismiss.

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #43 — wrong answer not highlighted when pressing Enter in review mode. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 43;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
