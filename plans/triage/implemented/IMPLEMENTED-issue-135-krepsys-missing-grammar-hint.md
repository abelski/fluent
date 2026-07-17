# Issue #135 — /dashboard/grammar/

**Reported:** 2026-07-02 09:36:00
**Status:** open
**Description:** Jonas neša krep - нет подсказки от какого слова винительный падеж образуется

## Root cause
Grammar exercises already have a hint mechanism: the `base_lt` field, computed server-side in `backend/grammar_service.py` (`_generate_sentence_tasks`, ~line 272) via `_FORM_TO_NOMINATIVE`/`_STEM_TO_NOMINATIVE`, which are built from the hand-maintained noun declension table `backend/data/grammar/words.txt`. It's rendered in `frontend/app/dashboard/grammar/page.tsx:943-945` as "Из слова: **draugas**"-style hint (added for a prior issue, see `frontend/tests/grammar-draugo-base-form.spec.ts`).

Grammar sentence id=203 (`Jonas neša krep___.`, full_word=`krepšį`, case_index 4/accusative) fails this lookup because **"krepšys" (bag) is simply missing from `words.txt`**. This is confirmed as an isolated content gap — of 422 active `grammar_sentence` rows, only this one (case_index 4) fails to resolve a hint; all other declension cases resolve fine.

## Fix plan
1. Add "krepšys" to `backend/data/grammar/words.txt`, using the same `-ys` declension pattern as the existing `kambar` (kambarys) row:
   ```
   krepš	ys	io	iui	į	iu	yje	y	iai	ių	iams	ius	iais	iuose	iai	сумка
   ```
   This makes `_FORM_TO_NOMINATIVE['krepšį'] == 'krepšys'`, so `base_lt` resolves automatically for sentence id 203 — no other code changes needed.
2. Do NOT add a new `base_word`/`hint` column to `grammar_sentence` — the existing `words.txt`-driven mechanism already covers 421/422 active rows; a redundant per-row field would duplicate data unnecessarily.
3. Restart the backend after editing `words.txt` (it's read once at module import time, `backend/grammar_service.py` lines ~56-61 — no caching layer beyond that).
4. Verify: load the accusative-case (case_index 4) lesson, confirm `Jonas neša krep___.` now shows "Из слова: krepšys" above the sentence.

## Tests
1. Write a Playwright test in `frontend/tests/` (pattern-match `grammar-draugo-base-form.spec.ts`) asserting the accusative-case krepšys sentence renders `base_lt: 'krepšys'`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #135 — Jonas neša krep - нет подсказки от какого слова винительный падеж образуется. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 135;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-135-krepsys-missing-grammar-hint.md` → `plans/triage/implemented/IMPLEMENTED-issue-135-krepsys-missing-grammar-hint.md`).
