---
kind: bugfix
status: done
iteration: 1
max_iterations: 14
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #166 — /dashboard/review/

**Reported:** 2026-09-05 20:48:21
**Status:** open
**Description:** Elektroninis правильно. Проверяет правильно, но литовское слово показывает при изучении с ошибкой

## Root cause

The `word.accented` field for `word` id=5197 and id=5200 (both `lithuanian='elektroninis bilietas'`)
is `elek*tro*nis bi*lie*tas` — stripping the stress-mark asterisks gives "elektronis bilietas",
which is missing the "ni" from "elektroninis". Compare the correctly-formed sibling rows id=4529/4536
(`lithuanian='elektroninis laiškas'`, `accented='elek*tro*ninis laiškas'`).

`accented` is only ever written through `PATCH /content/words/{word_id}`
(`backend/routers/admin.py:900-927`), driven by a free-text `<input>` in the admin content editor
(`frontend/app/dashboard/admin/page.tsx:2843-2851`) — a manual typo, not a generator bug. It is
user-visible during study because `renderAccented` (`frontend/lib/renderAccented.tsx`) blindly
`split('*')`s the stored string for *display* in `QuizSession.tsx` (lines 1013, 1035), while
answer-*grading* in the same component is keyed off the separate `word.lithuanian` column —
exactly matching the report ("validates correctly, but... displays with an error"). No server-side
check currently verifies `accented` (asterisks stripped) equals `lithuanian`.

A DB-wide scan found this is a recurring class, not a one-off: 12 `word` rows (of 2,913 with
`accented` set) fail this invariant. Most are out of scope for this issue (see note below) — this
plan fixes the reported row plus adds the guard that prevents recurrence, following the identical
precedent already used for `grammar_sentence` in `documentation/grammar-sentence-data-integrity.md`
(issue #156).

**Out of scope (do not fix here):** the other ~10 pre-existing mismatched rows found in the audit
(id 5492 same bug class; ids 6000/6024/6602/6490 where `lithuanian` itself is wrong, not
`accented`; id 5112 an archived dead row; ids 6049-6052 cosmetic slash-spacing only) — these should
become their own follow-up if the user wants them addressed, since correcting `lithuanian` text
carries more linguistic-judgment risk than this issue's narrow `accented`-field fix. Also do not
touch the duplicate rows (4529/4536, 5197/5200) — deduplication is unrelated to this report.

**Model/effort reason:** `sonnet` / `medium` — the data fix alone is a one-line SQL UPDATE, but
closing the bug class requires a precise backend validation addition (write-time guard) plus a
read-time defensive filter and a new regression test, mirroring an existing in-repo pattern.

## Fix plan
- [x] 1. Apply a guarded, idempotent SQL UPDATE for the reported row (DB access: parse
  `DATABASE_URL` from `backend/.env`, run via `psycopg3` — there is no `psql` on this machine):
  ```sql
  UPDATE word
  SET accented = 'elek*tro*ninis bi*lie*tas'
  WHERE id IN (5197, 5200)
    AND lithuanian = 'elektroninis bilietas'
    AND accented = 'elek*tro*nis bi*lie*tas';
  ```
  Verify both rows afterward: `replace(accented,'*','') = lithuanian` must hold.

  **Outcome:** ran via inline `psycopg3` against production, parsing `DATABASE_URL` from
  `backend/.env`. Before: both rows had `accented='elek*tro*nis bi*lie*tas'`. The guarded UPDATE
  matched and updated exactly 2 rows. After: both rows now have
  `accented='elek*tro*ninis bi*lie*tas'`, and `replace(accented,'*','') = lithuanian` evaluates
  `True` for both ids 5197 and 5200.
- [x] 2. Add a shared invariant helper in `backend/routers/admin.py` (mirroring
  `_sentence_invariant_holds()` in `backend/grammar_service.py`):
  ```python
  def _accented_matches_lithuanian(accented: str, lithuanian: str) -> bool:
      return accented.replace("*", "").strip().casefold() == lithuanian.strip().casefold()
  ```

  **Outcome:** added verbatim (with a docstring referencing the `_sentence_invariant_holds`
  precedent and issue #166) directly above `WordUpdate`/`update_word` in `backend/routers/admin.py`.
- [x] 3. In `update_word` (`PATCH /content/words/{word_id}`, `backend/routers/admin.py:900-927`),
  after the existing `lithuanian`/`translation_ru` checks: if `body.accented` is set (non-empty
  after strip), reject with `HTTPException(400, "accented text (asterisks stripped) must match
  lithuanian exactly")` when `_accented_matches_lithuanian(body.accented, body.lithuanian)` is
  false. This is the only write path for `accented`, so this closes recurrence at the source.

  **Outcome:** added the guard in `update_word` right after the `star` check and before the
  `session.get(Word, word_id)` lookup (so a bad request never touches the DB): computes the
  stripped `accented` value once, then raises `HTTPException(400, "accented text (asterisks
  stripped) must match lithuanian exactly")` when `_accented_matches_lithuanian(accented,
  body.lithuanian)` is false. The existing `word.accented = ...` assignment now just reuses the
  already-validated `accented` local instead of recomputing it — no behavior change for the
  non-error path.
- [x] 4. In the word-serving endpoints that emit `"accented": w.accented`
  (`backend/routers/words.py:183, 525, 697, 1237`), only pass `accented` through if it satisfies
  the invariant against `w.lithuanian`; otherwise emit `None` so the frontend's existing
  `word.accented || word.lithuanian` fallback (`QuizSession.tsx`, `lists/[id]/page.tsx`,
  `programs/[key]/page.tsx`) naturally displays the correct plain word. This immediately
  neutralizes the display symptom for any of the other pre-existing mismatched rows too, without a
  data migration for each.

  **Outcome:** confirmed all 4 line numbers from the plan still matched exactly pre-edit. Added
  `from routers.admin import _accented_matches_lithuanian` (no circular import — `main.py` imports
  both `routers.words` and `routers.admin` independently; neither imports the other) plus a new
  `_safe_accented(w: Word) -> Optional[str]` helper in `backend/routers/words.py`, and replaced all
  4 `"accented": w.accented,` sites (`_list_words`, the study-session distractor list,
  `_word_to_dict`, `get_known_words`) with `"accented": _safe_accented(w),` /
  `"accented": _safe_accented(word)`-equivalent (all use loop variable `w`). Verified by import
  (`python3 -c "import routers.words, routers.admin"`) that the module loads without a circular
  import, and manually confirmed `_accented_matches_lithuanian` returns `True` for the now-fixed
  5197/5200 value and `False` for the old corrupted value.
- [x] 5. Add `backend/tests/test_admin_word_accented_validation.py` covering: (a) PATCH accepts a
  correct `accented` value; (b) PATCH rejects (400) an `accented` value whose asterisk-stripped
  text doesn't match `lithuanian`; (c) a word-serving GET endpoint omits/falls back correctly for a
  word whose stored `accented` fails the invariant. Follow fixture patterns from
  `backend/tests/test_extension.py` (`accented=` kwarg on `Word(...)`).

  **Outcome:** added `backend/tests/test_admin_word_accented_validation.py` with 5 tests (one extra
  beyond the 3 named cases): `test_patch_accepts_correct_accented` (a),
  `test_patch_rejects_mismatched_accented` — the exact issue #166 string — plus
  `test_patch_rejects_accented_missing_a_syllable` as a second mismatch shape (b), and
  `test_get_list_falls_back_when_stored_accented_is_invalid` plus
  `test_get_list_passes_through_valid_accented` (sanity check the fallback doesn't over-trigger on
  good data) against `GET /api/lists/{list_id}` (c). Follows `test_extension.py`'s
  `make_token`/`auth`/`SUPERADMIN_EMAIL` import pattern from `tests.test_word_lists` and the
  `accented=` kwarg on `Word(...)`; words with a deliberately-corrupt stored `accented` are inserted
  directly via `Session(database.engine)` to bypass the write-time guard (simulating a pre-existing
  row). Ran `cd backend && .venv/bin/python -m pytest tests/test_admin_word_accented_validation.py
  -v` → **5 passed**. Also ran the full suite, `cd backend && .venv/bin/python -m pytest tests/ -q`
  → **392 passed**, confirming no regression.

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-166-elektroninis-accented-mismatch.spec.ts`
  that reproduces and verifies the fix: load a study/review session containing word id 5197 or
  5200 and assert the rendered Lithuanian text is the full "elektroninis bilietas" (not
  "elektronis bilietas"), matching the rendering style of the correct sibling "elektroninis
  laiškas".

  **Outcome:** queried the DB (psycopg3 against `DATABASE_URL` from `backend/.env`, no `psql` on
  this machine) to find which list contains one of the two words: word id 5197 lives in public,
  non-archived list 177 ("Transportas ir kelionės"); id 5200 only lives in archived lists, so 5197
  was used. Added `frontend/tests/issue-166-elektroninis-accented-mismatch.spec.ts` mirroring the
  style of `issue-167-kveicia-spelling-error.spec.ts` (`request` fixture hitting the live backend
  at `GET /api/lists/177`, no page render/auth needed) and the endpoint choice already exercised by
  `backend/tests/test_admin_word_accented_validation.py::test_get_list_passes_through_valid_accented`.
  Two tests: (1) word id 5197's served `accented` is `'elek*tro*ninis bi*lie*tas'` and, asterisks
  stripped, equals `lithuanian` = `'elektroninis bilietas'`; (2) list 177 contains no word whose
  `accented` is the old corrupted `'elek*tro*nis bi*lie*tas'`.
- [x] Run it: `cd frontend && npx playwright test tests/issue-166-elektroninis-accented-mismatch.spec.ts --reporter=list`

  **Outcome:** confirmed local backend (`localhost:8000`, `DEV=true`) and frontend dev server
  (`localhost:3000`) were both already up (`curl` → 200 on both) before running. Ran the command as
  given → **2 passed** (2.2s), no failures, no fixes needed.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #166 — 'elektroninis bilietas' displayed as 'elektronis bilietas' during study due to a corrupted stress-mark field (also added a validation guard to prevent recurrence). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 166;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-166-elektroninis-accented-mismatch.md` → `plans/triage/implemented/IMPLEMENTED-issue-166-elektroninis-accented-mismatch.md`).
