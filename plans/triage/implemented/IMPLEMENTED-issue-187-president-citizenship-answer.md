---
kind: bugfix
status: done
iteration: 5
max_iterations: 12
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #187 — /dashboard/practice/1

**Reported:** 2026-10-13 18:09:17
**Status:** open
**Description:** Неверный ответ на вопрос в тесте на Конституцию Литвы: Kurios valstybės piliečiu turi būti kandidatas į Lietuvos Prezidento postą?

## Root cause

Confirmed in production data. `practice_question` id 41 (test 1, «Пример теста Конституция Литвы»,
published, free) asks «Kurios valstybės piliečiu turi būti kandidatas į Lietuvos Prezidento postą?»
with options a `ES piliečiu`, b `Lietuvos piliečiu nuo gimimo`, c `Lietuvos piliečiu`,
d `Bet kurios NATO šalies piliečiu` and `correct_option = 'c'`. Constitution art. 78: «Respublikos
Prezidentu gali būti renkamas Lietuvos pilietis **pagal kilmę**…» — the answer is b. The reporter is
correct.

The same wrong row exists in the legacy `constitution_question` table (id 41, RU options, also
`'c'`) and in its seed file `backend/data/constitution/questions.json` (lines 362–370, last entry),
which `backend/seed_constitution.py` / `migrate_to_practice_tests.py` load from. The LT text of
test 1 lives only in the DB. No other test carries the error (checked on prod).

Option b reads «nuo gimimo» (from birth); art. 78's exact term is «pagal kilmę» (by origin). Exam
takers need to recognise the official term, so change option b's wording in the same UPDATE.

Stored history needs no change: `practice_exam_result` / `constitution_exam_result` keep only
score/total, and knowledge checks exclude category 1 (`CHECK_EXCLUDED_CATEGORY_IDS` in
`backend/knowledge_check_service.py:21`).

Same shape as `plans/triage/implemented/IMPLEMENTED-issue-178-seimas-member-min-age.md`.

Suggested model/effort: haiku / low — data-only fix: one JSON field, two guarded single-row
UPDATEs, one small pytest; identical precedent in #178.

## Spec impact

`specs/practice.md` describes test behavior, not question content. Already described correctly — no
behavior change, no spec edit.

## Fix plan
- [x] 1. `backend/data/constitution/questions.json`: on «Гражданином какого государства должен быть кандидат на пост Президента Литвы?» change `"correct_option": "c"` → `"b"`. Leave the RU wording (legacy, not shown to students).
- [x] 2. Production: `UPDATE practice_question SET correct_option = 'b', option_b = 'Lietuvos piliečiu pagal kilmę' WHERE id = 41 AND test_id = 1 AND correct_option = 'c';` (expect 1 row).
- [x] 3. Production: `UPDATE constitution_question SET correct_option = 'b' WHERE id = 41 AND correct_option = 'c';` (expect 1 row).
- [x] 4. Note: `practice.py` / `constitution.py` read questions through `cache.get_or_load` (10-min TTL); a raw SQL update shows within 10 minutes, or right after a backend restart.

## Tests
- [x] Backend pytest instead of Playwright (the bug is a data value; a mocked Playwright test would pass before the fix). New `backend/tests/test_issue_187_president_citizenship.py`, style of `test_issue_185_vistiena_seed.py`: load `backend/data/constitution/questions.json`, find the question by `question_ru`, assert `correct_option == "b"`. Plus a prod data check: `SELECT id, option_b, correct_option FROM practice_question WHERE id = 41; SELECT id, correct_option FROM constitution_question WHERE id = 41;` → both `'b'`, option_b reads «pagal kilmę».
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_issue_187_president_citizenship.py -q`

## Review
- [x] Code review passed (round 5)
- Note: the Definition of Done runs Playwright, which does not exercise this data fix; the pytest in Tests is the real check.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #187 — Неверный ответ на вопрос в тесте на Конституцию Литвы: Kurios valstybės piliečiu turi būti kandidatas į Lietuvos Prezidento postą?. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 187;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (→ `plans/triage/implemented/IMPLEMENTED-issue-187-president-citizenship-answer.md`).
