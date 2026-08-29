---
kind: bugfix
status: done
iteration: 1
max_iterations: 16
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #164 — /dashboard/grammar/

**Reported:** 2026-08-28 07:23:14
**Status:** open
**Description:** dienos praėjo labai greitai. (3, f.)

Три дня прошли очень быстро. -  что такое (3, f.) ? как будто не должно быть в вопросе

## Root cause

The `display` text for `case_index` 15 & 16 sentences was hand-authored with a trailing `(N, gender.)` note baked directly into the sentence string in `backend/scripts/seed_numbers_grammar.py`'s `SENTENCES` literal (e.g. line 194: `(15, "___ dienos praėjo labai greitai. (3, f.)", "Trys", "Trys", "Три дня прошли очень быстро.")`). This was clearly a private authoring aid (numeral count + grammatical gender used to pick the correct declined form) that was never stripped before the sentences were seeded into production, and `backend/grammar_service.py::_generate_sentence_tasks` forwards `row.display` to the frontend essentially verbatim (it only rewrites text immediately around `___`, never touches anything after it), so the leaked note is rendered raw by `frontend/.../GrammarTaskRunner.tsx`'s `InlineSentenceInput` (`display.split('___')`), landing in the middle of the exercise question exactly as the user reported.

The annotation has zero functional role: `_extract_stem`/`_sentence_invariant_holds` only look at the word directly adjacent to `___`, and the disambiguating info it supposedly carries (which numeral/gender is expected) is already delivered to the student via `task.translation_ru` (the Russian sentence, e.g. "Три дня прошли очень быстро.") rendered right under the blank. So this is a pure data-cleanliness bug — safe to fix by stripping the text, no exercise/grading logic depends on it.

Confirmed in production DB: 68 rows across `case_index` 15 ("Числительные: Именительный") and 16 ("Числительные: Винительный") have this leaked `(N, gender.)` suffix (33/35 and 35/35 respectively), plus 2 stray bare `(N)` rows in case_index 15. No other case_index group is affected.

There is one live reintroduction path worth closing: `backend/routers/admin.py`'s `POST`/`PATCH /admin/grammar/sentences` accept free-text `display` with no guard against this pattern, and `frontend/app/dashboard/admin/grammar/page.tsx` exposes a raw text input for it — so an admin re-adding sentences by copying from authoring notes could reintroduce the same leak.

**Reason for suggested_model/suggested_effort:** a well-scoped, mechanical regex-based fix (no logic dependency) but it spans production data + a source seed script + an admin validation guard, so it warrants careful multi-file verification rather than a trivial single edit.

## Fix plan
- [x] 1. Production data cleanup: run a one-time SQL `UPDATE` against `grammar_sentence` for `case_index IN (15, 16)`, stripping the trailing `(N, gender.)` annotation from `display`, via a psycopg (v3) script against `DATABASE_URL` from `backend/.env` (strip `+psycopg` from the scheme). Wrap in a transaction, verify row counts (68 rows) and spot-check id=231 becomes `"___ dienos praėjo labai greitai."`.
- [x] 2. Second pass: strip the 2 remaining bare `(N)` stragglers in `case_index=15` (e.g. `"Šeimoje yra ___ vaikai. (3)"`, `"___ broliai gyvena Vilniuje. (2)"`) that don't match the gendered regex.
- [x] 3. Fix the source of truth in `backend/scripts/seed_numbers_grammar.py` (the `SENTENCES` list, case 15 block ~lines 167–202 and case 16 block ~lines 208–243): strip the same trailing `(N[, gender].)` pattern from every `display` string literal there via a scripted regex pass over the file, so a future `--reset` re-run of the seeder can't reintroduce the bug.
- [x] 4. Add a lightweight guard in `backend/routers/admin.py` in `create_grammar_sentence` and `update_grammar_sentence` (next to the existing `_sentence_invariant_holds` check, ~lines 1015–1023 and 1066–1074): reject `display` values ending in a `(...)` parenthetical (e.g. `re.search(r'\([^)]*\)\s*$', body.display)`), with an error message like "display must not end with a parenthetical annotation — move authoring notes elsewhere."
- [x] 5. Verify no frontend change is needed — `GrammarTaskRunner.tsx` and the admin grammar page should render correctly as-is once `display` is clean in the DB/seed.
- [ ] 6. Manually verify: reload `/dashboard/grammar/` exercises for the "Числительные: Именительный" and "Числительные: Винительный" lessons (case 15/16) and confirm sentences like id=231 no longer show `(3, f.)`, and that grading still works (answer_ending/full_word untouched).

### SQL for the data cleanup

```sql
-- Step 1: strip the gendered "(N, gender.)" annotation (68 confirmed rows)
UPDATE grammar_sentence
SET display = regexp_replace(display, '\s*\([0-9]+,\s*[a-z]+\.\)\s*$', '')
WHERE case_index IN (15, 16)
  AND display ~ '\([0-9]+,\s*[a-z]+\.\)\s*$';

-- Step 2 (run after step 1): strip the 2 remaining bare "(N)" stragglers in case_index 15
UPDATE grammar_sentence
SET display = regexp_replace(display, '\s*\([0-9]+\)\s*$', '')
WHERE case_index IN (15, 16)
  AND display ~ '\([0-9]+\)\s*$';

-- Verification (should return 0 rows after both updates)
SELECT id, case_index, display FROM grammar_sentence
WHERE case_index IN (15, 16) AND display ~ '\([0-9,a-z. ]+\)\s*$';
```

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue — assert a numeral grammar exercise sentence (case 15/16, e.g. the one derived from id=231) does not contain a trailing `(N, gender.)` or `(N)` parenthetical in its displayed text.
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #164 — leaked authoring metadata like '(3, f.)' shown in numeral grammar exercise sentences. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 164;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-164-numeral-sentence-leaked-metadata.md` → `plans/triage/implemented/IMPLEMENTED-issue-164-numeral-sentence-leaked-metadata.md`).
