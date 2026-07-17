# Issue #117 — /dashboard/lists/294

**Reported:** 2026-06-04 09:30:00
**Status:** open
**Description:** "в програме нет перевода на английский нужно проверить базу что везде есть переводы" — In EN mode the Translation column is completely empty for all verbs in the verbs_365 program.

## Root cause

Two compounding problems:

**Problem 1 — Frontend: no fallback when `translation_en` is empty:**
Five display sites use `lang === 'en' ? word.translation_en : word.translation_ru` with no fallback. When `translation_en` is `''` the EN user sees nothing.

**Problem 2 — Data: `reseed_verbs_by_theme.py` hardcodes `translation_en=""`:**
The `Verb` table has no `translation_en` column, so both seed scripts hard-code `translation_en=""` for every one of the 358 verbs_365 `Word` rows.

**Scope:**
- 358 words in verbs_365 program — all missing `translation_en`
- 421 orphaned words not in any list — not user-facing, lower priority
- Total: 779 words affected

## Fix plan

### Step 1 — Frontend fallback fix (immediate, ~4 one-line changes)

**File:** `frontend/app/programs/[key]/page.tsx` line ~288
```tsx
// Before:
{lang === 'en' ? word.translation_en : word.translation_ru}
// After:
{lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru}
```

**File:** `frontend/app/dashboard/lists/[id]/page.tsx` line ~119
```tsx
// Before:
{lang === 'en' ? word.translation_en : word.translation_ru}
// After:
{lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru}
```

**File:** `frontend/app/dashboard/components/MatchRound.tsx` line 32
```ts
// Before:
return lang === 'en' ? word.translation_en : word.translation_ru;
// After:
return lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru;
```

**File:** `frontend/app/dashboard/components/QuizSession.tsx` line 113 (the `trans()` function)
```ts
// Before:
return lang === 'en' ? word.translation_en : word.translation_ru;
// After:
return lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru;
```
⚠️ Do NOT change line 64 (`ENGLISH_TO_DIGIT[word.translation_en]`) — numbers quiz relies on exact EN word lookup.

**File:** `frontend/app/dashboard/vocabulary/page.tsx` line 186
```ts
// Before:
lang === 'en' ? (w.translation_en ?? w.translation_ru) : w.translation_ru
// After:
lang === 'en' ? (w.translation_en || w.translation_ru) : w.translation_ru
```
(`??` doesn't catch empty strings; `||` does)

### Step 2 — Backfill `translation_en` for verbs_365 (358 words)

Generate English translations for all 358 Lithuanian verb infinitives. The `verb` table has `translation_ru` but no `translation_en`.

**Approach:** Create `backend/scripts/backfill_verb_translation_en.py` that:
1. Takes a JSON file mapping `{"būti": "to be", "turėti": "to have", ...}`
2. Updates `word.translation_en` for all words in verbs_365 lists

Or use the Claude API (claude-api skill) to generate the mapping from the 358 `(lithuanian, translation_ru)` pairs.

### Step 3 — Fix `reseed_verbs_by_theme.py` to not hardcode `translation_en=""`

Once the `Verb` model has `translation_en` (or a mapping exists), update line ~180:
```python
# Before:
translation_en="",
# After:
translation_en=verb.translation_en or "",
```

### Step 4 — Rebuild frontend
Run `npm run build` in `frontend/`.

## Tests
1. Write a Playwright test in `frontend/tests/` that verifies verbs page shows translations in EN mode.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #117 — EN translations now fall back to RU when empty; verbs_365 words still need translation_en backfill. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 117;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
