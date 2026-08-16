---
kind: bugfix
status: done
iteration: 1
max_iterations: 8
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #155 — /dashboard/lists/156/study

**Reported:** 2026-08-16 12:01:06
**Status:** open
**Description:** В прилагательных aukštas -- "этаж". Наверное должно быть "высокий". (In the adjectives list, "aukštas" shows "этаж"/floor. It's probably supposed to be "высокий"/tall-high.)

## Root cause
Historical data-migration bug, not a live code bug. List 156 ("Būdvardžiai"/Adjectives) replaced an old, now-archived list 108 ("adjectives_descriptors"). During that migration, the word "aukštas" was matched purely by Lithuanian spelling and got linked (via `word_list_item` id=8327) to a pre-existing, unrelated **noun** row (`word.id=3290`, "floor"/"этаж", hint=`daiktavardis`) that is correctly used elsewhere (lists 189, 192, 210, 72, 100, 101, 136, 137, 170). The correct **adjective** row (`word.id=4050`, "tall, high"/"высокий", hint=`būdvardis`) exists and is already linked via `word_list_item` id=7382, but it has `archived=True`, so `_list_words()` in `backend/routers/words.py:90-98` (the single source of truth for study-session word selection, filtering `Word.archived == False`) silently excludes it. Net effect: list 156 serves the noun "floor" where the adjective "tall/high" belongs, and the correct word is unreachable. Confirmed via `backend/routers/admin.py` (lines 914-1006) that the admin panel has no endpoint today to unarchive a word, delete/replace a list item, or add a word to a list — this requires a direct DB correction, not an app-code change.
**suggested_model/suggested_effort reason:** Bounded 3-statement SQL correction against an already-diagnosed schema, no app code touched, single-list blast radius — sonnet/low is sufficient.

## Fix plan
- [x] 1. Re-verify current state immediately before applying (data may drift):
      ```sql
      SELECT id, lithuanian, translation_en, translation_ru, hint, archived FROM word WHERE id IN (3290, 4050);
      SELECT id, word_list_id, word_id, position FROM word_list_item WHERE id IN (7382, 8327);
      ```
- [x] 2. Unarchive the correct adjective word (safe — its only other list reference, list 108, is itself archived, so this does not resurrect a user-visible list):
      ```sql
      UPDATE word SET archived = false WHERE id = 4050;
      ```
- [x] 3. Repoint the active list item (position 26 in list 156) from the wrong noun to the correct adjective:
      ```sql
      UPDATE word_list_item SET word_id = 4050 WHERE id = 8327;
      ```
- [x] 4. Delete the now-redundant leftover item that also points at word 4050 in list 156 (position 0), to avoid "aukštas" appearing twice once 4050 is unarchived:
      ```sql
      DELETE FROM word_list_item WHERE id = 7382;
      ```
- [x] 5. Leave word 3290 ("floor") and its other `word_list_item` rows untouched — it's correctly used in other lists; only its link to list 156 is being removed. No `user_word_progress` migration needed since no rows exist yet for word_id 4050 (never served while archived).
- [x] 6. Post-fix verification query — expect exactly one row for "aukštas" in list 156, with word_id=4050, translation_ru='высокий', archived=false:
      ```sql
      SELECT wli.id, wli.position, w.id, w.lithuanian, w.translation_ru, w.hint, w.archived
      FROM word_list_item wli JOIN word w ON w.id = wli.word_id
      WHERE wli.word_list_id = 156 AND w.lithuanian = 'aukštas';
      ```

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue: navigate to `/dashboard/lists/156` (or `/study`), confirm the word "aukštas" shown to the user has translation "высокий" (RU) / "tall, high" (EN), not "этаж"/"floor (storey)".
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list` (`frontend/tests/issue-155-aukstas-adjective-translation.spec.ts` — passed)

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Verification notes (2026-08-16)
- Live confirmation: `curl http://localhost:8000/api/lists/156` and a browser render of
  `/dashboard/lists/156` both show "aukštas" → "высокий" / "tall, high" / `būdvardis`, not
  "этаж"/"floor (storey)".
- New regression test `frontend/tests/issue-155-aukstas-adjective-translation.spec.ts` passes.
- Full suite (`npx playwright test --reporter=list`) run against the properly-configured backend
  (`DEV=false`, freshly rebuilt static export — see `documentation/plan-implement-workflow.md`
  "Gotchas" for why `DEV=true` in `.env` breaks this gate) went from 15 failing to 7 failing. The
  remaining 7 (`issue-117-en-translation-fallback`, `lists-progress-parallel`, `news` EN toggle,
  `phrase-lists` i18n, `quota` premium badge, `stats-card-alignment` premium banner ×2) are
  pre-existing and unrelated to this fix — none reference word 3290/4050, `word_list_item`
  7382/8327, or list 156. Left out of scope for issue #155; worth a separate triage pass.

## Confirm resolution
Ask the user: "Issue #155 — В прилагательных aukštas -- \"этаж\". Наверное должно быть \"высокий\". Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 155;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-155-aukstas-wrong-translation-adjectives-list.md` → `plans/triage/implemented/IMPLEMENTED-issue-155-aukstas-wrong-translation-adjectives-list.md`).
