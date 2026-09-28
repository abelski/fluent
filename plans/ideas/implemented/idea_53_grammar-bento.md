---
number: 53
slug: grammar-bento
status: confirmed
---

# Idea #53 — Grammar page: hero → program chips → bento

## Problem
`/dashboard/grammar` is a stack of program accordions with nested topic accordions. To start a
lesson a user expands a program, then a topic, then picks a tile — three clicks before any
learning. A user with no enrolled program sees one line of text and a button to a different page
(`/dashboard/grammar/programs`), so the first visit shows nothing of what grammar offers. The user
likes how saunuole.lt/study organises its study page (hero, filter chips with counts, one big
featured card plus smaller stacked cards) and wants grammar laid out that way.

A static prototype was built and iterated with the user first:
`temp_files/prototypes/plan_53_grammar-bento.html`
(artifact https://claude.ai/artifact/CzGMh9tzqXXANWh6Kc76gd), reduced-DoD plan
`plans/improvements/implemented/PROTOTYPE-plan_53_grammar-bento-prototype.md` (superseded by `plan_53_grammar-bento.md`).

## Desired outcome
The grammar lesson list, top to bottom:
1. **Hero card** — title, subtitle, stat row "N из M уроков пройдено" + progress bar, buttons
   «Продолжить ›» and «Напомни, что я забыл»; on the right a static declension sample
   (namas / namo / namui / namą with endings in emerald) and TAK with a speech bubble.
2. **Chips** — «Все N» + one chip per public program with its lesson count; a dot marks enrolled
   programs; «Все программы ›» link on the right.
3. **Bento** — a big featured card (the next lesson, or a program preview) and, on the right,
   stacked cards for the other programs (progress + «Открыть ›» if enrolled; description +
   «Добавить» if not).
4. **Topic cards** — one flat card per topic of the selected program, replacing the accordion;
   each level is a button that starts that lesson directly.

The same page is also the onboarding screen: with no programs it previews what's inside and lets
the user enroll in place.

## Proposed spec

### specs/grammar.md
**New**
```gherkin
Scenario: grammar page with no enrolled program doubles as onboarding
  Given a user (logged in or anonymous) enrolled in no grammar program
  When they open /dashboard/grammar
  Then the hero shows "0 уроков пройдено" with an empty progress bar
  And the hero's primary button reads «Начать с падежей» in the slot where «Продолжить» normally is
  And «Напомни, что я забыл» is not shown
  And the featured card previews the first public program (title, description,
    lesson and topic counts) without its own enroll button
  And the other public programs are stacked beside it, each with a description and «Добавить»
  And the topic cards below show "what's inside" that program, with levels but no scores
```

```gherkin
Scenario: enrolling from the grammar page
  Given a logged-in user on /dashboard/grammar
  When they press «Начать с падежей» or a program's «Добавить»
  Then POST /me/grammar-programs/{id} is called for that program
  And the page switches to that program as enrolled, without navigating away
```

```gherkin
Scenario: anonymous visitor tries to enroll
  Given an anonymous visitor on /dashboard/grammar
  When they press «Начать с падежей» or «Добавить»
  Then they are sent to /login (after sign-in they land on /dashboard, not back on grammar)
```

```gherkin
Scenario: program chips filter the page
  Given the grammar page is loaded
  Then there is one chip per public program with its lesson count, plus «Все»
  And a chip for a program the user is enrolled in carries a dot marker
  And «Все» counts lessons of enrolled programs only (all programs when none is enrolled)
  When a program chip is selected
  Then the featured card and topic cards switch to that program
```

```gherkin
Scenario: featured card shows the next lesson
  Given the user is enrolled in at least one program and chip «Все» is selected
  Then the featured card shows the first enrolled program that has an unpassed, unlocked lesson,
    and the first such lesson in it
  And for a noun-case lesson the heading is the lesson's existing title, already Lithuanian
    (e.g. «Kilmininkas Vns.», «Skaičiai: …»), with the RU/EN case name (rules[0].name_ru|name_en)
    below it; verb lessons use their normal title (title_en in EN) and have no sub-heading
  And the topic's level chips (display only), lesson position ("урок 2 из 3") and a single
    «Начать урок ›» are shown — the level buttons that start lessons live on the topic cards
  And the hero's «Продолжить ›» starts the same lesson
  And under «Все» the topic cards below show the featured card's program
```

```gherkin
Scenario: nothing left to continue
  Given every unlocked lesson in the user's enrolled programs is passed
  When the grammar page loads
  Then the featured card previews a public program the user is not enrolled in, with «Добавить»
  And if every public program is enrolled, it shows a completion summary instead
    (with a /pricing link when only Premium-locked lessons remain)
  And the hero hides «Продолжить ›»
```

```gherkin
Scenario: topic card levels start lessons directly
  Given the topic cards of an enrolled program
  Then each topic card shows its title, the Lithuanian case name for noun-case topics,
    passed/total, and one button per level (Базовый / Продвинутый / Повторение)
  And a level button shows ✓ when passed (>75%) or the best score % when attempted
  When an unlocked level button is pressed
  Then that lesson starts immediately
  And a locked level is disabled with the existing Premium upsell link under it
  And each level button is at least 44px tall on a 375px viewport
```

```gherkin
Scenario: removing a program from the grammar page
  Given the user has selected a program they are enrolled in
  Then «Убрать» appears next to the topics heading
  When they press it and confirm in the dialog
  Then DELETE /me/grammar-programs/{id} is called and the program shows as not enrolled
```

```gherkin
Scenario: enroll or unenroll fails
  Given a logged-in user on /dashboard/grammar
  When enrolling or unenrolling a program returns an error
  Then one line «Не получилось…» in the destructive colour appears under the chips row
  And it is cleared on the next action
```

**Changed** — replaces the implicit "program accordion → topic accordion → lesson tile" layout
(no current scenario describes it; the spec is backend-only today). The remind button keeps the
rule of `plan_26`: disabled with a hint until a practice-level lesson is passed in an enrolled
program.

No API change: noun-case lessons already return a Lithuanian `title` from `lessons.json`.

## Scope
- In: the lesson-list screen of `/dashboard/grammar` (hero, chips, bento, topic cards), all three
  enrollment states, anonymous view, RU + EN, desktop + 375px; no backend change; component library entry + "Deliberate deviations" row.
- Out (non-goals): the other 4 top-nav pages (keep `ProgressStatCard`); the exercise, done and
  blocked screens; `/dashboard/grammar/programs`; Lithuanian names for programs or verb tenses
  (no DB change); "last studied" ordering; pastel gradients / 3D art from saunuole.

## Decisions
- **Look** — layout from saunuole, Fluent tokens only: flat white cards, `border-line`, 14px radius, Inter, emerald accent.
- **Hero** — a new hero on grammar only; the other 4 pages keep `ProgressStatCard`. Recorded in "Deliberate deviations".
- **Declension sample in hero** — kept, static namas/namo/namui/namą; hidden below 860px, where TAK sits small beside the title.
- **Featured heading size** — page-title scale, 32px / 700 / −0.02em / ink (the prototype's 900-weight 76px was rejected as off-system).
- **Empty-state hero** — same shape as enrolled: "0", empty bar, «Начать с падежей» in the Continue slot, remind hidden.
- **Duplicate enroll CTA** — only in the hero; the featured preview has no button (other programs' cards keep «Добавить»).
- **Remind** — only in the hero, not as a stack card.
- **Topic card click** — level chips become buttons that start the lesson; no accordion.
- **Unenroll** — «Убрать» next to the topics heading, with a confirm dialog (copy reused from lists: `removeProgramTitle/Body/Confirm`).
- **Chips** — all public programs; a dot marks enrolled.
- **Next lesson** — first enrolled program with an unpassed, unlocked lesson; no backend change.
- **Nothing left** — suggest a not-enrolled program; else a completion summary (/pricing link if only locked lessons remain).
- **LT heading** — no `title_lt`: noun-case lessons' `title` is already Lithuanian («Kilmininkas Vns.»), so heading = `title`, sub-heading = `rules[0].name_ru|name_en`; verbs use their normal title (`title_en` in EN).
- **Anonymous** — same page as "no programs"; enroll → `/login`, no return (OAuth always lands on `/dashboard`; changing that needs an auth change the user declined).
- **Featured card levels** — display-only level chips + one «Начать урок ›»; the level buttons that start lessons live on topic cards.
- **Topics under «Все»** — follow the featured card's program.
- **Enroll/unenroll error** — one `text-destructive` line under the chips row, cleared on the next action (was only `console.error`).
- **Free vs Premium** — unchanged: `is_locked` stays server-side; locked levels disabled with upsell link.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_26_grammar-remind.md` — remind eligibility rule and disabled-with-hint button; reused as is.
- `plans/improvements/implemented/IMPLEMENTED-plan_10_premium-grammar-lesson-order.md` — server-side `is_locked`, upsell link outside the dimmed tile; reused on level buttons.
- `plans/improvements/implemented/IMPLEMENTED-plan_1_mobile-ux-fixes.md` — 44px tap targets, `role="button"` for headers containing controls; applies to level buttons and the «Убрать» link.

## Success check
Grammar lessons completed per week (count of `GrammarLessonResult` rows per week, excluding the
remind sentinel `lesson_id = 0`), 4 weeks before vs 4 weeks after release. Goal: it goes up.

## Open questions
None.

## Shipped vs proposed
Landed in `specs/grammar.md` (9 grammar-page scenarios). Refinements from the code: the case sub-heading
drops a trailing «(<LT title>)» from `rules[0].name_*` (real names repeat the title); in the no-programs
preview the topic-card level buttons are disabled and «Убрать» is hidden; every «Добавить» (hero, featured,
stack) goes through the same enroll path.
