---
kind: bugfix
status: done
iteration: 1
max_iterations: 14
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #174 — /dashboard/continue/

**Reported:** 2026-09-13 10:53:41
**Status:** open
**Description:** Susitvarkyti_ / Правильно: teirautis / Не справлятся, а спрашивать, узнавать

## Root cause
Confirmed in prod DB: `word` id 7363 `teirautis` (list 295 "Общение") has
`translation_ru = 'справляться, узнавать'`. "Справляться" reads as "cope", so the reporter typed
`susitvarkyti` (not in the DB at all) and was marked wrong. The same text is in `verb` id 309
`teiráutis`, and both seed scripts copy `verb.translation_ru` into `word`
(`backend/scripts/seed_verbs_vocabulary.py:136`, `backend/scripts/reseed_verbs_by_theme.py:179`),
so a reseed would bring the bug back unless the verb row is fixed too.

Scope checked: only `word` 7363 and `verb` 309 contain "справля…"; nothing in `phrase` /
`custom_phrase`. No tracked seed file holds the RU text (`temp_files/verbs_extracted.json` is
gitignored; `verb_translations_en.py:292` is EN-only and already correct). Verb 309 has
`programs=[]`, so no grammar lesson shows it. 2 users have progress on 7363.

Data-only: the typed-answer check (`QuizSession.tsx:710-719`) accepts the target plus any session
word with an identical translation, so changing the text changes nothing else.

Do NOT use the reporter's wording "спрашивать, узнавать": `klausti` (id 7340, `спрашивать`) is in
the same list 295, and a near-identical prompt would cause the reverse complaint. Use a bracketed
qualifier in `translation_ru` (the #110 / #152 pattern), and leave `hint` alone (#92).

Suggested sonnet/low: two rows get the same text change through an existing endpoint and one
UPDATE, with no code, schema or progress changes, plus a copy-paste test.

## Fix plan
- [x] 1. Re-check current rows: `SELECT id, lithuanian, translation_ru, translation_en, hint, star, accented FROM word WHERE id = 7363;` and `SELECT id, infinitive, translation_ru FROM verb WHERE id = 309;` — confirmed: `word` 7363 had `translation_ru='справляться, узнавать'`, `hint='глагол'`, `star=3`, `accented=None`; `verb` 309 had `translation_ru='справляться, узнавать'`.
- [x] 2. Update word 7363. No local backend server was running, so used the SQL fallback: `UPDATE word SET translation_ru = 'осведомляться, справляться (о ком-то)' WHERE id = 7363;` (1 row updated). Change will show within the 10-min cache TTL or after a restart (`documentation/caching.md`).
- [x] 3. Update verb 309 (no admin endpoint for verbs): `UPDATE verb SET translation_ru = 'осведомляться, справляться (о ком-то)' WHERE id = 309;` (1 row updated) — this stops a reseed from reverting step 2.
- [x] 4. Verify: re-ran step 1's queries, confirmed both rows show the new text `осведомляться, справляться (о ком-то)`, and confirmed 7340 `klausti` is still `спрашивать` and differs from the new prompt.
- [x] 5. No code, migration, or repo data-file changes; `translation_en` stays as `to inquire`.

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-174-teirautis-translation.spec.ts` that reproduces and verifies the fix. Copy the fake-JWT + route-mock setup from `issue-152-bendradarbis-kolega-distinct.spec.ts` / `issue-121-rezervuoti-translation.spec.ts`: mock `**/api/lists/*/study**` with `teirautis → осведомляться, справляться (о ком-то)` and `klausti → спрашивать` (plus `**/api/me/settings`, `**/api/words/*/progress`), open `/dashboard/lists/_/study`, assert the new text is visible, `справляться, узнавать` appears 0 times, and the two prompts differ. (Same `QuizSession` as `/dashboard/continue`.) The mocked test proves rendering only — step 4's query is the real proof the data changed.
- [x] Run it: `cd frontend && npx playwright test tests/issue-174-teirautis-translation.spec.ts --reporter=list` — 2 passed (see command output in report).

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #174 — Susitvarkyti_ / Правильно: teirautis / Не справлятся, а спрашивать, узнавать. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 174;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-174-teirautis-translation-disambiguation.md` → `plans/triage/implemented/IMPLEMENTED-issue-174-teirautis-translation-disambiguation.md`).
