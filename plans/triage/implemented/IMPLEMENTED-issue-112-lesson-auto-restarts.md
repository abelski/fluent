# Issue #112 — /dashboard/lists/187/study

**Reported:** 2026-06-03 10:44:43
**Status:** open
**Description:** Когда заканчивается урок автоматически начинается новый и я не успеваю понять какой у меня результат.

## Root cause

In `QuizSession.tsx` line 713, the `onDone` callback passed to `MatchRound` is:

```tsx
onDone={() => { setShowMatchRound(false); setDone(true); router.refresh(); }}
```

`router.refresh()` causes the parent `QuizPage` (`study/page.tsx`) to re-execute its `useEffect([loadWords, router])` (lines 56–59), which calls `loadWords()`. This fetches a new batch of words and calls `setWords(newWords)`. This triggers the `useEffect([words])` in `QuizSession` (lines 282–299), which resets `done = false` and initializes a new quiz queue — all before the user sees the results screen.

The cascade:
1. MatchRound finishes → `onDone` fires → `setDone(true)` + `router.refresh()`
2. `router.refresh()` → `loadWords()` → `setWords(newWords)` → `useEffect([words])` → `setDone(false)` + new queue
3. Results screen is immediately replaced by a new quiz

## Fix plan

1. **Remove `router.refresh()` from the `onDone` handler** in `frontend/app/dashboard/components/QuizSession.tsx` line 713:
   ```tsx
   // Before:
   onDone={() => { setShowMatchRound(false); setDone(true); router.refresh(); }}
   // After:
   onDone={() => { setShowMatchRound(false); setDone(true); }}
   ```

2. **Add `router.refresh()` to the "One more lesson" button** (line ~748) so server-side state still refreshes at the right moment (when the user explicitly requests another lesson):
   ```tsx
   // Before:
   <button onClick={onRepeat}>
   // After:
   <button onClick={() => { router.refresh(); onRepeat(); }}>
   ```

This ensures:
- The done/results screen is shown after every lesson completes
- Server data is still refreshed, just when the user clicks "One more lesson" rather than automatically
- The "Back to lists" button already triggers a route change which naturally refreshes

**Files to modify:**
- `frontend/app/dashboard/components/QuizSession.tsx` — lines 713, ~748

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #112 — lesson auto-restarts without showing results. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 112;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-112-lesson-auto-restarts.md` → `plans/triage/implemented/IMPLEMENTED-issue-112-lesson-auto-restarts.md`).
