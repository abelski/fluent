# Issue #133 — baigtis labeled as verb confuses user

**Reported:** 2026-06-27 08:56
**Status:** open
**Description:** "baigtis(глагол) это не глагол. Это конец" — user claims baigtis is not a verb, says it means "end" (the noun).

## Root cause

**The data is correct** — `baigtis` IS a Lithuanian reflexive verb (baigti + reflexive suffix -si/-s) meaning "to end, to come to an end". The translations "кончаться, завершаться" stored in the DB are correct Russian verbs.

The user likely confuses it with the noun "конец" (end) / Lithuanian "pabaiga" (end).

**However, the UX contributes to the confusion:**
- The `hint` field ("глагол") is shown in parentheses on the vocabulary page (`vocabulary/page.tsx` line 194) as `baigtis (глагол)`, which looks like it could be a translation rather than a grammatical label.
- The hint comes from the `word.hint` column, hardcoded as "глагол" during verb seeding (`seed_verbs_vocabulary.py` line 138, `reseed_verbs_by_theme.py` line 181).

**Secondary issue:** Words 6820 and 7626 are both `baigtis` — duplicates from separate seeding runs. Neither is currently in any word_list (old list items cleaned up during re-seeding).

## Fix plan

1. **Improve hint display on vocabulary page** (`frontend/app/dashboard/vocabulary/page.tsx` line 194) — change from parenthesized text `(глагол)` to a styled badge/pill that clearly reads as a grammatical category, not a translation:
   ```tsx
   {w.hint && (
     <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-normal">
       {w.hint}
     </span>
   )}
   ```

2. **Clean up duplicate words** — run SQL to check which of words 6820/7626 has user_word_progress records and archive the duplicate.

3. **No data change needed** — the word IS a verb and the label IS correct.

## Tests
1. Write a Playwright test in `frontend/tests/` that verifies the hint badge renders correctly on the vocabulary page.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #133 — baigtis label confusion. The word IS a verb; fix is improved hint styling to look like a tag, not a translation. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 133;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
