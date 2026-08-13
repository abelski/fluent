---
kind: bugfix
status: done
iteration: 1
max_iterations: 8
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #154 — /dashboard/review/

**Reported:** 2026-08-12 15:57:17
**Status:** open
**Description:** кончить, кончать - лучше сказать закончить заказнчивать
(User feedback while reviewing the word "baigti": the Russian translation "кончить, кончать" should
instead be "закончить, заканчивать".)

## Root cause
The `word` table has 5 rows for the Lithuanian lemma "baigti" ("to finish"). Four correctly use
`translation_ru = "закончить"`. One row, **id 7315**, uses `translation_ru = "кончить, кончать"` —
grammatically valid but wrong register: in colloquial Russian "кончить" carries a strong sexual
connotation, making it an inappropriate translation for a language-learning app. This is what the
user flagged. `translation_ru` is a plain text column with no FK relationships, so editing it in
place is safe and does not affect `word_list_item` or `user_word_progress` (both FK on `id`, not
text). Duplicate rows for "baigti" are expected (word appears across multiple lists) and are out of
scope — only fix id 7315's text.
Suggested_model/effort reason: pure single-row data correction via an existing sanctioned admin
endpoint — no schema change, no FK risk, no new code paths → haiku/low.

## Fix plan
- [x] 1. Confirm current values for word id 7315 are `lithuanian="baigti"`, `translation_en="to finish, to end"`, `hint="глагол"` (preserve unchanged).
- [x] 2. Update the row via the existing admin endpoint `PATCH /api/admin/content/words/7315` (backend/routers/admin.py, `_require_admin`-gated) with body:
  ```json
  {
    "lithuanian": "baigti",
    "translation_en": "to finish, to end",
    "translation_ru": "закончить, заканчивать",
    "hint": "глагол"
  }
  ```
  (Equivalent direct SQL if needed: `UPDATE word SET translation_ru = 'закончить, заканчивать' WHERE id = 7315;`)
- [x] 3. Verify in `/dashboard/review` (or `GET /api/admin/content/word-lists/{list_id}/words`) that the translation now reads "закончить, заканчивать" for word id 7315.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix: fetch word id 7315 via the public API/admin API and assert `translation_ru === "закончить, заканчивать"`.
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #154 — кончить, кончать - лучше сказать закончить заказнчивать. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 154;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-154-baigti-vulgar-translation.md` → `plans/triage/implemented/IMPLEMENTED-issue-154-baigti-vulgar-translation.md`).
