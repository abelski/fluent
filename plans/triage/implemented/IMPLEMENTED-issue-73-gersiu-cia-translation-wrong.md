# Issue #73 — /dashboard/phrases/11/study

**Reported:** 2026-05-13 12:42:33
**Status:** open
**Description:** буду здесь - gersiu cia / тут подразумеваемый контекст буду пить здесь но если взять эту фразу без контекста то будет непонятно

## Root cause

Pure data error affecting a café dialogue pair (program 11). The verb "gerti" (to drink) is replaced with "быть" (to be) in the Russian translations of both phrases, making them ambiguous when studied without context:

| id | LT | Current RU | Correct RU |
|----|----|----|-----|
| 381 | `Gersite čia ar norėsite išsinešti?` | `Будете здесь или возьмёте с собой?` | `Будете пить здесь или возьмёте с собой?` |
| 382 | `Gersiu čia.` | `Буду здесь.` | `Буду пить здесь.` |

`gersite` / `gersiu` are future-tense forms of "gerti" (to drink). Without the verb in Russian, a learner studying these phrases individually sees "будете/буду" and incorrectly infers that `gersite` = "will be" rather than "will drink."

Note: `Будете здесь или возьмёте с собой?` is a natural colloquial Russian café phrase, but it obscures the Lithuanian verb for learners.

## Fix plan

1. Run SQL UPDATE on production database:
   ```sql
   UPDATE phrase
   SET translation = 'Будете пить здесь или возьмёте с собой?'
   WHERE id = 381
     AND program_id = 11;

   UPDATE phrase
   SET translation = 'Буду пить здесь.'
   WHERE id = 382
     AND program_id = 11;
   ```
   Verify:
   ```sql
   SELECT id, text, translation FROM phrase WHERE id IN (381, 382);
   ```

2. Update seed file to keep production and seed in sync.
   In `backend/seed_phrases.py`, find and update both lines:
   ```python
   ("Gersite čia ar norėsite išsinešti?", "Будете здесь или возьмёте с собой?"),
   ("Gersiu čia.", "Буду здесь."),
   ```
   Change to:
   ```python
   ("Gersite čia ar norėsite išsinešti?", "Будете пить здесь или возьмёте с собой?"),
   ("Gersiu čia.", "Буду пить здесь."),
   ```

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #73 — translations corrected for phrases 381 and 382 (verb 'пить' added). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 73;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-73-gersiu-cia-translation-wrong.md` → `plans/triage/implemented/IMPLEMENTED-issue-73-gersiu-cia-translation-wrong.md`).
