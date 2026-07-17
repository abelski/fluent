# Issue #70 — /

**Reported:** 2026-05-10 17:22:47
**Status:** open
**Description:** Поймал ошибку которая привела к зацикливанию: слово į kairę. Мне предлагает вставить пропущенный слог "_kairę". Я вставляю į. Приложение считает что я ошибся (думаю из за удаления пробелов в начале и конце ввода). И дальше сессия продолжается в следующем цикле: 1 - новое слово, 2 - į kairę (где надо вставить į и тебе его считают за ошибку), 3 - написать į kairę целиком.

## Root cause
`splitSyllables("į kairę")` produces `["į ", "kai", "rę"]` — the first syllable includes a trailing space because the function splits on vowel boundaries without stripping spaces. The `targetSyllable` stored in the stage 3s card is `"į "` (with space).

In `handleStage3sSubmit()`, the check is:
```ts
normalizeLt(syllableTyped.trim()) === normalizeLt(syllable)
syllableTyped.trim().toLowerCase() === syllable.toLowerCase()
```
The user types `"į"`. `syllableTyped.trim()` = `"į"`. But `syllable` = `"į "` (untrimmed). Neither check passes → answer marked wrong → `handleStage3sDismiss()` is called → re-queues `[3s, stage3]` → user is forced into the loop indefinitely.

## Fix plan
1. **File:** `frontend/app/dashboard/components/QuizSession.tsx`
2. **Function:** `handleStage3sSubmit()` (~line 653)
3. **Change:** trim `syllable` in both comparison branches:
   ```ts
   const isCorrect =
     normalizeLt(syllableTyped.trim()) === normalizeLt(syllable.trim()) ||
     syllableTyped.trim().toLowerCase() === syllable.trim().toLowerCase();
   ```
4. **Also fix the display** in the stage 3s render block (~line 986):
   ```ts
   const syllable = (card.targetSyllable ?? '').trim();
   ```
   This ensures the blank box width and the surrounding text (`before`/`after`) use the trimmed syllable, avoiding a blank that shows an extra space.
5. Rebuild frontend and restart local server.

Note: This fix also resolves issue #69 (į dešinę same bug).

## Tests
1. Write a Playwright test in `frontend/tests/` that: navigates to a list containing "į kairę" (e.g. list 161), forces a wrong answer on stage 3, confirms the stage 3s drill appears, types "į" in the blank, and confirms it is accepted as correct (no infinite loop).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #70 — į kairę infinite loop (syllable drill space bug) fixed. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 70;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
