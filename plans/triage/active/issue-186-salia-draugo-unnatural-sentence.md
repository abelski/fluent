---
kind: bugfix
status: draft
iteration: 0
max_iterations: 14
suggested_model: haiku
suggested_effort: low
confirmed_model: null
confirmed_effort: null
---

# Issue #186 — /dashboard/check/

**Reported:** 2026-10-09 21:06:27
**Status:** open
**Description:** Šalia ___ yra parduotuvė. / Рядом с другом есть магазин. — это семантически не корректно

## Root cause
Bad data, no code bug. `grammar_sentence` id 87 (case_index 2, genitive after *šalia*):
`Šalia draug___ yra parduotuvė.` / ending `o` / answer `draugo` / RU `Рядом с другом есть магазин.` /
EN `There is a store near my friend.` A store "next to my friend" is not a real-world location.
Same class as #162 (plausibility invariant in `documentation/grammar-sentence-data-integrity.md`).
`namo` is already used in case_index 2 (`Ten nėra nam___.`), so the replacement word is `parko`.

Stored `knowledge_check.tasks_json` stays untouched: those are historical rows, and grading only compares `answer`.
Cache: an out-of-process UPDATE shows up within the 600s TTL (`backend/cache.py`).

suggested_model haiku / effort low — one guarded row update plus a JSON edit, the same shape as #162.

## Spec impact
Data-only fix. `documentation/grammar-sentence-data-integrity.md` (plausibility invariant) already describes this correctly; the data drifted from it.

## Fix plan
- [ ] 1. Confirm `parko` is free: `SELECT id, display FROM grammar_sentence WHERE case_index=2 AND display ILIKE 'Šalia park%' OR (case_index=2 AND lower(<answer col>)='parko');` returns 0 rows. Fallback: `banko` / `teatro`.
- [ ] 2. Run the guarded update (via `backend/.venv/bin/python` + psycopg). Set display `Šalia park___ yra parduotuvė.`, ending `o`, answer `parko`, RU `Рядом с парком есть магазин.`, EN `There is a store next to the park.`, with `WHERE id=87 AND display='Šalia draug___ yra parduotuvė.'`. Re-SELECT to confirm.
- [ ] 3. Make the same edit in `backend/data/en_content/grammar_sentences.json`, because `apply_en_content.py` matches on `(case_index, display, russian)`. Grep `backend/` for `draug___` to find other seed copies.
- [ ] 4. Add #186 to the plausibility section of `documentation/grammar-sentence-data-integrity.md`.

## Tests
- [ ] Write `frontend/tests/issue-186-salia-draugo.spec.ts` (follow the issue-162 spec). Fetch `/api/grammar/lessons/2/tasks` and assert that no task pairs `draug` with `parduotuvė`.
- [ ] Run it: `cd frontend && npx playwright test tests/issue-186-salia-draugo.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #186 — Šalia ___ yra parduotuvė / Рядом с другом есть магазин — семантически некорректно. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 186;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-186-salia-draugo-unnatural-sentence.md`.
