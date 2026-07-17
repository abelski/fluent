# Issue #120 — /dashboard/lists/294/study

**Reported:** 2026-06-08 16:32:41
**Status:** open
**Description:** говорить (kalbėti) - в задании сразу есть ответ

(Translation: "говорить (kalbėti) — the answer is already in the task")

## Root cause
**Same root cause as issue #118.** List 294 ("Основные глаголы") contains `kalbėti` (id 7313, `translation_ru = говорить`, `hint=NULL`, `accented=NULL`) plus at least one other verb whose `translation_ru` is also exactly `говорить`.

The study endpoint `get_study_words()` in `backend/routers/words.py:369-375` appends the Lithuanian word in parentheses when two session words share `translation_ru`:

```python
ru_counts = Counter(w["translation_ru"] for w in session_words if w.get("translation_ru"))
for w in session_words:
    if w.get("translation_ru") and ru_counts[w["translation_ru"]] > 1:
        w["translation_ru"] = f"{w['translation_ru']} ({w['lithuanian']})"
```

So `kalbėti`'s translation becomes `говорить (kalbėti)`, which is then rendered as the prompt in:
- Stage `2r` (reverse MC) — `QuizSession.tsx:878`
- Stage 3 (type-it) — `QuizSession.tsx:927`

The answer the learner must produce is shown in the question. The bug is **intermittent** — it only fires when both `говорить` twins are sampled into the same session (`words.py:348-367`).

The `verb` table / conjugations are NOT involved — the study flow reads only from the `word` table; `Verb` (`models.py:516`) is never referenced in `words.py`.

**Verify the twin exists** (read-only):
```sql
SELECT w.id, w.lithuanian, w.translation_ru
FROM word w JOIN word_list_item wli ON wli.word_id = w.id
WHERE wli.word_list_id = 294 AND w.archived = false AND w.translation_ru LIKE 'говорить%';
```
Expect ≥2 rows sharing `translation_ru = 'говорить'`.

## Fix plan
1. **Stop mutating `translation_ru` in the backend** (`words.py:369-375`). Replace the in-place rewrite with a separate non-leaking signal, e.g. a boolean `w["ambiguous_ru"] = ru_counts[...] > 1`, leaving `translation_ru` untouched. Mirror the new field in the `distractors` dict shape (`words.py:393-404`, default `False`). **(Shared fix with issue #118.)**
2. **Add `ambiguous_ru?: boolean` to the `Word` interface** in `QuizSession.tsx` (lines 15-23). `page.tsx` re-exports `Word`, so only the interface needs editing.
3. **Make rendering direction-aware** in `QuizSession.tsx`:
   - Stage 1 flashcard & Stage 2 (Lithuanian → meaning): showing `(lithuanian)` is harmless/helpful — optional.
   - Stage 2r (`:878`) & Stage 3 single-form (`:927`): answer IS the Lithuanian word → render only the bare `translation_ru`, never the parenthetical.
   - Audit MCQ option builders `trans`/`optionText` (lines 112-118) and `buildOptions2r` (lines 137-143).
4. **Handle the now-genuinely-ambiguous reverse case.** With the parenthetical gone, a `2r`/stage-3 prompt of just `говорить` has two valid answers. In stage 3 `checkAnswer` (`QuizSession.tsx:96-105`/handler 586-604), accept any session twin's Lithuanian form when `ambiguous_ru` is set. For stage 2r, `pickDistractors` (lines 120-127) already filters same-`translation_ru` words so only one correct button appears.
5. **Check `MatchRound.tsx`** uses bare `translation_ru` (or tolerates the parenthetical) for post-quiz consistency.
6. **Backend regression test** in `backend/tests/test_study_session.py`: assert that when two list words share `translation_ru`, the returned `translation_ru` is NOT mutated and `ambiguous_ru` is set instead.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #120 — говорить (kalbėti): в задании сразу есть ответ. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 120;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.

### Critical files
- `backend/routers/words.py` (disambiguation block 369-406)
- `frontend/app/dashboard/components/QuizSession.tsx` (Word interface, trans/optionText, stage 2r/3 rendering, checkAnswer)
- `frontend/app/dashboard/components/MatchRound.tsx`
- `backend/tests/test_study_session.py`
- `frontend/app/dashboard/lists/[id]/study/page.tsx`
