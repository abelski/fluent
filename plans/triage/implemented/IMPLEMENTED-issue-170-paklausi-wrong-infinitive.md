---
kind: bugfix
status: done
iteration: 1
max_iterations: 10
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #170 — /dashboard/lists/178/study

**Reported:** 2026-09-09 07:07:57
**Status:** open
**Description:** "спросить" - paklausiti, а не paklausi (the Lithuanian infinitive for "спросить"/"to ask" is stored incorrectly)

## Root cause
Two `word` rows (id 4307, archived, and id 5707, active — both linked into list 178 among others) store the Lithuanian infinitive "to ask" as `lithuanian='paklausi'`, which is actually the 2nd-person singular future/present form ("(tu) paklausi" = "you will ask"), not the infinitive "paklausti". Correct sibling rows exist for other tenses (id 5708 `paklausia`=present "asks", id 5709 `paklausė`=past "asked"), confirming this word family was manually entered and the infinitive form was simply mistyped/mis-selected for these two entries. A DB-wide heuristic scan (`translation_en LIKE 'to %'` with Lithuanian not ending in `-ti`/`-tis`) found no other cases of this exact bug pattern, and there is no word-generation/import script that produces single vocabulary words (only `import_phrase_programs.py`, unrelated) — this is an isolated manual data-entry mistake, not a recurring pipeline bug. (Suggested tier: sonnet/low — pure two-row content fix via an existing, already-tested admin PATCH endpoint with no code/schema changes and no risk to FK-linked progress data.)

## Fix plan
- [x] 1. Do not write raw SQL directly against production for the fix — use the existing admin content-editing API (`PATCH /api/admin/content/words/{word_id}` in `backend/routers/admin.py`, added for issue #166) so the same server-side invariant guard (`_accented_matches_lithuanian`, requiring the asterisk-stripped `accented` text to exactly match `lithuanian`) is enforced and the change is auditable through normal admin tooling rather than a bypass. This is safe because no other table joins on the text value of `Word.lithuanian`/`Word.accented` — `UserWordProgress`, `WordListItem`, etc. all key on the integer `word.id`, so editing the text fields in place cannot break FK integrity, quiz history, or SM-2 spaced-repetition state.
- [x] 2. For word id 5707 (active row, linked into list 178 at `word_list_item.id=8808`, currently `lithuanian='paklausi'`, `accented='paklau*si*'`): PATCH with `lithuanian='paklausti'`, `translation_en='ask'`, `translation_ru='спросить'`, `accented='pa*klaus*ti'` (matches the app's established stress-mark convention observed on comparable `pa-`-prefixed infinitives, e.g. id 5920 `paskelbti`→`pa*skelbt*i`, id 4930 `pasveikti`→`pa*svei*kti`, id 5704 `pakeisti`→`pa*kei*sti` — stress falls on the root syllable right after the `pa-` prefix, which is `klaus` here).
- [x] 3. For word id 4307 (archived row, still linked into `word_list_item` rows for lists 178, 117, 116; currently `accented=NULL`): PATCH with the same corrected values — `lithuanian='paklausti'`, `translation_en='ask'`, `translation_ru='спросить'`, `accented='pa*klaus*ti'` — for data consistency across the archived duplicate, even though it's excluded from active study sessions (`GET /api/lists/{id}` filters `Word.archived == False` in `backend/routers/word_lists.py`). Done via direct SQL UPDATE (admin PATCH endpoint 404s on archived rows), user-approved.
- [x] 4. Verify via `GET /api/lists/178` (or the study UI at `/dashboard/lists/178/study`) that the word now renders as `paklausti` / `спросить` / `ask` with correct stress marking, and confirm id 5708 (`paklausia`) and id 5709 (`paklausė`) are untouched.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (verify list 178's study session shows the corrected `paklausti` word/translation/stress).
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #170 — \"спросить\" - paklausiti, а не paklausi. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 170;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-170-paklausi-wrong-infinitive.md` → `plans/triage/implemented/IMPLEMENTED-issue-170-paklausi-wrong-infinitive.md`).
