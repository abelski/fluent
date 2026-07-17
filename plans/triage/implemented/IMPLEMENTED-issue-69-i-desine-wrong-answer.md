# Issue #69 — /dashboard/lists/161/study/

**Reported:** 2026-05-10 13:38:44
**Status:** open
**Description:** Į dešinę - выдает ошибку при правильном написании

## Root cause
Same root cause as issue #70 (į kairę infinite loop). The words "į dešinę" and "į kairę" both start with a single-character Lithuanian preposition "į" followed by a space and the rest of the word.

The `splitSyllables()` function in `QuizSession.tsx` treats "į" (a vowel) as the first syllable boundary, producing a first syllable of `"į "` (with a trailing space). When a stage-3 typing mistake triggers the stage 3s (syllable drill), the `targetSyllable` stored on the card is `"į "` (with space).

In `handleStage3sSubmit()`, the comparison is:
```ts
normalizeLt(syllableTyped.trim()) === normalizeLt(syllable)
syllableTyped.trim().toLowerCase() === syllable.toLowerCase()
```
The user types `"į"` (without trailing space). `syllableTyped.trim()` = `"į"` but `syllable` = `"į "` (space not trimmed). Neither comparison passes, so the correct answer is marked wrong.

## Fix plan
1. **File:** `frontend/app/dashboard/components/QuizSession.tsx`
2. **Function:** `handleStage3sSubmit()` (around line 648)
3. **Change:** trim `syllable` in both comparisons:
   ```ts
   const isCorrect =
     normalizeLt(syllableTyped.trim()) === normalizeLt(syllable.trim()) ||
     syllableTyped.trim().toLowerCase() === syllable.trim().toLowerCase();
   ```
4. Also trim syllable in the display logic (lines ~987-990) so the blank input width and before/after text are based on the trimmed syllable:
   ```ts
   const syllable = (card.targetSyllable ?? '').trim();
   ```
5. Rebuild the frontend.

## Tests
1. Write a Playwright test in `frontend/tests/` that studies list 161, triggers a wrong answer on "į dešinę" at stage 3, then correctly fills in the syllable "į" in stage 3s and confirms no error.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #69 — į dešinę syllable drill fix. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 69;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
