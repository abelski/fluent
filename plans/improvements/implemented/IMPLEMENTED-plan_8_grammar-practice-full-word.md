---
kind: feature
status: done
iteration: 1
max_iterations: 28
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Grammar practice-level: type the full word, not just the ending

## Context

`/dashboard/grammar` (noun-case exercises, cases 1-20) has a 3-level progression per
case group: `basic → advanced → practice`, where `practice` is always the last,
hardest-unlocked tier (`_annotate_lesson_progress` locks lesson N until lesson N-1
scores >75%). Today, **level has zero effect on how much the student has to type**:
every level of every "sentence" fill-in-blank task (`_generate_sentence_tasks`,
`backend/grammar_service.py:264-316`) shows the word's stem pre-printed
(`"Laima mato brol___."`) and grades only the typed case ending (`į`) against
`row.answer_ending`. The full word (`row.full_word`, e.g. `brolį`) is only ever shown
as the "correct answer" after a wrong guess — never required as input. A dead i18n
key (`typeEnding`, unused anywhere in `.tsx` code) hints this "type the full word at
the hardest level" idea was considered before but never wired up.

The user wants: at practice level, require the whole inflected word, not just the
ending — matching how the exercise's other task types already work (`declension`
fallback and `verb_conjugation` already require full words at every level; only the
noun-case `sentence` type has this gap).

**Confirmed with the user beforehand:**
- Scope is the noun-case `sentence` task type at `practice` level only. Verb
  conjugation, verb case-governance, and the `declension` fallback are unaffected
  (they already require full words, or have no `practice` tier).
- The dictionary/nominative-form hint shown above every sentence task (`task.base_lt`,
  "от: brolis") **stays visible** at practice level — the exercise is testing
  inflection (turn a known word into the right case form), not vocabulary recall from
  bare sentence context.

**Suggested model/effort rationale:** single well-scoped Python function change with a
subtle-but-fully-reasoned edge case (the cases 17-19 multi-word ordinal exception),
plus two new test files — mechanical enough for `sonnet`, but the edge case reasoning
and cross-file verification (confirming zero frontend changes are actually needed)
warrant `medium` rather than `low`.

**Key existing pieces this builds on:**
- `_extract_stem(display)` (`backend/grammar_service.py:113-116`) — regex
  `r'(\w+)___'`, captures the single word immediately before the blank.
- `_sentence_invariant_holds(display, answer_ending, full_word)`
  (`backend/grammar_service.py:133-138`) — already guarantees every served row's
  `full_word` is either exactly `stem+answer_ending`, or (cases 17-19 multi-word
  ordinal exception, e.g. `"dvidešimt pirm___"` → `full_word="dvidešimt pirmu"`) a
  non-inflecting prefix word + `" " + stem+answer_ending`. This is what lets the fix
  below need **no new data invariant**.
- `frontend/app/dashboard/components/GrammarTaskRunner.tsx` —
  `InlineSentenceInput` (85-153) splits whatever `display` string it's given on
  `'___'` and auto-sizes the input; `checkAnswer()` (334-349) grades via
  `isAnswerMatch(typed.trim(), task.answer)` — both fully generic over string
  content/length already (proven by `declension`/`verb_conjugation` typing full words
  today). `task.base_lt` hint render (425-427) and `shownAnswer` on a wrong guess
  (341, uses `task.full_answer`) are both already unconditional on level. **Net: this
  is a backend-only change — no frontend `.tsx`/`.ts` edits needed.**
- `backend/routers/grammar.py` and `backend/routers/continue_session.py` both funnel
  through `get_lesson_tasks` → `_generate_sentence_tasks`, so the combined
  "Продолжить занятие" session picks this up automatically.

## Goals

- At `practice` level, noun-case sentence exercises hide the stem entirely (blank
  stands for the whole word) and require typing the full inflected word to be marked
  correct.
- `basic`/`advanced` levels are pixel-for-pixel unchanged (still ending-only).
- The dictionary-form hint (`base_lt`) still shows at practice level.
- The cases 17-19 multi-word ordinal exception grades correctly (against
  `stem+answer_ending`, not the longer `full_word`, since the non-inflecting prefix
  word is already visible outside the blank).

## Non-Goals

- No change to verb conjugation, verb case-governance, or `declension`-fallback task
  types — already full-word or not level-gated this way.
- No new DB columns, no admin UI changes — the practice-level shape is derived purely
  from existing `display`/`answer_ending`/`full_word` columns at request time.
- No new data-integrity invariant — this is a pure derivation from the existing
  `stem(display)+answer_ending==full_word` guard (issue #156).
- Not hiding the `base_lt` dictionary-form hint at practice level (explicitly decided
  against).

## Requirements

1. `_generate_sentence_tasks(cases, count, session, level)` in
   `backend/grammar_service.py`: when `level == "practice"`, strip the captured stem
   span from `display` (so `"Laima mato brol___."` → `"Laima mato ___."`) and set the
   served `"answer"` to `stem + row.answer_ending` (the whole inflected word) instead
   of `row.answer_ending` alone. `"full_answer"` stays `row.full_word`, unchanged.
2. Hoist the stem/blank pattern into one compiled module-level regex
   (`_STEM_BLANK_RE = re.compile(r'(\w+)___')`), reused by both `_extract_stem` (read)
   and the practice-level strip (`_STEM_BLANK_RE.sub('___', display, count=1)`) — one
   source of truth so capture and strip can never target different spans.
3. For the cases 17-19 multi-word exception, grade against `stem+answer_ending`
   (e.g. `"pirmu"`), **not** `row.full_word` (`"dvidešimt pirmu"`) — the non-inflecting
   numeral prefix was never part of the captured stem, so it stays visible in
   `display` as ordinary sentence text before the blank; grading against the longer
   `full_word` would wrongly force retyping text the student never had to touch.
4. Update the `get_lesson_tasks` docstring (`backend/grammar_service.py:322-328`) to
   describe the new practice-level shape.

### Standing constraints

- All validation must be server-side (never frontend-only). *(Already true here —
  grading is client-side by existing repo design (see
  `documentation/grammar-sentence-data-integrity.md`), and this feature doesn't change
  that; it only changes what string the backend hands the client to grade against, and
  that generation logic itself is entirely server-side.)*
- If this plan touches markup, styling, or a component: read `documentation/design
  system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md`
  first, use named design tokens, and run
  `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change.
  **N/A — this plan is backend-only, no markup/styling/component changes.**
- Add autotest coverage for the new feature and run the relevant suite(s) as part of
  Validation.

## Implementation

- [x] 1. `backend/grammar_service.py` — hoist `_STEM_BLANK_RE = re.compile(r'(\w+)___')` at module level; rewrite `_extract_stem` to use `_STEM_BLANK_RE.search(display)`.
- [x] 2. `backend/grammar_service.py` — in `_generate_sentence_tasks`'s task-building loop, add the `level == "practice"` branch: `display = _STEM_BLANK_RE.sub('___', display, count=1)` and `answer = stem + row.answer_ending` (else `answer = row.answer_ending` as today); keep `full_answer: row.full_word` unchanged in both branches.
- [x] 3. `backend/grammar_service.py` — update `get_lesson_tasks`'s docstring to describe the new per-level sentence-task shape (stem pre-printed at basic/advanced vs. stripped at practice; `base_lt` hint stays visible at all levels).
- [x] 4. `backend/tests/test_grammar_practice_full_word.py` (new) — pytest suite following the `Session(_db.engine)` + sentinel `case_index` + try/finally cleanup convention from `backend/tests/test_issue_156_dukterimi_instrumental.py::TestSentenceInvariantGuard`. Three cases: (a) simple stem row at `level="practice"` → stem stripped from display, `answer == stem+answer_ending`, `full_answer` unchanged; (b) same row at `level="advanced"` → unchanged ending-only shape (regression guard); (c) a cases-17-19-shaped multi-word row (`display="Važiuoju dvidešimt pirm___ autobusu."`, `answer_ending="u"`, `full_word="dvidešimt pirmu"`) at `level="practice"` → `display == "Važiuoju dvidešimt ___ autobusu."`, `answer == "pirmu"` (not `"dvidešimt pirmu"`), `full_answer` unchanged.
- [x] 5. `frontend/tests/grammar-practice-full-word-answer.spec.ts` (new) — modeled on `frontend/tests/grammar-draugo-base-form.spec.ts` (fully `page.route`-mocked). Mock a `level: 'practice'` lesson (id 3, cases [4]) and one sentence task (`display: 'Laima mato ___.'`, `answer: 'brolį'`, `full_answer: 'brolį'`, `base_lt: 'brolis'`). Assert: (a) the rendered sentence `<p>` (scoped via its `font-mono` class, distinct from the `base_lt` hint paragraph) shows no stem text before the input — `"Laima mato ___."` collapses to just "Laima mato" + blank; (b1) typing only `"į"` is graded wrong (`[data-testid="dismiss-wrong"]` becomes visible); (b2) typing the full word `"brolį"` is graded correct; (b3) on the wrong guess, the shown correct answer is `"brolį"` (`task.full_answer`, unchanged behavior); (c) the `base_lt` hint text ("от: brolis") stays visible.
- [x] 6. `documentation/grammar-sentence-data-integrity.md` — append a short new section ("Practice-level full-word answers are derived, not a new invariant") explaining the derivation and why the cases 17-19 exception grades against `stem+answer_ending`, not `full_word`.
- [x] 7. `documentation/CHANGELOG.md` — append entry `#8` (2026-08-22) describing the change, referencing `_STEM_BLANK_RE`, the cases-17-19 edge-case handling, and that no frontend/DB/admin changes were needed.

## Validation

- [x] Backend unit (new): `cd backend && .venv/bin/python -m pytest tests/test_grammar_practice_full_word.py -q`
- [x] Backend regression: `cd backend && .venv/bin/python -m pytest tests/test_issue_156_dukterimi_instrumental.py -q` (confirms `basic`/`advanced` levels and the read-time invariant guard are untouched)
- [x] Playwright autotest added: `cd frontend && npx playwright test grammar-practice-full-word-answer.spec.ts --reporter=list`
- [x] Playwright regression: `cd frontend && npx playwright test grammar-draugo-base-form.spec.ts navigation.spec.ts admin-grammar.spec.ts issue-159-dative-vocative-us-stem.spec.ts --reporter=list` (none of these mock a `sentence`-type task at `practice` level today, so none should change behavior — confirms no regression)
- [x] Type check: `cd frontend && npx tsc --noEmit` (also fixed 12 pre-existing, unrelated TS errors across 5 test files at explicit user direction — `tests/design-system-parity.spec.ts`, `tests/issue-118-120-synonym-answer-not-leaked.spec.ts`, `tests/issue-151-153-verb-forms-intact.spec.ts`, `tests/issue-157-reward-week-label.spec.ts`, `tests/mistake-diff.spec.ts` — none touched by plan #8's own changes; bumped `frontend/tsconfig.json` target `es5` → `es2018` for the two regex-flag errors, plus per-file type fixes)
- [x] Smoke: verified live against the running local backend (`curl localhost:8000/api/grammar/lessons` + `/tasks`), not an interactive browser login — reasonable given this is a backend-only change and the rendering path (`InlineSentenceInput`/`checkAnswer`) is already exercised by the Playwright spec against the same string shapes. Lesson 3 (practice, case 4): `display: 'Laima mato ___.'`, `answer: 'brolį'`, `base_lt: 'brolis'` — stem hidden, full word required, hint intact. Lessons 1 (basic)/2 (advanced), same case: unchanged ending-only shape (`answer: 'erį'` / `'ą'`). If the user wants an interactive walkthrough too, that's still open to do.
- [x] Edge case: verified live, not just via pytest — practice-level lessons 84/90/96 (cases 17/18/19) each returned real multi-word `full_answer` rows (e.g. `full_answer: 'trisdešimt pirmu'`), and in every case the served `answer` was only the inflecting word (`'pirmu'`), with the numeral prefix (`'trisdešimt'`/`'dvidešimt'`) staying visible as plain text in `display` — exactly as designed.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest tests/test_grammar_practice_full_word.py tests/test_issue_156_dukterimi_instrumental.py -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test grammar-practice-full-word-answer.spec.ts grammar-draugo-base-form.spec.ts navigation.spec.ts admin-grammar.spec.ts issue-159-dative-vocative-us-stem.spec.ts --reporter=list
```
