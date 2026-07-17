# Issue #116 — /programs/verbs_365/

**Reported:** 2026-06-03 13:53:24
**Status:** open
**Description:** Все еще виду знаки ударения а не выделение жирным (Still seeing stress mark characters instead of bold highlighting on the verbs page). Listed affected words: bū́ti, turė́ti, galė́ti, norė́ti, reikė́ti. Asks to review all similar cases in the entire database.

## Root cause

Two compounding problems:

**Problem 1 — The programs page never renders stress (frontend):**
`/programs/[key]/page.tsx` renders `word.lithuanian` as raw text (line ~285). It has no `accented` field in its `Word` interface, no import of `renderAccented`, and no bold-stress rendering at all.

**Problem 2 — The reseed script re-introduced stress marks into `word.lithuanian` (data integrity):**
`reseed_verbs_by_theme.py` (issue #115) looks up existing words by `Word.lithuanian == verb.infinitive`. Since `verb.infinitive` contains Unicode stress marks (e.g. `bū́ti`), if the issue #113 migration had stripped those marks from existing rows (`Word.lithuanian = 'būti'`), the lookup would fail and create a **new Word row** with `lithuanian = 'bū́ti'` (stress marks re-introduced, `accented` field NULL).

## Fix plan

### Step 1 — Extract `renderAccented` into a shared utility
**File to create:** `frontend/lib/renderAccented.tsx`

Extract the `renderAccented` function currently private to `QuizSession.tsx` into a shared module. Export it so other pages can use it.

### Step 2 — Update `QuizSession.tsx` to import from shared utility
**File:** `frontend/app/dashboard/components/QuizSession.tsx`

Remove the local `renderAccented` function and import from `'../../../lib/renderAccented'`.

### Step 3 — Fix the programs page to use `renderAccented` (CRITICAL)
**File:** `frontend/app/programs/[key]/page.tsx`

1. Add `accented?: string | null` to the `Word` interface
2. Import `renderAccented` from shared lib
3. Change the Lithuanian cell from `{word.lithuanian}` to `{renderAccented(word.accented || word.lithuanian)}`

### Step 4 — Fix the list detail page (same latent bug)
**File:** `frontend/app/dashboard/lists/[id]/page.tsx`

Line ~116 has same issue: `{word.lithuanian}` with no `accented` fallback. Apply same three-part fix.

### Step 5 — Fix `reseed_verbs_by_theme.py` to strip stress
**File:** `backend/scripts/reseed_verbs_by_theme.py`

Add a `strip_stress()` helper that removes combining accent codepoints. Use `strip_stress(verb.infinitive)` for DB lookup and `word.lithuanian` value, so the lookup finds existing clean rows and doesn't create duplicates.

### Step 6 — Re-run stress marks DB migration (CRITICAL)
Re-run the issue #113 SQL migration against production to strip combining stress marks from any rows reintroduced by the reseed script. Also deduplicate any Word rows (stress-marked vs clean) in verbs_365.

Use the `/sql` skill to:
```sql
-- Strip combining accent marks from word.lithuanian where they exist
UPDATE word
SET lithuanian = regexp_replace(lithuanian, '[̀-ͯ]', '', 'g')
WHERE lithuanian ~ '[̀-ͯ]';
```

### Step 7 — Rebuild frontend
Run `npm run build` in `frontend/` to regenerate the static export.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #116 — stress marks still showing as raw characters on verbs page instead of bold rendering. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 116;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`IMPLEMENTED-issue-116-stress-marks-not-bold-verbs.md`).
