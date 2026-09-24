---
kind: bugfix
status: done
iteration: 1
max_iterations: 12
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #179 — /dashboard/review/

**Reported:** 2026-09-23 20:18:18
**Status:** open
**Description:** член / DAIKTAVARDIS / Не совсем / Вы написали:_____ / Правильно: narys — откуда такое слово и надо ли оно

## Root cause
The reporter's word is `word.id = 5877` `narys` (public list 182 "Rinkimai ir demokratija"). It is a real, useful
word (member of a party or of the Seimas; the constitution program uses "Seimo narys"). But the review prompt is
just «член» with no context, so the learner can't tell what is meant, and the Russian word also has a crude
second meaning. `nariai` (5878, «члены") in the same list has the same problem. List 182 has no seed file in the
repo, so this is a data-only fix: no seed script will undo it. Follows the #110/#152/#174 precedent: the qualifier
goes in brackets in `translation_ru`, and `hint` stays `daiktavardis`.

Out of scope: rows 7809/8052/8371 (`Narys`, with Russian text in `translation_en`) belong to one user's
**personal** lists 312–328 (`is_public=false`). en=ru there is by design: `add_my_word` and `bulk_add_my_words`
(`backend/routers/word_lists.py:379-418`) save the one typed translation into both columns. Don't edit them.

Review endpoints (`backend/routers/words.py:936-1100`) read `Word` directly, with no cache. The list and study
paths go through `backend/cache.py` (10-minute TTL), so the change shows up there within 10 minutes or after a
restart.

Suggested sonnet/low: two guarded row updates plus a copied Playwright spec. No code, schema or cache change.

## Fix plan
- [x] 1. Re-check the rows: `SELECT id, lithuanian, translation_ru, translation_en, hint FROM word WHERE id IN (5877, 5878);`
- [x] 2. Run guarded updates (pattern in `documentation/grammar-sentence-data-integrity.md`):
  ```sql
  UPDATE word SET translation_ru = 'член (партии, парламента)',  translation_en = 'member (of a party, parliament)'
  WHERE id = 5877 AND translation_ru = 'член';
  UPDATE word SET translation_ru = 'члены (партии, парламента)', translation_en = 'members (of a party, parliament)'
  WHERE id = 5878 AND translation_ru = 'члены';
  ```
  Leave `hint`, `accented` and `part_of_speech` as they are. The admin `PATCH /api/admin/content/words/{id}`
  (`backend/routers/admin.py:924`) works too.
- [x] 3. Re-run the step 1 query to confirm the change. Check that no other word in list 182 uses these strings.
- [x] 4. Do not touch personal lists 307, 308 or 312–328. No code, schema or `user_word_progress` changes.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue:
  `frontend/tests/issue-179-narys-translation.spec.ts`. Copy `issue-174-teirautis-translation.spec.ts` (fake JWT, plus
  mocks for `**/api/lists/*/study**`, `**/api/me/settings` and `**/api/words/*/progress`). Mock
  `narys → член (партии, парламента)` and `nariai → члены (партии, парламента)`, then assert the qualified text
  renders and the bare «член» never appears on its own.
- [x] Run it: `cd frontend && npx playwright test tests/issue-179-narys-translation.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #179 — член / narys: откуда такое слово и надо ли оно. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 179;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix
   (`plans/triage/implemented/IMPLEMENTED-issue-179-narys-bare-chlen-prompt.md`).
