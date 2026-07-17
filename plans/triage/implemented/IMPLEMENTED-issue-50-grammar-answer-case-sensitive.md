# Issue #50 — /dashboard/grammar/

**Reported:** 2026-04-15 19:50:09
**Status:** open
**Description:** Draugę (capital letter) - neteisingai, o draugę (mažoji raidė) teisingai. Need to add .tolowercase() :) (Draugę with capital letter marked wrong, lowercase correct. Need toLowerCase)

## Root cause
The grammar exercise answer check uses `normalizeLt()` which already applies `.toLowerCase()`. So both the user input and the expected answer are lowercased before comparison. However, this issue appears to be related to the user typing the **full word** (e.g., "Draugę") when the exercise expects only the **ending** (e.g., "ę"). The full word won't match the ending even after normalization.

Note: Issue #51 (filed the same day) is a follow-up where the user retracts this complaint and acknowledges it checks only the ending — but still requests a UX improvement to make the format clearer.

The grammar exercise is in `frontend/app/dashboard/grammar/page.tsx`:
- `normalizeLt()` already calls `.toLowerCase()` at line 64-66
- Answer check: `normalizeLt(typed.trim()) === normalizeLt(task.answer)` — this is case-insensitive

If the case-sensitivity bug is real (i.e., some edge case with Lithuanian diacritics that `.toLowerCase()` doesn't handle), it would be worth adding explicit `.normalize('NFC')` calls.

## Fix plan
1. Read `frontend/app/dashboard/grammar/page.tsx` to confirm `normalizeLt` behavior.
2. Add `.normalize('NFC')` to `normalizeLt()` to handle Unicode edge cases:
   ```typescript
   function normalizeLt(text: string): string {
     return text
       .normalize('NFC')
       .toLowerCase()
       ...
   ```
3. Also improve the exercise placeholder to show the expected answer length (see issue #52) to reduce user confusion about what to type.

## Tests
1. Write a Playwright test that opens the grammar exercise, types the correct answer with a capital letter, and verifies it's accepted.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #50 — Grammar exercise answer check improved with Unicode normalization. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 50;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
