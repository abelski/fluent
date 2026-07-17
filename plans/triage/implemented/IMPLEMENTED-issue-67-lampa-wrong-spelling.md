# Issue #67 — /dashboard/lists/170/study/

**Reported:** 2026-05-09 10:18:10
**Status:** open
**Description:** Лампа- lEmpa а не lampa

## Root cause
The user reported that the word "лампа" was displayed as "lEmpa" instead of "lampa". However, querying the production database shows the word is stored correctly: `(4715, 'lampa', 'лампа')`. There is no text transformation applied to `word.lithuanian` in the frontend — it is rendered directly.

Possible explanations:
- The data was previously wrong ("lEmpa") and has since been corrected, but the issue was never closed.
- The user misread the word on screen (capital E is a plausible misread of a lowercase letter in the font used).
- A transient display glitch (e.g. font rendering on mobile).

Since the database currently holds the correct value and no code transformation exists that would alter the case, this is most likely a stale report for already-correct data.

## Fix plan
1. Verify in the current DB: `SELECT id, lithuanian, translation_ru FROM word WHERE id = 4715;` — expected: `lampa / лампа`.
2. If correct, close the issue as resolved without code changes.
3. If somehow still wrong, run: `UPDATE word SET lithuanian = 'lampa' WHERE id = 4715;` to fix the data.

## Tests
1. No automated test needed — verify visually on `/dashboard/lists/170/study` that "лампа" shows "lampa".
2. Rebuild the frontend and restart the local server.
3. Leave the local server running so the user can manually verify.

## Confirm resolution
Ask the user: "Issue #67 — lampa spelling. DB shows 'lampa' (correct). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 67;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
