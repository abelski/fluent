# Issue #129 — /dashboard/grammar/

**Reported:** 2026-06-20 10:22:54
**Status:** open
**Description:** Andrius turi ___ vieną dukterį. (1) Зачем показывать ответ сразу?

## Root cause

**Data issue** in grammar_sentence id 271 (case_index 16). The display text is `"Andrius turi ___ vieną dukterį. (1)"` -- the answer `"vieną"` appears in plain text right after the blank, spoiling the exercise. All other case-16 sentences correctly hide the numeral answer (e.g., `"Jis turi ___ brolius. (2, m.)"` where the answer `"du"` is not in the visible text).

## Fix plan

### 1. Fix seed data
**File:** `backend/scripts/seed_numbers_grammar.py` line ~207

Change:
```python
(16, "Andrius turi ___ vieną dukterį. (1)",          "vieną",     "vieną",     "У Андрюса одна дочь."),
```
To:
```python
(16, "Andrius turi ___ dukterį. (1, f.)",            "vieną",     "vieną",     "У Андрюса одна дочь."),
```

### 2. Fix production DB row
```sql
UPDATE grammar_sentence SET display = 'Andrius turi ___ dukterį. (1, f.)' WHERE id = 271;
```

### 3. Add backend safety net
**File:** `backend/grammar_service.py`, function `_generate_sentence_tasks` (~line 266)

After building each task, check if `full_word` appears in the text surrounding the blank. If it does, strip it from the `after` portion to prevent answer leakage. This guards against similar data issues in the future.

### 4. Add admin validation (optional)
**File:** `backend/routers/admin.py`, functions `create_grammar_sentence` and `update_grammar_sentence`

Add a warning when `full_word` appears in the `display` text outside the `___` placeholder.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #129 — Answer visible in grammar sentence. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 129;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-129-answer-visible-in-sentence.md` → `plans/triage/implemented/IMPLEMENTED-issue-129-answer-visible-in-sentence.md`).
