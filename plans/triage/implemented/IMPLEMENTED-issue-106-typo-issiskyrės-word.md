# Issue #106 — /dashboard/lists/173/study

**Reported:** 2026-06-01 01:00:09
**Status:** open
**Description:** "Опечатка в слове 'išsiskyrės', правильно 'išsiskyręs' (программа 'Базовый словарь на А1-А2', тема 'Семья и люди')"
(Typo in the word 'išsiskyrės' — correct form is 'išsiskyręs'. List "Šeima ir žmonės", word_list id=173.)

## Root cause

Pure data entry error. The Lithuanian masculine past active participle of "išsiskyrti" (to divorce/separate) is "išsiskyręs" — the suffix vowel is "ą" (nasal /aː/), not "ė" (long /eː/).

DB state:
- word id=3282: `išsiskyręs` ✓ correct (exists in another list)
- word id=4490: `išsiskyrės` ✗ typo — in word_list 173
- word id=5492: `išsiskyrės` ✗ typo — in word_list 173

Both 4490 and 5492 appear in list 173 ("Šeima ir žmonės"). No code change needed — pure data fix.

## Fix plan

1. Run the SQL fix:
```sql
UPDATE word
SET lithuanian = 'išsiskyręs'
WHERE id IN (4490, 5492)
AND lithuanian = 'išsiskyrės';
```

2. Verify:
```sql
SELECT id, lithuanian, translation_ru FROM word WHERE id IN (3282, 4490, 5492);
```

3. Check for duplicate entries in list 173 after the fix (all three words would show same spelling + translation):
```sql
SELECT wli.word_list_id, wli.word_id, wli.position, w.lithuanian
FROM word_list_item wli
JOIN word w ON w.id = wli.word_id
WHERE w.lithuanian = 'išsiskyręs'
ORDER BY wli.word_list_id, wli.position;
```
If list 173 now has duplicate identical entries, consider archiving words 4490 and/or 5492 (`SET archived = TRUE`) to avoid redundant quiz items.

**Alternative (Admin UI):** `/dashboard/admin` → Content → Vocabularies → a1_a2_basics → "Šeima ir žmonės" → edit the two misspelled entries inline.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #106 — Typo 'išsiskyrės' → 'išsiskyręs' in list 173. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 106;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
