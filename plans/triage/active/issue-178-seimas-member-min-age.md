---
kind: bugfix
status: done
iteration: 1
max_iterations: 12
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #178 — /dashboard/practice/1

**Reported:** 2026-09-23 18:18:09
**Status:** open
**Description:** Минимальный возраст для членства в сейме - 21 год а не 24

## Root cause

Confirmed in production data. `practice_question` id 23 (test 1, «Пример теста Конституция Литвы»,
published) asks «Каков минимальный возраст для членства в Сейме?» / «Koks minimalus amžius Seimo
narystei?» with options a `18 metų`, b `21 metai`, c `24 metai`, d `28 metų` and
`correct_option = 'c'` (24). The Constitution (art. 56) set 25 before the 2022 amendment and 21
after it — 24 was never right. The reporter is correct: the answer is b (21).

The same wrong row exists in the legacy `constitution_question` table (id 23, RU options, also
`'c'`) and in its seed file `backend/data/constitution/questions.json` (line ~201), which
`backend/seed_constitution.py` / `migrate_to_practice_tests.py` load from — fixing only the DB
would let a re-seed bring the bug back.

Other tests already have it right: `practice_question` 292 (test 33), 342 (test 38), 472
(test 51) all mark `21 metų` correct.

Suggested model/effort: haiku / low — data-only fix, two single-row UPDATEs plus one JSON field.

## Fix plan
- [x] 1. `backend/data/constitution/questions.json`: on «Каков минимальный возраст для членства в Сейме?» change `"correct_option": "c"` → `"b"`.
- [x] 2. Production: `UPDATE practice_question SET correct_option = 'b' WHERE id = 23 AND correct_option = 'c';` (expect 1 row).
- [x] 3. Production: `UPDATE constitution_question SET correct_option = 'b' WHERE id = 23 AND correct_option = 'c';` (expect 1 row).
- [x] 4. Note: `practice.py`/`constitution.py` read questions through `cache.get_or_load` (10-min TTL); a direct SQL update is visible within 10 minutes, or immediately after a backend restart.

## Tests
- [x] Data check instead of a Playwright test (the bug is a DB value, not UI): query both rows and assert `correct_option = 'b'` and the `b` option reads 21; assert no row in `practice_question` or `constitution_question` still marks a «24» option correct for a Seimas-age question.
- [x] Run: `backend/.venv/bin/python` with the query above against `DATABASE_URL` from `backend/.env`.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #178 — Минимальный возраст для членства в сейме - 21 год а не 24. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 178;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (→ `plans/triage/implemented/IMPLEMENTED-issue-178-seimas-member-min-age.md`).
