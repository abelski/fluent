---
number: 60
slug: grammar-choice-and-retry
status: implemented
---

# Idea #60 — Grammar: multiple choice on Basic, retry wrong tasks

## Problem
Every grammar level is typing-only. A student meeting a case or tense for the first time on the
Basic level must already produce the ending — there is no "recognize first" step, so the entry to a
topic is steep. And a wrong answer is shown once and forgotten: the run moves on and the student
never gets to produce the right form themselves.

Inspired by github.com/jekhor/spragos (Lithuanian gap-fill trainer: choice from same-paradigm
forms, mistakes come back more often). We take the two mechanics, not its code, data format,
drag-and-drop or content (AI-generated, unverified, partly textbook-sourced).

## Desired outcome
- **Basic** = pick the right form from 4 full words of the same paradigm (recognize).
- **Advanced** = type the ending from memory, rule card collapsed (unchanged).
- **Practice («Повторение»)** = type the full word, no rule (unchanged).
- On every level and in «Напомнить», a task answered wrong comes back once at the end of the run.

## Proposed spec

### specs/grammar.md
**New**
```gherkin
Scenario: basic-level tasks carry four same-paradigm options
  Given a lesson whose level is "basic"
  When GET /grammar/lessons/{lesson_id}/tasks or GET /grammar/verb-lessons/{id}/tasks is called
  Then every task whose word has at least 4 distinct paradigm forms carries "options":
    4 distinct full words, one of which is the correct form; other tasks stay typing
  And the distractors come from the same paradigm as the answer:
    declension and sentence tasks → other case forms of the same noun,
    verb_conjugation tasks → other person forms of the same verb and tense,
    verb_case tasks → other case questions (kam? / ką? / ko? / ...), any negated-verb prefix
      ("nerašýti ko?") kept on every option; no question word → no options
  And the option order is shuffled
  And advanced and practice tasks carry no "options"
```

```gherkin
Scenario: student answers a basic task by choosing
  Given a basic-level lesson run
  When the task is shown
  Then the student sees 4 option buttons (single-column list like the word quiz, keys 1–4,
    each ≥44px tall) instead of a text input
  And the rule card is visible, as on basic today
  When the student taps an option
  Then it is graded against the correct full word (exact form, so diacritics count)
  And correct / wrong feedback and the "Понятно, дальше" flow match the typed levels
```

```gherkin
Scenario: a wrong task comes back once at the end of the run
  Given any grammar run (basic, advanced, practice, or «Напомнить»)
  When the student answers a task wrong
  Then that task is appended once to the end of the run, marked «Повтор» / «Retry»
  And the progress counter grows to include it (e.g. 11 / 12 for 10 tasks + 2 mistakes)
  And a repeated task answered wrong again is not appended a second time
  And on basic the repeated task's options are reshuffled
```

```gherkin
Scenario: the score counts first attempts only
  Given a run of N tasks with some repeats appended
  When the run finishes
  Then the saved result is (first-attempt correct, N) — repeats never change score or total
  And the >75% unlock threshold is judged on that score, as today
  And repeats consume no extra daily session quota
```

**Changed** — the current scenario "starting an unlocked lesson consumes the daily quota" is
unchanged in behavior; only the task payload gains `options` on basic.

## Scope
- In: `options` on basic tasks (server-generated), choice UI in `GrammarTaskRunner` for basic,
  in-run single retry of wrong tasks on all levels and «Напомнить», «Повтор» label, RU + EN copy,
  375px layout, design-system component-library entry for the option grid.
- Out (non-goals):
  - Strict diacritic grading and an ą č ę ė į š ų ū ž panel — today `normalizeLt` strips diacritics,
    so `ranka` passes for `ranką` (different cases). Real problem, but it changes grading for every
    student; separate idea, needs data first (how many answers pass only via normalization).
  - Remembering mistakes across sessions (spragos' "errors come up more often in later rounds") —
    «Напомнить» and `/review` cover that.
  - Drag-and-drop, `.txt` exercise format, importing spragos content.
  - Rule popup — already exists (rule card: visible on basic, collapsible on advanced).
  - A per-user choice/typing toggle.

## Decisions
- **Which spragos ideas** — choice from paradigm forms + in-run retry; diacritics deferred; rule popup already exists.
- **Where choice applies** — Basic only; Advanced = typed ending from memory; Practice = full word typed.
- **Advanced rule card** — stays collapsible (as now), not removed.
- **Option shape** — 4 options, full words, all 4 task types.
- **Retry rule** — wrong task re-appended once at the end; only the first attempt scores.
- **Retry label/counter** — «Повтор» / «Retry» chip; counter total grows by the number of mistakes.
- **Free vs Premium** — same for all; retries cost no extra quota.
- **Cross-session mistake memory** — out.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_8_grammar-practice-full-word.md` — level-specific
  task shape decided server-side in `grammar_service.py` (practice strips the stem). Basic `options`
  follows the same pattern: the level decides the payload, the runner switches on it.
- `plans/improvements/implemented/IMPLEMENTED-plan_26_grammar-remind.md` — «Напомнить» runs
  practice-level tasks through the same `GrammarTaskRunner` and saves via the normal results
  endpoint, so the retry queue in the runner covers it for free.
- `plans/improvements/implemented/IMPLEMENTED-plan_53_grammar-bento.md` — level buttons and the
  3-level structure stay as they are; no new level is added.

## Success check
- Basic-level first-attempt pass rate (>75%) over the 2 weeks after release vs the 2 weeks before,
  from `GrammarLessonResult` (basic lessons only).
- No basic task is ever served with fewer than 4 distinct options or without the correct one
  (autotest over all lessons).

## As shipped
Changed during planning (user-approved 2026-10-08): single-column option list instead of 2×2;
options only when ≥4 distinct forms exist (typing fallback, e.g. indeclinable numerals in lesson
100); numeral/pronoun table added (`backend/data/grammar/paradigms_extra.txt`); verb_case
negated-verb prefix rule added after smoke testing.

## Open questions
- Words whose paradigm has fewer than 4 distinct forms (syncretism, e.g. same form in two cases):
  fill from another word of the same case, or fall back to typing for that task? Analyst decides.
- `sentence` tasks: confirm every row's base word resolves to a full paradigm
  (`_FORM_TO_NOMINATIVE` / `_STEM_TO_NOMINATIVE` → `WORDS`); rows that don't need the fallback above.
