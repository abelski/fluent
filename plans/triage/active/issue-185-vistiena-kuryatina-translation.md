---
kind: bugfix
status: draft
iteration: 0
max_iterations: 10
suggested_model: haiku
suggested_effort: low
confirmed_model: null
confirmed_effort: null
---

# Issue #185 — /dashboard/review/

**Reported:** 2026-10-09 19:09:11
**Status:** open
**Description:** не курица, а курятина

## Root cause
Seed data is wrong. Word 3338 `vištiena` (chicken meat) has `translation_ru='курица'`, `translation_en='chicken'` —
same as word 6054 `višta` (the bird). Source is likely `backend/seed_ne_dienos_2.py`.
Prior translation fixes (#121, #102) shipped as a direct prod `UPDATE` plus a regression spec; no migration.
Cache: in-app writes evict automatically; a direct Neon `UPDATE` shows within the 10-min TTL (`backend/cache.py`).

suggested_model haiku / effort low — one-row data update plus a test copied from an existing spec.

## Spec impact
Data-only fix; no behavior change. Vocabulary spec already expects correct translations — data drifted from it.

## Fix plan
- [ ] 1. Check for duplicates: `SELECT id, lithuanian, translation_ru, translation_en FROM word WHERE lithuanian ILIKE '%vištien%' OR lithuanian ILIKE 'višta%' ORDER BY id;`
- [ ] 2. `UPDATE word SET translation_ru='курятина', translation_en='chicken (meat)' WHERE lithuanian='vištiena';` — leave 6054 `višta` as is.
- [ ] 3. Fix the same strings in `backend/seed_ne_dienos_2.py` (and any other seed file grep finds).

## Tests
- [ ] Write a Playwright test `frontend/tests/issue-185-vistiena-translation.spec.ts` (copy `issue-121-rezervuoti-translation.spec.ts` pattern; mock review API; assert "курятина" shown, not "курица").
- [ ] Run it: `cd frontend && npx playwright test tests/issue-185-vistiena-translation.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #185 — не курица, а курятина. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 185;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-185-vistiena-kuryatina-translation.md`.
