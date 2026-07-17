# Issue #128 -- Susipazinkime! three word errors

**Reported:** 2026-06-18 09:35:07
**Status:** open
**Description:** In the set "Susipazinkime!" (list 208, lithuanian_daily_language program), three words have errors:
1. `pešininkas` (id 5994) "pedestrian" -- not standard Lithuanian. Correct: `pėsčiasis` (id 7282 exists in DB).
2. `pensininė` (id 5995) "pensionerka" -- misspelled. Correct: `pensininkė` (no existing word in DB).
3. `mokininė` (id 5993) "uchenica" -- extra `n`. Correct: `mokinė` (ids 4025, 7168 exist in DB).

## Root cause

Data entry errors in the seed content file used by `seed_ne_dienos.py` to populate word list 208. The misspelled words were ingested as-is and never corrected.

## Pre-flight findings

- All three words exist ONLY in list 208 (no other lists).
- User progress: 5 users on word 5993, 4 users on word 5994, 4 users on word 5995.
- `pėsčiasis` (id 7282) exists in DB, NOT in list 208.
- `mokinė` (id 4025, translation_ru="ученица", translation_en="schoolgirl") exists in DB, NOT in list 208.
- `mokinė` (id 7168, translation_ru="ученица", translation_en="student (f)") also exists, NOT in list 208.

## Fix plan

Pure data fix via SQL -- no code changes required.

### 1. Fix `pensininė` -> `pensininkė` (in-place update, word 5995)

```sql
UPDATE word
SET lithuanian = 'pensininkė', accented = NULL
WHERE id = 5995 AND lithuanian = 'pensininė';
```

### 2. Fix `pešininkas` -> `pėsčiasis` (replace with existing word 7282)

```sql
-- Point list 208 entry to correct word
UPDATE word_list_item SET word_id = 7282
WHERE word_id = 5994 AND word_list_id = 208;

-- Migrate user progress (users who don't already have progress on 7282)
INSERT INTO user_word_progress (user_id, word_id, status, review_count, mistake_count, last_seen, sm2_reps, ease_factor, interval, next_review)
SELECT user_id, 7282, status, review_count, mistake_count, last_seen, sm2_reps, ease_factor, interval, next_review
FROM user_word_progress
WHERE word_id = 5994
AND user_id NOT IN (SELECT user_id FROM user_word_progress WHERE word_id = 7282);

-- Remove old progress
DELETE FROM user_word_progress WHERE word_id = 5994;

-- Archive incorrect word
UPDATE word SET archived = true WHERE id = 5994;
```

### 3. Fix `mokininė` -> `mokinė` (replace with existing word 4025)

```sql
-- Point list 208 entry to correct word
UPDATE word_list_item SET word_id = 4025
WHERE word_id = 5993 AND word_list_id = 208;

-- Migrate user progress (users who don't already have progress on 4025)
INSERT INTO user_word_progress (user_id, word_id, status, review_count, mistake_count, last_seen, sm2_reps, ease_factor, interval, next_review)
SELECT user_id, 4025, status, review_count, mistake_count, last_seen, sm2_reps, ease_factor, interval, next_review
FROM user_word_progress
WHERE word_id = 5993
AND user_id NOT IN (SELECT user_id FROM user_word_progress WHERE word_id = 4025);

-- Remove old progress
DELETE FROM user_word_progress WHERE word_id = 5993;

-- Archive incorrect word
UPDATE word SET archived = true WHERE id = 5993;
```

### 4. Post-fix verification

```sql
SELECT w.id, w.lithuanian, w.translation_ru
FROM word w JOIN word_list_item wli ON wli.word_id = w.id
WHERE wli.word_list_id = 208
AND w.lithuanian IN ('pensininkė', 'pėsčiasis', 'mokinė');
```

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #128 -- Three word errors in Susipazinkime! list. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 128;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
