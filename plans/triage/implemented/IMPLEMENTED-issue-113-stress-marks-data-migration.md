# Issue #113 — /programs/verbs_365

**Reported:** 2026-06-03 11:38:27
**Status:** open
**Description:** В словах присутствуют ударения но у нас ударения обозначаются жирным. Нужно сделать дата миграцию

## Root cause

158 words in the `verbs_365` subcategory have Unicode combining stress diacritics embedded in their `lithuanian` field — the field that should contain clean plain text. The app convention is to store stress in the `accented` field using `*syllable*` bold notation. The combining characters present are:

| Codepoint | Name | Appears as |
|---|---|---|
| U+0300 | COMBINING GRAVE | ̀ |
| U+0301 | COMBINING ACUTE | ́ |
| U+0303 | COMBINING TILDE | ̃ |
| U+0307 after `i` | COMBINING DOT ABOVE | i̇ (artifact) |

**Critical constraint:** Cannot strip the full U+0300–U+036F range — that would destroy `š/č/ž` (U+030C caron), `ė` (U+0307 dot), `ū` (U+0304 macron), `ą/ę/į/ų` (U+0328 ogonek). Safe approach: NFD normalize → strip only U+0300/0301/0303 → NFC recompose (restores all Lithuanian letters) → remove residual `i` + U+0307.

## Fix plan

**Data-only fix — SQL migration, no code changes needed.**

### Step 1 — Verify scope

```sql
SELECT COUNT(*) AS words_with_stress_marks
FROM word w
JOIN word_list_item wli ON wli.word_id = w.id
JOIN word_list wl ON wl.id = wli.word_list_id
WHERE wl.subcategory = 'verbs_365'
  AND w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775));
-- Expected: ~158
```

### Step 2 — Preview before/after (spot-check)

```sql
SELECT
    w.id,
    w.lithuanian AS before,
    replace(
        unicode_normalize('NFC',
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        unicode_normalize('NFD', w.lithuanian),
                        chr(768), '', 'g'
                    ),
                    chr(769), '', 'g'
                ),
                chr(771), '', 'g'
            )
        ),
        'i' || chr(775), 'i'
    ) AS after
FROM word w
JOIN word_list_item wli ON wli.word_id = w.id
JOIN word_list wl ON wl.id = wli.word_list_id
WHERE wl.subcategory = 'verbs_365'
  AND w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775))
LIMIT 20;
```

### Step 3 — Apply migration

```sql
BEGIN;

UPDATE word
SET lithuanian = replace(
    unicode_normalize('NFC',
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    unicode_normalize('NFD', lithuanian),
                    chr(768), '', 'g'   -- strip U+0300 grave
                ),
                chr(769), '', 'g'       -- strip U+0301 acute
            ),
            chr(771), '', 'g'           -- strip U+0303 tilde
        )
    ),
    'i' || chr(775), 'i'               -- strip i + U+0307 dot-above artifact
)
WHERE id IN (
    SELECT DISTINCT w.id
    FROM word w
    JOIN word_list_item wli ON wli.word_id = w.id
    JOIN word_list wl ON wl.id = wli.word_list_id
    WHERE wl.subcategory = 'verbs_365'
      AND w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775))
);
-- Should print: UPDATE 158

COMMIT;
```

### Step 4 — Verify clean

```sql
-- Should return 0
SELECT COUNT(*) AS words_still_with_stress_marks
FROM word w
JOIN word_list_item wli ON wli.word_id = w.id
JOIN word_list wl ON wl.id = wli.word_list_id
WHERE wl.subcategory = 'verbs_365'
  AND w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775));
```

### Step 5 — Spot-check Lithuanian letters intact

```sql
-- Should show words still containing š, č, ž, ė, ū
SELECT lithuanian FROM word w
JOIN word_list_item wli ON wli.word_id = w.id
JOIN word_list wl ON wl.id = wli.word_list_id
WHERE wl.subcategory = 'verbs_365'
  AND (w.lithuanian LIKE '%š%' OR w.lithuanian LIKE '%č%'
    OR w.lithuanian LIKE '%ž%' OR w.lithuanian LIKE '%ė%'
    OR w.lithuanian LIKE '%ū%')
LIMIT 10;
```

## Tests
1. Write a Playwright test in `frontend/tests/` that verifies words in the verbs_365 program display without unexpected spaces or combining characters.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #113 — stress mark diacritics stripped from word.lithuanian in verbs_365. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 113;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
