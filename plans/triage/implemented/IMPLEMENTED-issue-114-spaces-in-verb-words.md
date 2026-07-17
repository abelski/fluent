# Issue #114 — /programs/verbs_365

**Reported:** 2026-06-03 11:39:26
**Status:** open
**Description:** Некоторые глаголы например di̇r̀ bti - содержат пробел что не правильно надо найти и про валидировать все подобные кейсы

## Root cause

Same as issue #113. The `lithuanian` field contains Unicode combining stress diacritics (U+0300 grave ̀, U+0301 acute ́, U+0303 tilde ̃, plus `i` + U+0307 dot-above artifact). These create a visual rendering gap that looks like a space (e.g. `di̇r̀ bti` instead of `dirbti`). 158 words affected in `verbs_365`.

**Critical constraint:** Stripping the full U+0300–U+036F range would destroy Lithuanian letters — U+030C (caron) is part of `š/č/ž`, U+0307 (dot above) is part of `ė`, U+0304 (macron) is part of `ū`, U+0328 (ogonek) is part of `ą/ę/į/ų`. Only the three stress marks and the `i̇` artifact are safe to strip.

## Fix plan

**Data-only fix — SQL migration, no code changes needed.**
Same SQL as issue #113 — these two issues share one fix. See issue-113 plan for the full SQL.

### Step 1 — Validate scope (run first)

```sql
-- Count affected words by subcategory across the entire DB
SELECT
    wl.subcategory,
    COUNT(DISTINCT w.id) AS affected_words
FROM word w
JOIN word_list_item wli ON wli.word_id = w.id
JOIN word_list wl ON wl.id = wli.word_list_id
WHERE w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775))
  AND w.archived = FALSE
GROUP BY wl.subcategory
ORDER BY affected_words DESC;
```

### Step 2 — Apply fix (safe, NFD→strip→NFC approach)

```sql
BEGIN;

UPDATE word
SET lithuanian = replace(
    unicode_normalize('NFC',
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    unicode_normalize('NFD', lithuanian),
                    chr(768), '', 'g'
                ),
                chr(769), '', 'g'
            ),
            chr(771), '', 'g'
        )
    ),
    'i' || chr(775), 'i'
)
WHERE id IN (
    SELECT DISTINCT w.id
    FROM word w
    JOIN word_list_item wli ON wli.word_id = w.id
    JOIN word_list wl ON wl.id = wli.word_list_id
    WHERE wl.subcategory = 'verbs_365'
      AND w.lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775))
);

COMMIT;
```

### Step 3 — Verify (should return 0)

```sql
SELECT COUNT(*) FROM word
WHERE lithuanian ~ (chr(768) || '|' || chr(769) || '|' || chr(771) || '|i' || chr(775));
```

## Tests
1. Write a Playwright test in `frontend/tests/` that verifies no word in a verbs_365 list contains visual spaces from diacritics.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #114 — combining diacritics removed from word.lithuanian (visual spaces gone). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 114;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
