# Issue #138 — /dashboard/grammar/

**Reported:** 2026-07-09 08:56:31
**Status:** open
**Description:** dovanóti — jie
davanoja

дарить; простить, прощать,

Правильно: dovanója - думаю нужно просмотреть все кейсы тк знак ударения не должен быть причиной ошибки

## Root cause
The specific example the user gave (infinitive `dovanóti`, present tense, `jie` → `dovanója`) already grades correctly — the shared `normalizeLt()` utility (added for prior issue #131/#132) correctly strips the acute accent, so `normalizeLt('dovanója') === normalizeLt('dovanoja')` is `true`. "davanoja" in the report is the user's own typo while writing it (no such string exists anywhere in the DB) — not a data bug.

However, investigating the user's broader request ("review all cases") surfaced a real, systemic, currently-reproducible bug: **509 conjugated verb forms** — exclusively **conditional mood, `mes`/`jūs` persons**, across 358 verbs — store two grammatically-valid alternate forms joined by `" / "` as a single literal string in the DB (e.g. `"dovanótume / dovanótumėme"`, `"atsakýtume / atsakýtumėme"`). A smaller related case: 3 verbs' `case_governance.question` field (used by `verb_case` tasks) also contains `" / "` (e.g. `"ką? / kuo?"`).

`frontend/app/dashboard/grammar/page.tsx`'s single shared `checkAnswer()` (line ~639) does a strict equality check: `normalizeLt(typed.trim()) === normalizeLt(task.answer)`. When `task.answer` is a compound `"X / Y"` string, no single valid typed answer (just "X" or just "Y") can ever match — the user is always marked wrong even when they type a completely correct conditional form. This affects both `verb_conjugation` and `verb_case` task types, which share this one comparison function.

The wrong-answer reveal (`shownAnswer`, rendered verbatim) already correctly displays both alternatives separated by `/`, so that part needs no change — only the grading comparison is broken.

## Fix plan
1. Add a shared helper in `frontend/lib/normalizeLt.ts` next to `normalizeLt`/`collapseWs`:
   ```ts
   export function isAnswerMatch(typed: string, answer: string): boolean {
     const normTyped = normalizeLt(typed);
     return answer.split('/').some((alt) => normalizeLt(alt) === normTyped);
   }
   ```
   Splitting unconditionally on `/` is a safe no-op for the ~99% of answers without a slash (single-element split, identical behavior to today).
2. In `frontend/app/dashboard/grammar/page.tsx`, import `isAnswerMatch` alongside the existing `normalizeLt` import (line 7) and replace line 639:
   ```js
   const isCorrect = isAnswerMatch(typed.trim(), task.answer);
   ```
3. Leave `shownAnswer` logic (line 642) untouched — it should keep displaying the full `task.answer` string (with `" / "`) verbatim so the user sees both valid forms when they get it wrong.
4. No backend or DB changes — `grammar_service.py`'s `_generate_verb_conjugation_tasks` and `_generate_verb_case_tasks` continue passing the raw joined string as `answer`; both forms are pedagogically valid, so the data itself is correct.

## Tests
1. Write a Playwright test in `frontend/tests/` (pattern-match `frontend/tests/issue-50-grammar-case-insensitive.spec.ts`) asserting `isAnswerMatch('atsakytume', 'atsakýtume / atsakýtumėme') === true`, `isAnswerMatch('atsakytumeme', 'atsakýtume / atsakýtumėme') === true`, and a non-matching typed answer still returns `false`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser (try a conditional-mood verb lesson, e.g. `atsakýti`, typing each of the two valid `mes`/`jūs` forms separately, and confirm the wrong-answer reveal still shows the full "X / Y" string).

## Confirm resolution
Ask the user: "Issue #138 — dovanóti — jie davanoja ... Правильно: dovanója - думаю нужно просмотреть все кейсы тк знак ударения не должен быть причиной ошибки. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 138;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-138-verb-conditional-slash-answer.md` → `plans/triage/implemented/IMPLEMENTED-issue-138-verb-conditional-slash-answer.md`).
