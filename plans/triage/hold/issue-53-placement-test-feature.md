# Issue #53 — / (landing page)

**Reported:** 2026-04-15 19:59:29
**Status:** open
**Description:** Было бы классно иметь возможность пройти тест и переходить сразу к уровням, которые тебя интересуют. С уровнем Б2 мотивации кликать 500 слов для каждого уровня не будет :) (Would be great to take a placement test and jump to relevant levels. B2 users won't want to click through 500 words per level)

## Root cause
Feature request — no placement test exists. Users who already know Lithuanian at an intermediate/advanced level must manually mark all lower-level words as known before accessing higher-level vocabulary, which is tedious.

This is a significant new feature that would require:
- A placement quiz flow (sample questions from each CEFR level)
- Logic to auto-mark words as known based on quiz results
- UI integration into the onboarding/dashboard flow

## Fix plan
1. Design a placement test flow:
   - Sample N words from each CEFR level (A1, A2, B1, B2)
   - Show a quick quiz (e.g., 10-20 words) with multiple choice
   - Based on score per level, bulk-mark all lower-level words as known
2. Add a backend endpoint `POST /api/me/placement-test` that accepts results and bulk-updates `user_word_progress`.
3. Add frontend page `/dashboard/placement-test` with the quiz flow.
4. Add entry point from the dashboard or programs page.

This is a **medium-complexity feature**. Consider implementing as a future milestone.

## Tests
1. Write Playwright tests for the placement test flow.
2. Rebuild the frontend and restart the local server.
3. Run tests and confirm they pass.
4. Leave the local server running for manual verification.

## Confirm resolution
Ask the user: "Issue #53 — Placement test feature implemented. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 53;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
