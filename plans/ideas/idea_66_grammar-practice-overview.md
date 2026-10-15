---
number: 66
slug: grammar-practice-overview
status: confirmed
---

# Idea #66 — Grammar & Practice overview pages: passed vs not passed

Source of truth for the design, the nine measured problems, five review rounds and the prototype:
`plans/improvements/active/plan_66_grammar-practice-overview-prototype.md` (read it; this file does
not repeat the reasoning). Prototype: `temp_files/prototypes/plan_66_grammar-practice-overview.html`
(v5.2), https://claude.ai/artifact/Wbw8gNSh129QSgqTAZxEGK.

## Problem
Learners find the program pages of Грамматика and Практика confusing. Done, half-done and untouched
items sit in one grid; programs show 2–4 times; locks are unexplained; a fully passed program is noise;
practice tests are bare numbers. At 375 px the pages are 3446 px (practice) and 4589 px (grammar) long.
The exercise screens work and stay untouched.

## Desired outcome
Two overview pages that answer "what do I do next?" in one screen, split into «В процессе»,
«Завершённые» and «Другие программы». A program page (`?program=<id>`) lists only what is left
(«Осталось N»), with the passed items folded under «Пройдено». One status wording on both pages.
The hero is compact on phones on all five top-nav pages.

## Proposed spec
Behavior is defined in full by plan 66 «Converged design (v5.1)» and «Decisions». The scenarios below
are the contract; the analyst expands them per component.

### specs/grammar.md
**Changed** (replaces «program chips filter the page», «featured card shows the next lesson»,
«topic card levels start lessons directly», «nothing left to continue»)
```gherkin
Scenario: overview splits programs by state
  Given a student enrolled in programs A (in progress), B (fully passed) and not enrolled in C
  When /dashboard/grammar opens
  Then «В процессе» holds a card for A with count, bar and «Дальше — <topic> — <state>»
  And «Завершённые» holds a row for B with ✓, N/N and «Повторить · ~10 заданий»
  And «Другие программы» holds a catalogue card for C with «Что внутри» and «Добавить»
  And the hero holds the page's only «Продолжить», for the program practised last
```
```gherkin
Scenario: program page lists what is left
  Given a student opens /dashboard/grammar?program=<id>
  Then «Осталось N» shows the next topic first (kicker «Дальше»), then started topics (tag «Начато»)
  And each topic's levels are one strip of tappable cells (name + «✓ 90% ›» / «60% ›» / «не начат ›» / lock)
  And passed topics are folded under «Пройдено N · слабее всего: X» (collapsed in progress, open when complete)
```
```gherkin
Scenario: locked topics state their reason
  Given a free student
  Then the first locked row says «Откроется после «X» — нужно …» and the rest fold into «Ещё N тем»
  And tapping a locked row or cell shows its reason
  And free users see «Открыть всё сразу — с Premium»
```
```gherkin
Scenario: a finished program says it is time to review
  Given the last session in a fully passed program was 7 or more days ago
  Then its row shows «Пора повторить» and «последний раз N дней назад · слабее всего: X — ✓ 78%»
```
**Changed** (remind)
```gherkin
Scenario: remind session scoped to one program
  Given GET /grammar/remind/tasks?program_id=<id>
  Then up to 10 tasks are sampled only from that program's passed "practice"-level lessons
  And the weakest lessons (lowest best score) are drawn first
  And without program_id behaviour is unchanged
  And 404 "no_passed_practice" is returned before any quota is charged when nothing is eligible
```
**Changed** (level 3 rename)
```gherkin
Scenario: level 3 is called «Смешанный» / "Mixed" everywhere
  Then the lesson list, the exercise screens and the hero text no longer say «Повторение» / "Practice"
```
**New**
```gherkin
Scenario: programs report their latest result date
  When the programs API is read for a signed-in student
  Then each enrolled program carries the date of the student's latest result in it (null if none)
  And "Пора повторить" and the hero's choice of program use it
```
**Removed**: the `/dashboard/grammar/programs` page and its hardcoded «36 уроков».

### specs/practice.md
**Changed** (replaces «featured card», «section cards», «final exam card», onboarding)
```gherkin
Scenario: practice overview mirrors grammar
  Then the page shows «В процессе», «Завершённые», «Другие программы» exactly as grammar does
  And the A2 catalogue group offers «Добавить все части (5)»
  And a new user's hero is «Начать с Конституции» / «Начать с чтения (A2)»
```
```gherkin
Scenario: practice program page
  Then «Осталось N» rows open their test (whole row, ›), showing title, state and pass mark
  And the Constitution keeps blocks: current block open, others one line «Откроется после «Блок 1…»»
  And its sample test (pass mark 0, locks nothing) comes first as «Начни здесь · без проходного балла»
  And the final exam is pinned last
```
```gherkin
Scenario: finished category review button reopens the weakest test
  Given every test in a practice category is passed
  Then «Повторить» opens the lowest-scoring test as a normal retake
  And no new backend endpoint and no daily session is involved
```
**Removed**: the `/dashboard/practice/programs` page.

### specs/articles.md, specs/lists.md, specs/phrases.md
**Changed**
```gherkin
Scenario: compact hero on phones
  Given a viewport of 375 px
  Then the hero title is full width, TAK sits beside the numbers, the button is full width
  And desktop is unchanged
```

## Scope
- In: both overview pages; program page via `?program=<id>`; shared status wording; delete the two
  `/programs` pages and their three links (`GrammarOverview.tsx`, `practice/page.tsx`,
  `continue/page.tsx`); compact hero on phones in `BentoHero` + `ProgressStatCard`; latest-result
  date per program in the API; `program_id` on grammar remind (weakest first); renames («Смешанный»,
  «Повторить пройденное», grammar hero subtitle); data fixes (Constitution `title_lt` + UI-language
  titles, reading test titles RU/EN, reading category description, Verbs «20 уроков»); new
  darker-grey info-text token in the component library; spec + design-system updates; tests.
- Out: exercise screens; Статьи layout; diagnostic / jump-ahead test; exam-date plan; Constitution
  readiness check; early block unlock; «Ошибки (N)» pool; a practice review endpoint.

## Decisions
- **Q** Layout? — B: program cards → program page (cold reviews 2:1), refined over 5 rounds.
- **Q** Delete `/programs` pages? — yes; «Другие программы» replaces them.
- **Q** Rename level 3? — «Смешанный» / "Mixed", also in exercise screens.
- **Q** «Пора повторить» threshold? — 7+ days since the program's last session.
- **Q** Compact phone hero? — in scope, all five top-nav pages, desktop unchanged.
- **Q** Premium «Продолжить»? — next lesson in order.
- **Q** Practice grouped by exam on the overview? — no (A2 group keeps «Добавить все части»).
- **Q** Backend in scope? — review scoped to one program (grammar) and latest result date per program.
- **Q** Practice review button? — reopen the weakest passed test; no new endpoint (user, 2026-10-15).
- **Q** Grammar «сначала слабое»? — default: remind draws lowest-best-score lessons first (no ask; copy
  stays honest). Analyst may drop the copy if it costs a query.
- **Q** Free vs Premium? — unchanged rules; only the presentation changes (free: lock reasons + Premium
  link; Premium: next + started + two more, rest folded).

## Precedents
- `plans/improvements/implemented/` #26 (grammar remind) — endpoint to extend with `program_id`.
- `documentation/grammar-lesson-lock-and-premium.md` — lock rules, unchanged.
- #62f / #62h — program seeding; `_program_lesson_ids()` already maps program → lessons.
- Plan 66 prototype and `design-system-parity.spec.ts` — shared shell guard for the hero change.

## Success check
- Screenshots (RU + EN, 375 px + 1280 px, all states) match the v5.2 prototype.
- At 375 px the practice overview is well under the old 3446 px; «Продолжить» ends near 500 px.
- `design-system-parity.spec.ts` passes for all five pages; backend tests cover `program_id`
  scoping, weakest-first order and the latest-result date.

## Open questions
- Exact JSON shape for the latest-result date (new field on the programs response vs. separate endpoint).
- Where `title_lt` lives in the admin edit form and import/export for Constitution tests.
