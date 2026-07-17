# Issue #91 — /dashboard/phrases/12/study

**Reported:** 2026-05-23 13:21:49
**Status:** open
**Description:** troleibusу

## Root cause
`phrase.id = 399` (program_id=12) contains a Cyrillic "у" (U+0443, UTF-8 bytes `d1 83`) at the end of the word "troleibus" where a Latin "u" (U+0075) belongs. Affects two columns:

- `text`: `Važiuok devynioliktu troleibus`**`у`**`.`
- `alt_texts`: `Reikia važiuoti devynioliktu troleibus`**`у`**`.`

This is a single data-entry mistake — the admin's keyboard layout was on Russian when typing the final "u". The Cyrillic у is visually identical to a Latin u. A DB-wide scan confirmed row 399 is the only affected row across `phrase.text`, `phrase.alt_texts`, `phrase.translation_en`, and `phrase.chapter_title`. The answer-matching compares the user's Latin-keyboard input against a string ending in Cyrillic у, so any submission of "troleibusu" is rejected.

No ingest-side normalization in `backend/routers/phrases.py`; only `.strip()`. Preventative validation is out of scope (recurrence risk low, only 1 occurrence sitewide).

## Fix plan
1. Apply the data fix in a single transaction, replacing the Cyrillic у (U+0443) with Latin u (U+0075) in both columns of row 399:
   ```sql
   BEGIN;
   UPDATE phrase
   SET text      = REPLACE(text,      U&'\0443', 'u'),
       alt_texts = REPLACE(alt_texts, U&'\0443', 'u')
   WHERE id = 399;
   -- Expected: UPDATE 1
   COMMIT;
   ```
2. Verify:
   ```sql
   SELECT id FROM phrase
   WHERE text ~ '[А-Яа-яЁё]' OR alt_texts ~ '[А-Яа-яЁё]'
      OR translation_en ~ '[А-Яа-яЁё]' OR chapter_title ~ '[А-Яа-яЁё]';
   -- Should return zero rows
   SELECT id, text, alt_texts FROM phrase WHERE id = 399;
   ```
3. No code or frontend rebuild required — data-only correction.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #91 — troleibusу typo (Cyrillic 'у' → Latin 'u') in phrase 399. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 91;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `plans/triage/implemented/IMPLEMENTED-issue-91-troleibusu-cyrillic-typo.md`).
