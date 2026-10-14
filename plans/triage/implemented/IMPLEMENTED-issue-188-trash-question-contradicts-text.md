---
kind: bugfix
status: done
iteration: 1
max_iterations: 8
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #188 (+ duplicate #189) — /dashboard/practice/2

**Reported:** 2026-10-14 08:58:34 (#188), 09:00:28 (#189)
**Status:** open
**Description:**
- #188: в тексте написано, что мусор выносит сын Инги, а дочь убирает свою комнату, а в тесте наоборот, что дочь выносит мусор
- #189: «Mano sūnus išneša šiukšles» в тексте так, а в тесте «Šiukšles išneša Ingos duktė» — и когда пишешь что это неправильно, выдает ошибку

#189 is the same bug from the same user two minutes later. One plan covers both; resolve both rows together.

## Root cause

Confirmed in production data. `practice_test` id 12 («13 skyrius — Darbai namie») has the passage
«Mano sūnus išneša šiukšles. Duktė valosi savo kambarį.» `practice_question` id 111 asks
«Šiukšles išneša Ingos duktė.» with `correct_option = 'a'` (Teisingas). Per the text it is false →
should be `'b'` (Neteisingas). The reporters are right; picking "Neteisingas" is graded wrong
(the "error" in #189).

(The URL says `/practice/2` — that is the program/category id, not the test id.)

Source of the bad value: `backend/scripts/seed_skaitymas_new.py:286`. The older
`backend/scripts/seed_skaitymas.py:304` has the same tuple, but its passage says «Dukrytė Karolina
išneša šiukšles», so there `'a'` is correct — leave it alone.

Other 7 questions of test 12 checked against the text: all correct.

Suggested model/effort: haiku / low — data-only: one seed tuple, one guarded UPDATE, one small pytest;
same shape as #187.

## Spec impact

`specs/practice.md` describes test behavior, not question content. Already described correctly —
no behavior change, no spec edit.

## Fix plan
- [x] 1. `backend/scripts/seed_skaitymas_new.py:286`: change `("Šiukšles išneša Ingos duktė.", "a")` → `"b"`.
- [x] 2. Production: `UPDATE practice_question SET correct_option = 'b' WHERE id = 111 AND test_id = 12 AND correct_option = 'a';` (expect 1 row).
- [x] 3. Note: `practice.py` reads questions through `cache.get_or_load` (10-min TTL); a raw SQL update shows within 10 minutes, or right after a backend restart.

## Tests
- [x] Backend pytest (the bug is a data value; a mocked Playwright test would pass before the fix). New `backend/tests/test_issue_188_trash_question.py`, style of `test_issue_185_vistiena_seed.py`: import the lesson list from `scripts/seed_skaitymas_new.py`, find the «Darbai namie» lesson, assert the «Šiukšles išneša Ingos duktė.» question has answer `"b"`. Plus prod check: `SELECT id, correct_option FROM practice_question WHERE id = 111;` → `'b'`.
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_issue_188_trash_question.py -q`

## Review
- [x] Code review passed (round 1)

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issues #188 and #189 — trash question in «Darbai namie» contradicts the text. Mark both as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id IN (188, 189);` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (→ `plans/triage/implemented/IMPLEMENTED-issue-188-trash-question-contradicts-text.md`).
