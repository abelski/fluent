# Issue #104 — /dashboard/grammar/

**Reported:** 2026-05-28 12:59
**Status:** open
**Description:** "site on english but isee Литовские падежи" — site appears to be in English but grammar program titles are in Russian

## Root cause

This is a **real mixed-language bug**. When the user has `lang=en` set (via the RU/EN toggle in the Header), the grammar page UI renders in English (nav labels, page heading, stats cards) but grammar program titles come directly from `grammar_program.title` which is Russian-only in the DB. There is no `title_en` column.

Additionally, four hardcoded Russian strings in `grammar/page.tsx` bypass the i18n system entirely:
- Line 441: `'Черновик'` and `'В тестировании'` (lesson status badges)
- Line 767: `'Нет уроков'` (empty state)
- Line 954: `'от: '` (sentence prefix)
- Line 1004: `placeholder="Введите падежный вопрос (kuo?, ką?…)"` (verb_case input)

Secondary: `ru.ts` line 92 has `browse: 'Browse'` (English string in Russian translations).

## Fix plan

### Step 1 — Add `title_en` to `grammar_program` table

```sql
ALTER TABLE grammar_program ADD COLUMN title_en VARCHAR;

UPDATE grammar_program SET title_en = 'Lithuanian Cases' WHERE id = 1;
UPDATE grammar_program SET title_en = 'Numerals' WHERE id = 2;
UPDATE grammar_program SET title_en = 'Verb Conjugation' WHERE id = 3;
UPDATE grammar_program SET title_en = 'Verb Government' WHERE id = 4;
```

### Step 2 — Backend: expose `title_en` in API response

In `backend/routers/grammar.py`, add `title_en` to the `GrammarProgramSummary` schema/response.

### Step 3 — Frontend: use translated title

In `frontend/lib/api.ts`, add `title_en?: string` to the `GrammarProgramSummary` interface.

In `frontend/app/dashboard/grammar/page.tsx` line 737, change:
```tsx
{program.title}
```
to:
```tsx
{(lang === 'en' && program.title_en) ? program.title_en : program.title}
```

### Step 4 — Add i18n keys for hardcoded Russian strings

In `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` add:
- `grammar.lessonStatusDraft` — "Черновик" / "Draft"
- `grammar.lessonStatusTesting` — "В тестировании" / "In testing"
- `grammar.noLessons` — "Нет уроков" / "No lessons"
- `grammar.sentenceFrom` — "от: " / "from: "
- `grammar.verbCasePlaceholder` — "Введите падежный вопрос (kuo?, ką?…)" / "Enter case question (kuo?, ką?…)"

Then replace hardcoded strings in `grammar/page.tsx` with `tr.grammar.*` references.

### Step 5 — Fix Russian translations file

In `frontend/lib/i18n/ru.ts` line 92, change `browse: 'Browse'` to `browse: 'Открыть'`.

### Critical files
- `backend/routers/grammar.py`
- `frontend/lib/api.ts`
- `frontend/app/dashboard/grammar/page.tsx`
- `frontend/lib/i18n/types.ts`
- `frontend/lib/i18n/ru.ts`
- `frontend/lib/i18n/en.ts`

## Tests
1. Write a Playwright test in `frontend/tests/issue-104-grammar-titles-translated.spec.ts` that:
   - Sets `lang=en` in localStorage
   - Navigates to `/dashboard/grammar`
   - Asserts the text "Lithuanian Cases" is visible (not "Литовские падежи")
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #104 — grammar program titles and hardcoded strings now translated for English UI. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 104;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
