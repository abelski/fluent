# Issue #105 — /dashboard/lists/207

**Reported:** 2026-05-30 09:06:48
**Status:** open
**Description:** "Не могу пройти слова в этой группе ещё раз. Сделал ошибки в 9 словах!!! А уровень все равно поместился как пройденный И я его больше не могу открыть для прохождения."
(User made mistakes in 9 words but the list was still marked as passed, and they can no longer open it for re-study.)

## Root cause

Two related bugs:

**Bug 1 — allKnown screen is a dead end.**
In `study/page.tsx`, when backend returns `all_known: true` (fires when all words in the list have status=`known`), the UI renders two buttons: "Advance to next star level" and "Back to lists". There is NO way to re-study the list. User is locked out entirely.

**Bug 2 — Word demotion logic is unreliable.**
In `QuizSession.tsx`, `finishSession()` demotes words back to `learning` via fire-and-forget `fetch()` calls (not awaited). If the user navigates before these writes land in the DB, the next `/study` call reads stale data and returns `all_known: true` incorrectly. Additionally, the 30% mistake threshold for triggering demotion may allow edge cases where high-mistake sessions don't demote as expected.

## Fix plan

### Fix A (Priority 1) — Add "Re-study" button to allKnown screen

**Files:**
- `frontend/app/dashboard/lists/[id]/study/page.tsx` — add button and state
- `backend/routers/words.py` — add `include_known` query param

**Steps:**
1. In `words.py`, add `include_known: bool = Query(default=False)` to `get_study_words()`.
2. Change the `all_known` early return to only fire when `include_known` is False.
3. When `include_known=True`, serve `known_words` directly as the session content.
4. In `study/page.tsx`, add `forceRepeat` state. In the `allKnown` screen block (lines 114–145), add a third button "Повторить снова" that calls `loadWords()` with `?include_known=true`.

### Fix B (Priority 2) — Make demotion saves awaited

**File:** `frontend/app/dashboard/components/QuizSession.tsx`

**Steps:**
1. Change `saveProgress` to return the `fetch()` Promise instead of `void`.
2. In `finishSession()`, collect all demotion `saveProgress` calls and `await Promise.all(...)` before transitioning to MatchRound/Done screen.
3. This eliminates the race condition where demotion writes haven't landed when the next study session load fires.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #105 — User locked out of list after completing with mistakes. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 105;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
