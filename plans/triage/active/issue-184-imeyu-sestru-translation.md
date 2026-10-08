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

# Issue #184 — /dashboard/grammar/

**Reported:** 2026-10-08 07:30:02
**Status:** open
**Description:** Я имею сестру. - нужно поправить перевод он звучит не хорошо

## Root cause
`grammar_sentence` id=37 (`Aš turiu ses___.`, case_index 4 = accusative) has the calqued Russian
translation `Я имею сестру.` Natural Russian for `turėti` is `У меня есть …`. Every other
`turi`/`neturi` row in the seed already uses that form (`У меня много друзей.`, `У Руты нет книги.`).
Prod check on 2026-10-08: id=37 is the only row matching `име(ю|ет|ем|ешь|ют|ете)`.

The `russian` field is only a translation line under the sentence (`GrammarTaskRunner.tsx` ~553).
It is not a case hint. The case comes from the lesson, the form hint from `base_lt`, and the #60
multiple-choice options from the Lithuanian paradigm. So the Russian line does not need to mirror
the accusative.

Content lives in two places: the prod DB (source of truth) and
`backend/data/en_content/grammar_sentences.json` (~line 365). `scripts/apply_en_content.py` matches
rows by `(case_index, display, russian)` and aborts on an unmatched key, so both places must change
to the same string.

Cache: the sentence pool is cached with tag `grammar_sentence` (`backend/grammar_service.py` ~471).
An admin-panel edit evicts it. Raw SQL does not, so the old text can show for up to 600s
(`backend/cache.py` `DEFAULT_TTL`).

Suggested haiku/low because it is one data row, one JSON line and one test assert, with no code
logic change.

## Spec impact
`specs/grammar.md` describes behavior only and has no sentence-content scenarios. No spec change
is needed: this is a data fix.

## Fix plan
- [x] 1. In `backend/data/en_content/grammar_sentences.json`, change `"russian": "Я имею сестру."` to `"russian": "У меня есть сестра."`. Keep `english` as `"I have a sister."`.
- [ ] 2. Hand the prod update to the user. Do not run it from the loop. Preferred route: the admin panel, edit grammar sentence id=37 (this evicts the cache). Fallback: `UPDATE grammar_sentence SET russian='У меня есть сестра.' WHERE id=37 AND russian='Я имею сестру.';` (expect 1 row; the cache clears within 600s).
- [ ] 3. After the prod update, confirm with `SELECT russian FROM grammar_sentence WHERE id=37;`.

## Tests
- [x] Add a pytest to `backend/tests/test_en_content.py`, next to `test_no_ona_character_name`. It loops over `grammar_sentences.json` and asserts that no `russian` value matches `\bимею\b|\bимеет\b` (case-insensitive). Give it a docstring naming #184. (Use a backend pytest, not Playwright: a mocked-API UI test would only test the mock.)
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_en_content.py -q`

## Review
- [x] Code review passed (round 1)
- Note: prod row id=37 still has the old text until the user updates it. Don't run `apply_en_content.py` before then.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest tests/test_en_content.py -q
cd frontend && npx playwright test --reporter=list
```

## DoD result (2026-10-08)
- pytest `tests/test_en_content.py`: 18 passed.
- Playwright: 1042 passed, 4 failed. All 4 fail the same way with this diff stashed, so they predate it (likely #60 changed the basic-level answer shape and the retry screen):
  `issue-158…:82`, `issue-158…:123`, `issue-159…:99`, `navigation.spec.ts:224`. Not fixed here (out of scope).

## Confirm resolution
Ask the user: "Issue #184 — Я имею сестру. - нужно поправить перевод он звучит не хорошо. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 184;` and report success.
2. Move this plan file to `plans/triage/implemented/IMPLEMENTED-issue-184-imeyu-sestru-translation.md`.
