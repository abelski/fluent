---
kind: bugfix
status: done
iteration: 1
max_iterations: 18
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #161 — /dashboard/grammar/

**Reported:** 2026-08-24 09:48:47
**Status:** open
**Description:** от: draugė / Labas, ___! / Привет, друг! - помоему тут неправильный род - drauge это подруга а в переводе указан друг. нужно проверить все подобные кейсы в этой программе

## Root cause
Two layers, both must be fixed for the report to actually be resolved.

**Layer 1 — genuine linguistic homograph, undisambiguated in content.** The Lithuanian vocative
transform rule (`grammar_case_rule.transform` for `case_index=7`) has `-as→-e` and `-ė→-e`, so
masculine `draugas` and feminine `draugė` both produce the identical vocative form "drauge".
`grammar_sentence` rows id=192 (display "Labas, draug___!", russian "Привет, друг!", masculine) and
id=202 (display "Sveiki, draug___!", russian "Привет, подруга!", feminine) use the same blank/answer
but assert opposite genders with nothing in `display` to disambiguate — unlike the existing precedent
at rows 416/417 ("Kiek ___ metų? (draugas)" / "(draugė)"), which already solves the identical dative
ambiguity by appending a parenthetical noun hint to `display`. Checked all 13 case_index=7 rows:
"drauge" is the only colliding full_word pair in the vocative case.

**Layer 2 — a genuine code bug, and what the user actually saw.** The report begins "от: draugė" —
that's the frontend's `sentenceFrom` hint label (`frontend/lib/i18n/ru.ts:200`, `'от: '`) plus
`task.base_lt`, rendered above the sentence whenever `base_lt` is truthy
(`GrammarTaskRunner.tsx:425-427`). In `backend/grammar_service.py`, `base_lt` is computed as
`_FORM_TO_NOMINATIVE.get(row.full_word) or _STEM_TO_NOMINATIVE.get(stem)` (line 308).
`_FORM_TO_NOMINATIVE["drauge"]` is correctly `None` (this exact collision was already handled once,
for issue #25 — comment at line 70 literally says "e.g. draugas/draugė"). But the fallback
`_STEM_TO_NOMINATIVE = {w[0]: w[0]+w[1] for w in WORDS}` is a plain last-write-wins dict, and "draug"
is the only duplicated stem in `backend/data/grammar/words.txt` (draugas then draugė) — so
`_STEM_TO_NOMINATIVE["draug"]` always resolves to "draugė", regardless of which row is being served.
This makes row 192 (masculine) incorrectly show "от: draugė". Editing only `display` (Layer 1) would
not fix this mislabel, since it's computed independently of `display`.

**Broader pass (user's explicit "check all similar cases" request):** grouped all non-archived
`grammar_sentence` rows by `lower(full_word)` and reviewed every group with >1 distinct `russian`
translation (80 groups). No other genuine gender-conflict instances found — all other duplicates are
legitimate (consistent-gender reuse across nouns, numeral agreement, or same-gender case/number
homographs). "draug" is also the only duplicated stem in `words.txt`, so the Layer-2 bug's blast
radius is exactly `full_word="drauge"` (ids 121, 192, 202) — nothing else is affected by either fix.

suggested_model/suggested_effort reason: narrow, well-precedented fix (two near-identical prior fixes
already exist in this codebase — issue #25's `_FORM_TO_NOMINATIVE` collision handling, and the
416/417 parenthetical-hint convention) but it spans a guarded SQL data fix, a precise Python
collision-detection change, a documentation update, and new tests across two test conventions —
more than a one-line change, so medium effort; sonnet is sufficient since the fix is pattern-following
against two already-solved examples in the same file, not novel architecture.

## Fix plan
- [x] 1. Run (after confirming current value): `UPDATE grammar_sentence SET display = 'Labas, draug___! (draugas)' WHERE id = 192 AND display = 'Labas, draug___!';`
- [x] 2. Run (after confirming current value): `UPDATE grammar_sentence SET display = 'Sveiki, draug___! (draugė)' WHERE id = 202 AND display = 'Sveiki, draug___!';`
- [x] 3. Re-select rows 192 and 202 (`SELECT id, display, answer_ending, full_word, russian FROM grammar_sentence WHERE id IN (192, 202);`) and confirm the `stem(display)+answer_ending == full_word` invariant still holds — this is the same check the admin API enforces at `backend/routers/admin.py:1074`, so this edit could equally be made via `/dashboard/admin/grammar` instead of raw SQL.
- [x] 4. In `backend/grammar_service.py`, change `_STEM_TO_NOMINATIVE` from a plain last-write-wins dict comprehension into a collision-aware loop (mirroring the existing `_FORM_TO_NOMINATIVE` pattern immediately above it, ~lines 64-84) so a stem with two different nominatives (only "draug" today) resolves to `None` instead of silently picking whichever gender was seen last in `words.txt`.
- [x] 5. Update the two adjacent code comments in `grammar_service.py` (~lines 64-66, ~70-71) to note this residual homograph gap and reference issue #161 alongside the existing issue #25 reference.
- [x] 6. Update `documentation/grammar-sentence-data-integrity.md` with a new section (matching the existing per-issue structure for #156/#158/#159) documenting the `_FORM_TO_NOMINATIVE` / `_STEM_TO_NOMINATIVE` distinction, that "draug" is the only duplicated stem in `words.txt`, and that this is an inherent Lithuanian homograph handled by hiding the ambiguous hint rather than "fixing" `words.txt`.
- [x] 7. Add a backend unit test alongside `backend/tests/test_grammar_practice_full_word.py`'s pattern: insert two sentinel `case_index` rows sharing `full_word="drauge"` with opposite genders, call `_generate_sentence_tasks`, assert `base_lt is None` for both.

## Tests
- [x] Write a Playwright test in `frontend/tests/` (e.g. `frontend/tests/issue-161-drauge-vocative-base-form.spec.ts`) that reproduces and verifies the fix for this issue: a mocked vocative task for the masculine "drauge" row does not render the "от: draugė" hint line, and `display` now includes the disambiguating "(draugas)"/"(draugė)" suffix.
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #161 — от: draugė / Привет, друг! (неправильный род). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 161;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
