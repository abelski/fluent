# Grammar Basic: multiple choice + in-run retry (#60)

Plan: `plans/improvements/active/plan_60_grammar-choice-and-retry.md`. Spec: `specs/grammar.md`.

## Options are built server-side

`grammar_service.py` adds `options: list[str]` to a task only when `level == "basic"`. Every
caller (lesson tasks, «Напомнить», «Продолжить занятие») goes through `get_lesson_tasks` /
`get_verb_lesson_tasks`, so all three get options at once. `get_verb_lesson_tasks` now passes
`level=_level` to the verb generators (it used to drop it).

- `_pick_options(answer, forms)` — the answer plus the first 3 distinct forms, shuffled. Fewer
  than 3 distinct distractors → `None` and the task keeps today's typing shape. No padding from
  other words: a 4-option list from two paradigms would teach nothing.
- **Distinctness ignores only case and tone marks** (`_option_key`: NFD, drop `̀ ́ ̃`, NFC,
  lowercase). `dìrbu`/`dirbu` and `Antru`/`antru` collapse, but `ranka`/`ranką` stay distinct on
  purpose — choosing between them *is* the case exercise. Do not switch this to `_base_letters`,
  which also strips the ogonek/caron.
- Choice grading in the runner is exact (`option === answer`); typed grading (`isAnswerMatch`,
  diacritics stripped) is unchanged.

## Sentence tasks

`full = stem + answer_ending`; if options exist, the stem is stripped from `display` and
`answer = full` — the same transform as practice, so the blank always stands for the whole
option word. Lookup is on the last token, lowercase: `_FORM_TO_ROW` (WORDS row) first, then
`_EXTRA_FORM_TO_FORMS`. A multi-word answer (`dvidešimt vieni`, case 20) keeps its prefix on
every option; an uppercase answer gets capitalized options.

## Numeral / pronoun table

`backend/data/grammar/paradigms_extra.txt`: one lexeme per line, tab-separated forms (cardinals
vienas…devyni, ordinals pirmas…trisdešimtas, collectives dveji…devyneri, pronouns aš/tu/jis/ji).
**A form on two lines → `None` → typing**, the same collision rule as `_FORM_TO_NOMINATIVE` —
the same reason the noun homograph `drauge` (draugas vocative = draugė instrumental) stays typing.
Indeclinables (`dešimt`, `penkiolika`, `-dešimt` tens) have no line and stay typing. Coverage
measured at implementation time is in the plan's `## Coverage` section.

## Verbs

- Conjugation distractors: other persons of the same verb & tense first, then the same person in
  other tenses (imperative only has tu/mes/jūs). Every candidate passes `_clean_form` +
  `_is_usable_form`, so corrupt extraction cells never show up as an option.
- Verb case: `verb.case_governance` questions are free text. Some carry a Cyrillic `о` homoglyph
  (`kо?`) — on basic it is replaced with Latin `o` in the served answer. Anything still Cyrillic
  is corrupt → no options. Distractors come from a fixed clean list (`_VERB_CASE_QUESTIONS`)
  rather than other DB answers, minus the answer and its space-separated parts (`ką? ko?` never
  offers `ką?` or `ko?` alone). About 150 answers carry a negated-verb prefix (`nerašýti ko?`):
  everything before the first question-vocabulary token (`kas ko kam ką kuo kur kada kaip` +
  prepositions `į apie su iš ant dėl už nuo pas prieš paskui aplink`) is kept as a prefix on every
  distractor, so the correct option is not the only one with it (same idea as the numeral prefix
  in `_sentence_options`). The exclusion rule applies to the question part. An answer with no
  question part at all (`nesišukúoti?`) gets no options.

## Retry is runner-only state

`GrammarTaskRunner` keeps a `queue` initialized to `tasks`. A wrong answer to a non-repeat appends
`{...task, isRetry: true}` (options reshuffled). Only first attempts score; `onFinish` reports
`(firstAttemptCorrect, tasks.length)`, so the saved result and the >75% unlock rule are unchanged.
Nothing is fetched for a repeat — no extra quota — and nothing is remembered across sessions
(«Напомнить» and `/review` cover that).
