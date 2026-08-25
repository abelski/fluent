---
kind: bugfix
status: done
iteration: 1
max_iterations: 16
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #162 — /dashboard/grammar/

**Reported:** 2026-08-24 09:53:51
**Status:** open
**Description:** -ai→-uose (namuose), -iai→-iuose (broliuose), -os→-ose (knygose), -ės→-ėse (gatvėse). - нахождение в братьях не имеет смысла с точки зрения реальности. надо проверить все подобные кейсы.

## Root cause

`grammar_case_rule.transform` for cases 6 and 13 (both "Vietininkas" / locative — "where is X
located") uses `brolis` ("brother") as the illustrative example noun for the masculine `-is`
declension pattern. Locative case expresses physical/abstract containment ("in/at X"), and a
kinship term for a person is not a plausible container/location — "in a brother" (`brolyje`) / "in
brothers" (`broliuose`) doesn't parse as a real-world "where" answer, unlike the other examples in
each of those same transform strings (`namuose`, `knygose`, `gatvėse` — houses, books, streets, all
genuine "where" answers). This is a distinct defect class from the two already-documented
invariants in `documentation/grammar-sentence-data-integrity.md` (ending↔answer consistency, and
example-word-duplicates-a-graded-answer) — it's about real-world plausibility of the example
itself, previously unaudited for hand-authored rule cards.

`backend/grammar_service.py` already encodes exactly this concern for the auto-generated
declension exercises: `_PLACE_STEMS` (lines 88–107) and `_LOCATION_CASES = frozenset([6, 13])`
(line 110) restrict the *auto-generated* locative sentence pool to genuine place/institution
nouns "so every prompt makes semantic sense as a location" — and `brol` is deliberately **not** in
that set. The hand-written rule-card `transform` text for the same two cases was never held to
that same standard.

**Full audit of all `grammar_case_rule.transform` rows (case_index 1–20)** found exactly two
offending rows — both locative, both using `brolis`: case 6 (id=10, singular, `brolis→brolyje`)
and case 13 (id=9, plural, `broliuose`, the reported row). No other case_index has an analogous
real-world-plausibility problem (genitive/dative/accusative/instrumental/vocative examples using
`brolis`/`broliai`/etc. are all semantically fine for those cases — "of a brother", "to a brother",
"with brothers" are all natural).

**Replacement word:** `maišelis` ("bag/package") — a masculine `-is`-declension noun already used
elsewhere in this exact rule set (case 7's vocative example), where "located inside a bag" is
real-world plausible. Verified via live DB query that `maišelyje`/`maišeliuose` are not currently
graded `full_word` answers in case 6 or case 13's live sentence pools, so the fix does not
introduce a new "example duplicates an answer" leak.

suggested_model/suggested_effort reason: two rows, both current/new `transform` strings and guarded
`WHERE` clauses fully specified below, replacement word pre-verified against both cases' live
answer pools, no open design decisions — same narrow, well-precedented shape as issues #158/#159.

## Fix plan
- [x] 1. Guarded UPDATE for case 6 (id=10, "Местный / Vietininkas"): `UPDATE grammar_case_rule SET transform = '-as→-e (namas→name), -is→-yje (maišelis→maišelyje), -ys→-yje (kambarys→kambaryje), -a→-oje (knyga→knygoje), -ė→-ėje (gatvė→gatvėje), -us→-uje (muziejus→muziejuje).' WHERE id = 10 AND case_index = 6 AND transform = '-as→-e (namas→name), -is→-yje (brolis→brolyje), -ys→-yje (kambarys→kambaryje), -a→-oje (knyga→knygoje), -ė→-ėje (gatvė→gatvėje), -us→-uje (muziejus→muziejuje).';`
- [x] 2. Guarded UPDATE for case 13 (id=9, "Местный мн.ч. / Vietininkas Dgs.", the reported row): `UPDATE grammar_case_rule SET transform = '-ai→-uose (namuose), -iai→-iuose (maišeliuose), -os→-ose (knygose), -ės→-ėse (gatvėse).' WHERE id = 9 AND case_index = 13 AND transform = '-ai→-uose (namuose), -iai→-iuose (broliuose), -os→-ose (knygose), -ės→-ėse (gatvėse).';`
- [x] 3. Re-`SELECT id, transform FROM grammar_case_rule WHERE id IN (9, 10)` immediately after and confirm both landed (via `backend/.venv/bin/python` + `psycopg`, parsing `DATABASE_URL` fresh from `backend/.env` — no `psql` on this machine; `GET /api/grammar/lessons` has no caching so the change is live immediately).
- [x] 4. Re-run `backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py` — expect no change in output (only an illustrative word changed, not an ending), confirming the ending-coverage invariant is untouched.
- [x] 5. Add a new section to `documentation/grammar-sentence-data-integrity.md` (mirroring the existing "Second invariant" section's style) documenting this third invariant: rule-card example nouns must be real-world plausible for the case's meaning, not just grammatically well-formed — cite issue #162, the two fixed rows (ids 9 and 10), note `brolis` was the only offending example noun and locative (cases 6/13) the only case type where this class of error occurs in current data, and cross-reference `_PLACE_STEMS`/`_LOCATION_CASES` in `backend/grammar_service.py` as prior art for the same concern in the sibling auto-generated-exercise code path.

## Tests
- [x] Write a Playwright test `frontend/tests/issue-162-locative-broliuose-nonsense.spec.ts` following the `frontend/tests/issue-159-dative-vocative-us-stem.spec.ts` live-data convention (absolute `http://localhost:8000` fetch, no relative-fetch pitfall): (a) fetch `/api/grammar/lessons`, find the case-13 lesson, assert `rule.transform` no longer contains `broliuose` and does contain `maišeliuose`; (b) same for the case-6 lesson, assert `transform` no longer contains `brolyje` and does contain `maišelyje`; (c) for both lessons, fetch `/api/grammar/lessons/{id}/tasks` and assert no task's `full_answer` (case-insensitive) is `brolyje`/`broliuose`/`maišelyje`/`maišeliuose`.
- [x] Run it: `cd frontend && npx playwright test frontend/tests/issue-162-locative-broliuose-nonsense.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #162 — nonsensical 'broliuose' (in-brothers) locative example. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 162;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-162-nonsensical-locative-example.md` → `plans/triage/implemented/IMPLEMENTED-issue-162-nonsensical-locative-example.md`).
