---
kind: bugfix
status: done
iteration: 1
max_iterations: 14
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #177 — /dashboard/lists/196/study/

**Reported:** 2026-09-22 13:44:53
**Status:** open
**Description:** lipti - это не садиться там более чложный перевод. подняться или сесть но только в контексте транспорта

## Root cause
Word rows 5222 and 5557 (both non-archived, `lithuanian='lipti'`, `translation_en='get on'`,
`translation_ru='садиться'`) carry a translation that is only correct in the narrow, colloquial
sense "to climb/board (transport)" — the same sense already correctly captured, with an explicit
qualifier, on the sibling compound-verb rows 5206/5207 (`įlipti` → `translation_ru` "сесть (в
транспорт)") and 5208/5209 (`išlipti` → "выйти (из транспорта)"). Shown bare as "садиться" with no
qualifier, it reads as the generic "to sit down (in a chair)" — exactly the reporter's complaint.
A separate, already-correct general-sense row exists (id 7387: "лезть, подниматься") but that's
the *non-transport* "to climb/go up" meaning and doesn't belong in a transport-context list
(word_list 196 = "Kaip nuvažiuoti į universitetą?"), so merging with it would remove the transport
connotation the list is built around, not fix it. Same bug class as #121/#122/#134 (imprecise
`translation_ru` on a `word` row) — a plain data fix, no schema or code change.

Model/effort reason: a 1–2 row `translation_ru` text UPDATE with no code change, identical in
shape to the already-implemented #121/#122/#134 fixes — haiku/low, unless the scope query below
turns up 5222/5557 used in other lists needing a per-list judgment call.

## Fix plan
- [x] 1. Scope check — confirm no other list is affected before writing the UPDATE:
      `SELECT wli.id, wli.word_list_id, wl.title FROM word_list_item wli JOIN word_list wl ON wl.id = wli.word_list_id WHERE wli.word_id IN (5222, 5557) ORDER BY wli.word_id, wli.word_list_id;`
      If a non-transport list also uses 5222/5557, stop and re-plan — the fix below assumes both
      appearances are transport-context.
- [x] 2. Progress check (informational only — a `translation_ru` UPDATE never touches `word.id`,
      `word_list_item`, or `user_word_progress`, so this is just a sanity read):
      `SELECT word_id, COUNT(*), COUNT(DISTINCT user_id) FROM user_word_progress WHERE word_id IN (5222, 5557) GROUP BY word_id;`
- [x] 3. Apply the fix, mirroring the qualifier style already used on `įlipti`/`išlipti`:
      `UPDATE word SET translation_ru = 'садиться (в транспорт)' WHERE id IN (5222, 5557);`
      Leave `translation_en` untouched (already transport-idiomatic: "get on"). Leave id 7387
      (`лезть, подниматься`, distinct non-transport sense) and archived id 5223 untouched.
- [x] 4. Verify: `SELECT id, lithuanian, translation_ru, translation_en, archived FROM word WHERE id IN (5222, 5223, 5557, 7387) ORDER BY id;`
      — expect 5222 and 5557 → `садиться (в транспорт)`; 5223 and 7387 unchanged.
- [x] 5. If applied directly against production (not through the running backend process), note
      in the resolution summary that `backend/cache.py`'s 10-minute TTL on `_list_words` means the
      change surfaces within 10 minutes or immediately after restarting the Render service
      (see `documentation/caching.md`). No action needed for local/dev testing.

No backend/frontend code change is needed — `backend/routers/words.py` (`_load_list_words`,
`get_study_words`) already just reflects `word.translation_ru`, and `backend/routers/admin.py`'s
`PATCH /content/words/{word_id}` is the existing first-class admin edit path for this same field.

## Tests
- [x] Write a Playwright test in `frontend/tests/issue-177-lipti-translation.spec.ts` (copy the
      pattern from `frontend/tests/issue-134-keistis-translation.spec.ts`): mock
      `**/api/lists/196` with a word array containing
      `{ id: 5557, lithuanian: 'lipti', translation_ru: 'садиться (в транспорт)', translation_en: 'get on', ... }`,
      navigate to `/dashboard/lists/196`, assert `садиться (в транспорт)` is visible.
- [x] Run it: `cd frontend && npx playwright test tests/issue-177-lipti-translation.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #177 — lipti translation shown as 'садиться' is wrong/too narrow for the
transport-context list; fixed to 'садиться (в транспорт)'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 177;` and report success.
2. Move this plan file to `plans/triage/implemented/IMPLEMENTED-issue-177-lipti-transport-translation.md`.
