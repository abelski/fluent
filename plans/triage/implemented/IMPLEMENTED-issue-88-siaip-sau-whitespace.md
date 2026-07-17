# Issue #88 — /dashboard/lists/161/study

**Reported:** 2026-05-21 04:08:13
**Status:** open
**Description:** Šiap sau проблемы с проверкой из-за пробела

The user reports that "Šiaip sau" (word id=3167 in list 161 — Gramatikos žodžiai) has validation problems because of the space.

## Root cause

The Lithuanian answer-validation for the Stage 3 typed input in list study lives client-side in [frontend/app/dashboard/components/QuizSession.tsx](frontend/app/dashboard/components/QuizSession.tsx):

- `normalizeLt()` (lines 72–78) lowercases and strips diacritics, but **does not normalize internal whitespace**.
- `checkAnswer()` (lines 94–103) compares normalized strings with `===` on `medium`/`hard` complexity. On `easy` it uses Levenshtein with a tight threshold (`max(1, 15% of length)` → for `"šiaip sau"` length 9 → threshold 1, so one extra space still fails).
- `handleStage3Submit()` (line 595) calls `checkAnswer(typedAnswer.trim(), target, complexity)`. The outer `.trim()` removes leading/trailing whitespace, but **multiple internal spaces are preserved**.

For multi-word answers like `"šiaip sau"`, any of `"šiaip  sau"` (double space), `"šiaip\tsau"`, or extra inter-word whitespace fails purely on whitespace grounds, which is what the user reports ("из-за пробела"). `parseForms()` (line 105) only splits on `,/`, so multi-word Lithuanian answers are correctly kept as one target — the issue is purely the whitespace comparison.

Backend (`backend/routers/words.py`) does not perform answer checking for list study; the fix is frontend-only (mirroring issues #50 and #86).

## Fix plan

1. **File:** [frontend/app/dashboard/components/QuizSession.tsx](frontend/app/dashboard/components/QuizSession.tsx)
2. **Function:** `normalizeLt` (lines 72–78). Update to:
   - Add `.normalize('NFC')` first (parity with grammar fix from issue #50).
   - Append `.replace(/\s+/g, ' ').trim()` at the end to collapse internal whitespace runs to a single space and trim ends. This makes `"šiaip  sau"`, `"šiaip\tsau"`, `" šiaip sau "` all normalize to `"siaip sau"` and match the stored target.
3. **Also update line 612**'s `isExact` check (`typedAnswer.trim().toLowerCase() === target.toLowerCase()`) to apply the same whitespace collapse, so the near-miss diff popup doesn't trigger on a purely whitespace-different but otherwise exact answer. Suggested helper: extract a `collapseWs(s)` and apply it on both sides.
4. **Other typed-answer call sites** automatically benefit — syllable-drill (lines 664–667) already uses `normalizeLt`.
5. **No backend changes needed** — answer checking is purely client-side for list study, mirroring issue #86's PhraseSession fix scope.

## Tests
1. Write a Playwright test at `frontend/tests/issue-88-study-whitespace.spec.ts` modeled on `frontend/tests/issue-50-grammar-case-insensitive.spec.ts`. Two tests:
   - **Pure-logic test** (no backend required) — `page.evaluate` runs an inlined copy of the patched `normalizeLt` and asserts:
     - `normalizeLt("šiaip  sau") === normalizeLt("šiaip sau")` is true
     - `normalizeLt(" šiaip sau ") === normalizeLt("šiaip sau")` is true
     - `normalizeLt("šiaip\tsau") === normalizeLt("šiaip sau")` is true
   - **End-to-end:** navigate to `/dashboard/lists/161/study` with mocked API, advance to Stage 3 for word `šiaip sau`, type `"šiaip  sau"` (double space), press Enter, assert the correct state class appears and no near-miss banner shows.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #88 — typed answers with extra/double spaces (e.g. 'šiaip  sau') now accepted in study. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 88;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-88-siaip-sau-whitespace.md`.
