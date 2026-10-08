---
kind: feature
status: done
iteration: 3
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
uat_rounds: 0
max_uat_rounds: 3
---

# #60 — Grammar: multiple choice on Basic, retry wrong tasks

## Context

Idea: `plans/ideas/idea_60_grammar-choice-and-retry.md`

Every grammar level is typing-only, and a wrong answer is shown once and forgotten. Inspired by
github.com/jekhor/spragos we add (1) Basic = pick the right form from 4 full words of the same
paradigm, (2) a wrong task comes back once at the end of the run (first attempt scores).

What exists:
- All task payloads come from `backend/grammar_service.py`: `get_lesson_tasks` →
  `_generate_sentence_tasks`, `get_verb_lesson_tasks` → `_generate_verb_conjugation_tasks` /
  `_generate_verb_case_tasks`. Every caller routes through these two entry points
  (`routers/grammar.py` lesson tasks + remind, `routers/continue_session.py`), so options added
  there reach the lesson page, «Продолжить занятие» and «Напомнить» at once.
- `get_verb_lesson_tasks` reads `_level` from `VERB_LESSON_CONFIG` but doesn't pass it on — it
  must now, so verb basic lessons (200, 202, …, 210, 300) get options.
- Practice-level transform for sentences (plan #8): `_STEM_BLANK_RE.sub('___', display)` +
  `answer = stem + answer_ending`; for cases 17-19 the numeral prefix stays as plain text. Options
  reuse exactly that transform, so the blank always stands for the whole option word. Basic rows
  for cases 15, 16, 20 have a bare `___` with no stem (`Kambaryje yra ___ kėdės.`) — the transform
  is a no-op there and `answer = "" + ending`. That is correct; don't "fix" it.
- Noun paradigms: `WORDS` (`data/grammar/words.txt`); `!`-prefixed endings are irregular/unused
  and `_word_form` returns `None` for them. Measured on prod DB (basic, non-archived rows): cases
  2–13 → 213 of 216 rows resolve to a WORDS row with ≥4 distinct forms; numerals (15–20) → 8 of 221.
  User chose (2026-10-08) to add numeral tables in this change.
- `_generate_declension_tasks` is only a fallback when a case has no sentence rows; every basic
  case has rows in prod, so it never runs for basic → not touched.
- Verb paradigms: `verb.conjugations[tense][person]`, filtered by `_clean_form` / `_is_usable_form`.
  jis/ji/jie/jos share a form, imperative has only tu/mes/jūs → fill from other tenses, same person.
- `verb_case` answers are DB strings like `ką?`, `ką? ko?`; some contain a Cyrillic `о`
  homoglyph, a few are corrupt (Cyrillic text). Options use a fixed list of clean questions.
- Runner: `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — dumb, gets `tasks` + `level`,
  reports `onFinish(score, total, mood)`; shared by `grammar/page.tsx` and `continue/page.tsx`.
  Retry lives entirely here. Typed grading `isAnswerMatch` (strips diacritics) is unchanged;
  choice grading is exact (`choice === task.answer`).
- Existing choice UI to copy: word quiz options in `QuizSession.tsx:1164-1176` (button classes,
  correct/wrong colours, `dismiss-wrong`) + `frontend/lib/useNumberKeys.ts` for keys 1–4.

Model rationale: opus/high — a new numeral paradigm table must be linguistically right, plus a
stateful queue in the runner; not a mirror-an-existing-pattern change.

**Changes vs the idea (raise at approval; update the idea's Proposed spec at close-out):**
- Options list is single-column like the word quiz, not 2×2 (CLAUDE.md: match existing pattern;
  long verb forms fit better).
- "Every basic task carries options" → "every basic task with ≥4 distinct paradigm forms carries
  options; others stay typing". Expect a mixed run in lesson 100 (case 20): indeclinable numbers
  (`dešimt`, `penkiolika`, `keturiasdešimt` …) and nouns with `!` irregular forms stay typing.

## Goals
- Basic lessons (nouns, numbers, verbs, verb cases) show 4 tap-able full-word options from the
  same paradigm instead of a text field, whenever 4 distinct forms exist.
- Advanced and Practice unchanged.
- On every level, «Напомнить» and «Продолжить занятие», a task answered wrong is appended once to
  the end of the run, marked «Повтор» / «Retry»; score = first attempts only.

## Non-Goals
- Strict diacritic grading for typed answers / diacritic keyboard (separate idea).
- Remembering mistakes across sessions.
- Cleaning corrupt `verb.case_governance` rows (those tasks keep typing — req. 5).
- Options for the declension fallback generator (never runs on basic).
- A user toggle choice/typing; any new level.

## Requirements

1. **Options payload.** For `level == "basic"` only, a task gets `options: list[str]` — 4 distinct
   strings, one equal to `task.answer`, shuffled. Dedupe *and* exclusion of the answer both use the
   same key: lowercase with tone marks (`̀ ́ ̃`) stripped (`_base_letters`-style) — so `ranka` and
   `ranką` stay distinct, but `Antru`/`antru` or `dìrbu`/`dirbu` never both appear. The original
   `answer` string is the one inserted. Fewer than 4 distinct forms → no `options`, task unchanged.
2. **Sentence tasks with options:** compute `full = stem + row.answer_ending`; if basic options
   succeed, strip the stem from `display` and set `answer = full` (same as practice:
   `if level == "practice" or options:`). Paradigm lookup on the answer's last token, lowercase:
   `_FORM_TO_ROW` (new, built in the same loop as `_FORM_TO_NOMINATIVE`, same collision → `None`
   rule) → WORDS row forms via `_word_form(row, i)` for i in 1..14, dropping `None`; else
   `_EXTRA_FORM_TO_FORMS`. Multi-word answers (`dvidešimt vieni`) keep the prefix: option =
   `prefix + form`. Answer starts uppercase → options capitalized the same way.
3. **Numeral/pronoun table** `backend/data/grammar/paradigms_extra.txt`: one line per lexeme,
   tab-separated, all its forms (genders × cases × numbers). Covers every basic numeral answer
   seen today: cardinals vienas (incl. plural vieni/vienos…), du/dvi, trys, keturi…devyni;
   ordinals pirmas…dešimtas, vienuoliktas…devynioliktas, dvidešimtas, trisdešimtas (masc + fem,
   sg + pl cases); collectives dveji…devyneri (masc + fem; `vieni metai` is the plural of vienas,
   not a separate row); personal pronouns aš/tu/jis/ji (case 20 `man/tau/jam/jai`). A form found
   in two rows → `None` → typing fallback (same rule as `_FORM_TO_NOMINATIVE`). Indeclinables
   have no row → typing.
4. **Verb conjugation:** distractors = other persons of the same verb & tense, then the same person
   in other tenses; every candidate through `_clean_form` + `_is_usable_form`.
5. **Verb case:** first replace Cyrillic `о` with Latin `o` in the served `answer`; if any Cyrillic
   letter remains → no options. Distractors from a fixed list `ką? ko? kam? kuo? į ką? apie ką?
   su kuo? iš ko? ant ko? dėl ko?`, excluding any equal to the answer or to one of its
   space-separated parts. A leading prefix (tokens before the first question word/preposition,
   e.g. `nerašýti ` in `nerašýti ko?`) is kept on every distractor and the exclusion rule applies
   to the question part; an answer with no question part (`nesišukúoti?`) gets no options.
6. **Runner — choice:** when `task.options?.length`, render the option list (QuizSession classes,
   `useNumberKeys(options.length, answered ? null : pick)`) in place of the text input and
   «Проверить». Sentence tasks render the display with a plain styled blank, filled with the
   chosen word after answering. Correct → auto-advance after 1s; wrong → chosen red, correct green,
   «Правильно: …» + `dismiss-wrong`, as today.
7. **Runner — retry:** `queue` state initialized to `tasks`. On a wrong answer to a task that is not
   a repeat, append `{...task, isRetry: true}` with `options` reshuffled. Run ends at
   `next >= queue.length`; `setCorrect` only when `!task.isRetry`; `onFinish(firstAttemptCorrect,
   tasks.length, mood)`. Counter `index+1 / queue.length`, progress bar on `queue.length`.
   A repeat shows a small «Повтор» / «Retry» chip.
8. **i18n:** `grammar.retry` RU «Повтор», EN «Retry».

### Standing constraints
- All validation must be server-side (never frontend-only). Options and the correct answer are
  generated server-side; result saving keeps the existing server checks on
  `POST /grammar/lessons/{id}/results`.
- This plan touches markup: read `documentation/design system/Component Library (as-built).html`
  and `documentation/IMPLEMENTATION.md` first, use named tokens, reuse the QuizSession option
  pattern rather than inventing one, and run `frontend/tests/design-system-parity.spec.ts`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/data/grammar/paradigms_extra.txt` — new numeral + pronoun table (req. 3), header
  comment on the format. Load in `grammar_service.py` into `_EXTRA_FORM_TO_FORMS: dict[str,
  list[str] | None]` (lowercase form → all forms of its row; collision → `None`) next to `WORDS`.
- [x] 2. `backend/grammar_service.py` — build `_FORM_TO_ROW` in the existing `_FORM_TO_NOMINATIVE`
  loop; add `_pick_options(answer, forms) -> list[str] | None` (req. 1) and
  `_paradigm_forms(word) -> list[str]` (req. 2 lookup order, `!` forms skipped).
- [x] 3. `backend/grammar_service.py` `_generate_sentence_tasks` — basic options per req. 2;
  practice behaviour unchanged; basic without options unchanged.
- [x] 4. `backend/grammar_service.py` — `get_verb_lesson_tasks` passes `level=_level`;
  `_generate_verb_conjugation_tasks` and `_generate_verb_case_tasks` get a keyword
  `level: str = "advanced"` (appended after `program_key`, so existing positional calls in
  `tests/test_verb_conjugation_tasks.py` keep working) and add options at basic (req. 4, 5).
- [x] 5. `backend/tests/test_grammar_basic_options.py` — new: (a) basic sentence row with a WORDS
  noun → 4 distinct options incl. answer once, stem stripped, answer = full word; (b) `ranka` /
  `ranką` both allowed as distinct options; (c) WORDS row with `!` endings → no `!` in options;
  (d) ordinal case-17 `dvidešimt pirm___` → single-word options, prefix stays in display;
  (e) capitalized `Aštuoni` → options capitalized, no lowercase twin of the answer; (f) case-20
  `dvidešimt vieni` → options keep the prefix; (g) unresolvable (`dešimt`) → no `options`, task
  identical to today's basic; (h) advanced/practice never carry `options`; (i) verb basic →
  4 distinct usable forms, imperative too, no tone-mark twin of the answer; (j) verb_case basic →
  answer in options, `kо?` served as `ko?` with no duplicate, Cyrillic-junk answer → no options;
  (k) every line of `paradigms_extra.txt` has ≥4 distinct forms; (l) **all-lessons sweep**: for
  every basic entry of `LESSON_CONFIG` and `VERB_LESSON_CONFIG`, call `get_lesson_tasks` /
  `get_verb_lesson_tasks` on seeded test rows and assert every task with `options` has exactly 4,
  distinct by the req. 1 key, answer present once; (m) TestClient `GET /grammar/lessons/{id}/tasks`
  for a basic lesson returns `options` in the JSON.
- [x] 6. `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — `options?: string[]` and
  `isRetry?: boolean` on the four task interfaces; choice rendering + exact grading (req. 6);
  retry queue, counter, chip, first-attempt score (req. 7).
- [x] 7. `frontend/lib/i18n/types.ts` (`grammar:` block), `ru.ts`, `en.ts` — `grammar.retry`.
- [x] 8. `frontend/tests/grammar-basic-choice-retry.spec.ts` — new, API mocked like
  `grammar-draugo-base-form.spec.ts`: (a) basic lesson with options → 4 buttons, no text input,
  tap correct → auto-advances; key `1` picks the first option; (b) tap wrong → red/green +
  «Правильно:» + dismiss; task reappears last with «Повтор», counter total +1, its options are the
  same set; (c) a repeat answered wrong is not appended again; (d) result POST body = first-attempt
  score and original total; `/tasks` requested exactly once per run (no extra quota); (e) task
  without options in a basic lesson shows the text input; (f) advanced lesson wrong answer also
  retries; (g) EN locale shows «Retry»; (h) 375px: option buttons ≥44px tall, no horizontal scroll.
- [x] 9. Coverage check (scratchpad script, read-only, not committed): run the option builder over
  every non-archived basic `grammar_sentence` row in the dev DB; report per-case with/without
  options. Target: cases 2–19 ≥95%; case 20 reported as-is with the list of typing rows.
- [x] 10. `specs/grammar.md` — add the idea's four scenarios, reworded per "Changes vs the idea"
  (≥4 forms condition, single-column list, typing fallback).
- [x] 11. `documentation/grammar-basic-options.md` — new note: options are server-side; distinctness
  ignores only tone marks/case (so `ranka`/`ranką` teach the case); numeral table + collision
  fallback; fixed verb_case list + Cyrillic `о` normalization; retry is runner-only state.
- [x] 12. `documentation/design system/Component Library (as-built).html` — note grammar Basic reuses
  the quiz option pattern (and that it carries raw stock steps `border-gray-900`, `bg-emerald-100`,
  `text-red-600` inherited from QuizSession — record in "Deliberate deviations"); add the
  «Повтор» chip.
- [x] 13. `plans/reminders.md` — `- <release date + 14d> — compare basic-lesson first-attempt pass
  rate (>75%) 2 weeks before vs after #60 from GrammarLessonResult (#60)`.

## Coverage

Item 9, run 2026-10-08 against the dev DB (non-archived `use_in_basic` rows that pass the #156
invariant), through the real `_sentence_options`:

```
case | with options | typing | %
   2 |           22 |      0 | 100.0%
   3 |           17 |      0 | 100.0%
   4 |           23 |      0 | 100.0%
   5 |           15 |      1 |  93.8%  typing: drauge
   6 |           20 |      0 | 100.0%
   7 |           10 |      2 |  83.3%  typing: drauge, drauge
   8 |           21 |      0 | 100.0%
   9 |           20 |      0 | 100.0%
  10 |           11 |      0 | 100.0%
  11 |           14 |      0 | 100.0%
  12 |           12 |      0 | 100.0%
  13 |           13 |      0 | 100.0%
  15 |           35 |      0 | 100.0%
  16 |           35 |      0 | 100.0%
  17 |           38 |      0 | 100.0%
  18 |           38 |      0 | 100.0%
  19 |           37 |      0 | 100.0%
  20 |           28 |     10 |  73.7%  typing: dešimt, penkiolika, keturiasdešimt, septyniolika, septyniasdešimt, tėčiui, senelei, Šuniui, katei, pusbroliui
```

Cases 2–13 overall: 198 of 201 rows get options (98.5%). Below the per-case 95% target: case 5
(93.8%) and case 7 (83.3%) — all three misses are `drauge`, which is both the vocative of
`draugas` and the instrumental of `draugė`; `_FORM_TO_ROW` marks it ambiguous on purpose (same
collision rule as `_FORM_TO_NOMINATIVE`, issue #25/#161), so those rows stay typing. Cases 15–19:
100%. Case 20: the 5 indeclinable numbers plus 5 nouns missing from `words.txt` (`tėtis`,
`senelė`, `šuo`, `katė`, `pusbrolis`) stay typing.

## Review

- [x] Code review passed (round 3)
- note: `paradigms_extra.txt` is read at import time (same pattern as WORDS) — accepted.
- note: verb_case Cyrillic о→o normalisation also applies to basic tasks that end up without options — harmless.
- note: `recordAnswer` fires on retry attempts too, so retries move TAK's mood — intended (mood follows every answer).

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q tests/test_grammar_basic_options.py tests/test_grammar_practice_full_word.py tests/test_grammar_remind.py tests/test_grammar_premium_lock.py tests/test_verb_conjugation_tasks.py tests/test_en_labels.py`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Typecheck: `cd frontend && npx tsc --noEmit`
- [x] Playwright new spec: `cd frontend && npx playwright test tests/grammar-basic-choice-retry.spec.ts --reporter=list`
- [x] Playwright shared-runner suites: `cd frontend && npx playwright test tests/grammar-*.spec.ts tests/verbs_grammar.spec.ts tests/issue-50-grammar-case-insensitive.spec.ts tests/continue-session.spec.ts --reporter=list`
- [x] Design parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Coverage script (item 9) output pasted into the plan.
- [ ] Numeral table reviewed by the user (Claude can't vouch for every Lithuanian form) — show the
  file, user confirms or corrects.
- [x] Screenshots in `temp_files/screenshots/plan_60_grammar-choice-and-retry/`, API mocked:
  basic noun choice (unanswered, correct, wrong), basic numeral choice, basic verb choice,
  verb_case choice, typing-fallback task inside a basic run, retry task with «Повтор», advanced
  typing unchanged — each in **RU and EN**, at **desktop 1280px and mobile 375px**. Look at each
  and describe what it shows.
- [ ] Smoke on local server: start a real basic lesson on `/dashboard/grammar`, answer one wrong,
  see it come back at the end; finish and check the score on the done screen. Navigation menu,
  header/footer and login intact compared to production.
- [ ] News post written and published via /news-writer (after merge, user's call).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/grammar-basic-choice-retry.spec.ts tests/design-system-parity.spec.ts tests/continue-session.spec.ts --reporter=list
cd frontend && npx playwright test tests/grammar-*.spec.ts tests/verbs_grammar.spec.ts --reporter=list
```

User-facing checks that must also be met before done (not shell-runnable, gated here on purpose):
- **Both languages:** RU and EN screenshots exist for every state listed in Validation.
- **Mobile 375px:** 375px screenshots exist for every state; no horizontal scroll, buttons ≥44px.
- **Screenshots:** saved in `temp_files/screenshots/plan_60_grammar-choice-and-retry/` and
  described in the final report.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/grammar`, logged in as a
local test user (token in `localStorage('fluent_token')`), real local backend on :8000.

**Scenarios:**
1. Open the Grammar page, start the Basic level of the first case topic.
2. Answer the first task by tapping an option at random. If it was wrong, note the correct answer
   shown and continue; repeat until you have made at least one mistake.
3. Keep going to the end of the run. Track your own first-attempt results. When a task you got
   wrong comes back, pick the answer you noted.
4. Start the Advanced level of the same topic and look at the first task.
5. Switch the interface to English and start the Basic level again; make one mistake.
6. Resize to 375px wide and repeat step 1.

**Acceptance criteria:**
- [ ] Basic tasks show 4 word buttons and no text field; all 4 are different forms of one word.
- [ ] After a wrong tap, the right answer is shown and the task appears again at the end, labelled «Повтор».
- [ ] The task counter total grows by one per mistake.
- [ ] The final score equals the tester's own count of first-attempt correct answers, out of the original task count.
- [ ] Advanced tasks still show a text field, not buttons.
- [ ] In English the repeat label reads "Retry".
- [ ] At 375px the buttons fit the screen with no sideways scrolling.
