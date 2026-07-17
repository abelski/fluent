# Issue #137 — /dashboard/grammar/

**Reported:** 2026-07-03 20:53:02
**Status:** open
**Description:** Čia yra muziejai

## Root cause
Grammar sentence id 183 (case_index 8, "Именительный мн.ч." / nominative plural), display `Čia yra muziej___.`, currently expects `answer_ending='ūs'` / `full_word='muziejūs'`. This is wrong: `muziejus` (museum) is a regular noun and its correct nominative plural is `muziejai` (the user's report — "Čia yra muziejai" is literally the correct answer). The `-ūs` ending is only valid for a small closed class of true u-stem nouns like `sūnus→sūnūs` and `turgus→turgūs` (id 188, confirmed correct, unaffected).

Checked all 21 case_index=8 rows — id 183 is the only one incorrectly using `-ūs` for a non-u-stem noun; this is an isolated single-row data bug, not systemic. The same underlying error also exists in the noun declension source `backend/data/grammar/words.txt` (line 73, `muziej` stem, nominative-plural column wrongly set to `ūs` instead of `ai`), which feeds the `declension`-task fallback and `_FORM_TO_NOMINATIVE` hint map — leaving it unfixed risks the same bug resurfacing there.

No FK/history risk: `grammar_lesson_result` doesn't reference individual sentence rows, and no other `mistake_report` references row 183.

## Fix plan
1. Update the `grammar_sentence` row (via direct SQL, or via `/dashboard/admin/grammar` → case "Именительный мн.ч." → edit the `muziej___` sentence):
   ```sql
   UPDATE grammar_sentence
   SET answer_ending = 'ai', full_word = 'muziejai'
   WHERE id = 183;
   ```
   (`display` and `russian` fields stay unchanged.)
2. Also correct `backend/data/grammar/words.txt` line 73 (the `muziej` stem row), changing the nominative-plural column from `ūs` to `ai`, so the fallback declension generator and hint map don't reintroduce the same error. Leave the rest of that row's columns unchanged (they match confirmed-correct forms: genitive sg `aus`, locative sg `uje`, genitive pl `ų`, locative pl `uose`).
3. No code changes needed in `grammar_service.py`, `routers/grammar.py`, or `frontend/app/dashboard/grammar/page.tsx` — grading reads `answer_ending`/`full_word` directly with no transformation.
4. Restart the backend after editing `words.txt` (read once at module import time); the DB-only change to row 183 needs no restart.
5. Optional/low-priority: the `grammar_case_rule` (id 11, case_index=8) `transform` text is garbled/self-contradictory — consider clarifying it to read something like "-us→-ai (muziejus→muziejai), искл. u-основа: sūnus→sūnūs, turgus→turgūs" since it's shown to users as a rule hint. Not required to close this issue.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (load the case-8 nominative-plural lesson, find the `muziej___` sentence, submit "muziejai", assert it's graded correct; also spot-check `turgūs`/`sūnūs` sentences still grade correctly).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #137 — Čia yra muziejai. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 137;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-137-muziejai-wrong-plural-answer.md` → `plans/triage/implemented/IMPLEMENTED-issue-137-muziejai-wrong-plural-answer.md`).
