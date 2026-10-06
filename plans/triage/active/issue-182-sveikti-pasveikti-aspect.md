---
kind: bugfix
status: in_progress
iteration: 1
max_iterations: 16
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #182 — /dashboard/lists/168/study

**Reported:** 2026-10-05 18:29:12
**Status:** open
**Description:** sveikti = выздоравливать → процесс
pasveikti = выздороветь → достигнуть результата

## Root cause
This is a data-only bug in the `word` rows of list 168 "Medicina". The code is fine. It is the same pattern as #75 (tense, list 166) and #152 (by-lemma qualifiers).

`_dedupe_by_translation` (`backend/routers/words.py:133`, keys from `_translation_keys` at `:110`) drops one word of any pair whose RU or EN translation collides. Here every aspect pair has the same EN text ("get better, recover", and so on). The present and past forms also share RU ("выздоравливает", "выздоровел"). The result:
1. sveikti and pasveikti, sveiksta and pasveiksta, sveiko and pasveiko never appear in one session, so the aspect contrast is never trained.
2. The prompt "выздоровел" can mean sveiko or pasveiko. The twin was deduped out, so the type-it stage (`QuizSession.tsx:~768`) marks the other aspect wrong.
3. `pickDistractors` / `buildOptions2r` (`QuizSession.tsx:146,177`) and the backend distractor query (`words.py:~683`) also drop same-translation options.

Duplicates: 4928 pasveikti and 4942 sveikti are already `archived = t` and have 0 progress rows, so they never reach the quiz. Their `word_list_item` rows (7810, 7817 in list 168; 6204, 6218 in list 144) are dead weight. The live copies 4930 and 4945 (list 144) share the same EN collision.

Suggested model/effort: haiku / low. Reason: data-only fix with the exact SQL and ids already checked, same shape as #75 and #152, no code path changes.

## Spec impact
Already described correctly in `specs/lists.md`, "Two words with the same translation never appear in one session" (~line 128). The data drifted into collisions. No spec change is needed.

## Fix plan
- [ ] 1. Get the user's approval for the prod write. Then apply the update, either through `PATCH /api/admin/content/words/{id}` (this evicts the `word` cache tag) or with this SQL (the cache refreshes after 600 s or a restart):
  ```sql
  BEGIN;
  UPDATE word SET translation_ru='выздоравливать', translation_en='be recovering, get better (gradually)' WHERE id IN (5451,4942,4945) AND lithuanian='sveikti';
  UPDATE word SET translation_ru='выздороветь', translation_en='recover (fully), get well' WHERE id IN (5447,4928,4930) AND lithuanian='pasveikti';
  UPDATE word SET translation_ru='выздоравливает', translation_en='is recovering, is getting better' WHERE id=5452 AND lithuanian='sveiksta';
  UPDATE word SET translation_ru='выздоравливает (полностью) / выздоровеет', translation_en='recovers (fully), gets well' WHERE id=5448 AND lithuanian='pasveiksta';
  UPDATE word SET translation_ru='выздоравливал/выздоравливала', translation_en='was recovering, was getting better' WHERE id=5453 AND lithuanian='sveiko';
  UPDATE word SET translation_ru='выздоровел/выздоровела', translation_en='recovered (fully), got well' WHERE id=5449 AND lithuanian='pasveiko';
  COMMIT;
  ```
- [ ] 2. Remove the dead list memberships of the archived duplicates (precedent #100). First confirm 0 progress rows:
  ```sql
  SELECT count(*) FROM user_word_progress WHERE word_id IN (4928,4942); -- must be 0
  DELETE FROM word_list_item WHERE id IN (7810,7817,6204,6218) AND word_id IN (4928,4942);
  ```
- [ ] 3. Verify. Expect 6 live rows with 6 distinct RU and 6 distinct EN values:
  ```sql
  SELECT w.id, w.lithuanian, w.translation_ru, w.translation_en FROM word_list_item wli JOIN word w ON w.id=wli.word_id
  WHERE wli.word_list_id=168 AND NOT w.archived AND w.lithuanian ~ '^(pa)?sveik' ORDER BY w.lithuanian;
  ```
- [ ] 4. Check `GET /api/lists/168/study` locally against prod data (after a restart, because of the cache) and confirm that both aspects can appear.
- [ ] 5. Out of scope: running `backend/scripts/audit_duplicate_translations.py` could find more aspect-pair collisions. That would be a separate triage item. Just mention it to the user.

## Tests
- [ ] pytest in `backend/tests/test_issue_182_aspect_dedupe.py`: feed `_dedupe_by_translation` the 6 list-168 words with the new translations and assert all 6 survive. Then set one EN value back to "get better, recover" and assert one word is dropped.
- [ ] Write `frontend/tests/issue-182-sveikti-aspect.spec.ts`: mock `**/api/lists/168/study` with 5453 sveiko and 5449 pasveiko using the new translations. Assert both prompts show in RU and EN. Take screenshots at 1280px and 375px, RU and EN, into `temp_files/screenshots/issue-182-sveikti-pasveikti-aspect/`.
- [ ] Run both: `cd backend && .venv/bin/python -m pytest tests/test_issue_182_aspect_dedupe.py -q` and `cd frontend && npx playwright test tests/issue-182-sveikti-aspect.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

- Both languages (RU + EN) checked
- Mobile at 375px checked
- Screenshots of each in `temp_files/screenshots/issue-182-sveikti-pasveikti-aspect/`

## Confirm resolution
Ask the user: "Issue #182 — sveikti/pasveikti aspect translations. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 182;` and report success.
2. Move this file to `plans/triage/implemented/IMPLEMENTED-issue-182-sveikti-pasveikti-aspect.md`.
