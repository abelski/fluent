# Issue #107 — /dashboard/lists/

**Reported:** 2026-06-01 10:38:33
**Status:** open
**Description:** "Būdvardžiai - 62 / 63 выучено, 1 в процессе. прошел урок раз 10 успешно в том числе и все равно одно слово в процессе. нужно добавить какойто более понятный юай который бы говорил пройден ли урок или слишком много ошибок и лучше повторить"
(User has 62/63 words known, 1 stuck in "learning" despite completing the lesson 10+ times. Requesting clearer UI feedback on whether a list is fully passed or still has words to practice.)

## Root cause

Two related problems:

**Bug — Incorrect batch demotion in `finishSession()`:**
In `QuizSession.tsx` lines 340–346, when >30% of session words have mistakes, ALL words the user just learned (including those answered correctly) are demoted back to `learning`. This means correctly-answered words keep getting bounced back — a word can stay in `learning` indefinitely even if the user consistently answers it correctly, because a single bad session with 3+ mistakes collaterally demotes everything.

**UX gap — No feedback on "stuck" words:**
The list card shows `1 в процессе` in amber but doesn't explain why or offer a targeted way to practice only those stuck words. The done screen and allKnown screen also don't surface this information.

## Fix plan

### Step 1 — Remove collateral word demotion (QuizSession.tsx)

**File:** `frontend/app/dashboard/components/QuizSession.tsx`

Remove the batch-demote block in `finishSession()`:
```typescript
// DELETE THIS BLOCK:
if (sessionMode === 'study' && mistakeWordIdsRef.current.size / totalWords > 0.3) {
  await Promise.all(
    Array.from(learnedWordIdsRef.current).map((wordId) => saveProgress(wordId, 'learning'))
  );
}
```
Individual `saveProgress(wordId, 'learning', true)` calls already happen per-mistake during the session — the batch demote just punishes correct words as collateral damage.

### Step 2 — Add `only_learning` query param to backend (words.py)

**File:** `backend/routers/words.py`

Add `only_learning: bool = Query(default=False)` to `get_study_words()`. When true:
- Return only `learning` words (skip new and known)
- Skip the quota increment (targeted drill, not a fresh session)

### Step 3 — Update study page to support only_learning mode (page.tsx)

**File:** `frontend/app/dashboard/lists/[id]/study/page.tsx`

- Update `loadWords(includeKnown, onlyLearning)` to append `&only_learning=true` when needed
- Fetch list progress (`/api/lists/{id}/progress`) and store `stuckWordCount`
- Pass `stuckWordCount` and `onRepeatLearning={() => loadWords(false, true)}` to `<QuizSession>`

### Step 4 — Show stuck-words CTA on done screen (QuizSession.tsx)

**File:** `frontend/app/dashboard/components/QuizSession.tsx`

Add optional props to `QuizSessionProps`:
```typescript
stuckWordCount?: number;
onRepeatLearning?: () => void;
```

On the done screen, when `stuckWordCount > 0 && onRepeatLearning && sessionMode === 'study'`, show an amber callout:
> "N слов всё ещё в процессе — потренируйте отдельно"
with a button "Повторить сложные слова" that calls `onRepeatLearning()`.

### Step 5 — Add "almost done" state to list cards (lists/page.tsx)

**File:** `frontend/app/dashboard/lists/page.tsx`

When `p.new === 0 && p.learning > 0` (all words touched, some stuck):
- Show an amber "N в процессе" indicator
- Add a "Сложные слова →" button linking to `/dashboard/lists/${list.id}/study?only_learning=1`

### Step 6 — Add translation keys

**Files:** `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts`

Add to `study` section:
- `stuckWordsHint` — "N слов всё ещё в процессе"
- `practiceStuck` — "Повторить сложные слова" / "Practice stuck words"

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #107 — Stuck learning word + unclear list completion UI. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 107;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
