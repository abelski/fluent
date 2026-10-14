---
status: prototype
number: 66
---

# Plan 66 — Grammar & Practice overview pages: clearer layout, passed vs not passed (static prototype)

## Goal
The user finds the program pages of Грамматика (`/dashboard/grammar`) and Практика
(`/dashboard/practice`) confusing, and there is no split between passed and not-passed items.
The exercise screens work well and are out of scope. Sketch two layouts as a static mock and let
the user pick one before any product code.

## What is wrong today
Measured on 2026-10-13 against the live frontend with the real catalogue (4 grammar programs,
6 practice categories, 85 tests) and a mocked user:

1. **Same thing shown 2–4 times.** Programs appear as chips, as stack cards on the right, and on
   the separate «Смотреть все программы» page. The next lesson is both the hero «Продолжить» and
   the featured card «Начать урок».
2. **No passed / not-passed split.** Done, half-done and untouched topics sit in one grid. Status is
   a small grey `2/3` and a ✓ inside the level pills.
3. **Level colours look like status.** «Продвинутый» is always green, «Повторение» always amber, so
   untouched topics look half done.
4. **«Все 56» shows 36.** The «Все» chip lists only the featured program's topics.
5. **Practice tests are bare numbers** (1–6). The title is only a hover tooltip, so on a phone you
   cannot tell tests apart.
6. **Featured card is mostly empty.** It stretches to the stack's height: ~900 px tall on practice
   desktop for ~120 px of content.
7. **Long mobile scroll.** At 375 px practice is 3446 px and grammar 4589 px. The list starts after
   the hero, 4 rows of chips, the featured card and 5 stack cards.
8. **Repeated theory link.** All 12 case topics show the same «Существительные: склонение» link.
9. **Red «Убрать» in the reading path**, next to the topics heading.
10. **Old catalogue pages.** `/dashboard/grammar/programs` and `/dashboard/practice/programs` use
    pre-redesign styles; the grammar one prints a hardcoded «36 уроков» for every program.

Both pages are linear paths: practice locks test N until N-1 is passed (all users,
`routers/practice.py`), grammar does the same for free users
(`documentation/grammar-lesson-lock-and-premium.md`). So a user always has a done part, one current
item and a locked tail. The layout should show exactly that.

## Shared changes (both variants)
- **One continue.** The hero keeps «Продолжить» and names the item: «Дальше: Vardininkas Dgs. ·
  Повторение». The featured card and the right-hand stack are removed.
- **Two groups per program:** «Не пройдено» (open) and «Пройдено» (collapsed, with a count).
- **Compact rows instead of a card grid.** Rows sit in one card with `line-soft` separators.
  - Grammar row: LT title + case name, then one button per level. Colour means status only:
    passed `bg-emerald-50 text-emerald-600 ✓`, tried `bg-amber-50 text-amber-600 %`, new white,
    locked faint + lock. This is the status scheme practice test buttons already use.
  - Practice row: title in the UI language + the other-language title, question count, best score,
    one button. Constitution keeps its blocks as sub-headings; only the current block is open.
- **The current item** carries a «Дальше» tag and the only dark button in the list.
- **Theory link** once in the program header when every topic shares one article (cases,
  adjectives); per row otherwise (numbers).
- **Not-enrolled programs** move to one «Другие программы» block with «Добавить».
  «Убрать программу» moves to the end of the program's list.
- **Fully passed programs leave the main list** (user feedback, 2026-10-13: a finished program is
  noise). They drop out of A's chips and B's cards into a «Повторить» block above «Другие
  программы»: one collapsed row per program (name, blue «✓ Готово», `18/18`) that expands to its
  passed items.
- **New user / guest:** the hero offers «Начать с падежей» / «Начать с Конституции»; the body is the
  catalogue (description, counts, a preview of the topics).

## Variant A — one page, program chips
Hero → chips of **my** programs with progress (`11/36`) plus «+ Добавить программу» → the selected
program's panel (header, «Не пройдено», «Пройдено», «Убрать») → «Другие программы».
No «Все» chip. The selected chip defaults to the program with the next item.

## Variant B — my programs, then a program page
Main view: hero → «Мои программы» as cards (title, progress bar, «Дальше: …», whole card opens the
program; a finished program shows the blue «✓ Готово» badge from #183) → «Другие программы».
Program view (`?program=<id>` on the same page, so the static export needs no new route): back link,
the program in the hero card (its own progress and «Продолжить»), then the same two groups as A.

## Prototype
- `temp_files/prototypes/plan_66_grammar-practice-overview.html`, one file, published as a
  private artifact.
- Header, hero, mascot and footer are copied from the live DOM, not redrawn. Data is a snapshot of
  the real public API (titles, counts, sections) with made-up progress.
- Switchers: page (Грамматика / Практика), variant (A / B), state (new user / in progress, free /
  in progress, Premium), RU / EN.
- No app code is touched, so no branch.

## Review loop (user request, 2026-10-13)
The user asked for cold usability reviews against references, repeated until the design is right.
- Each round runs fresh `general-purpose` agents that see only screenshots and a neutral brief
  (`temp_files/screenshots/plan_66_grammar-practice-overview-prototype/REVIEW_BRIEF.md`), never this
  plan or the reasoning behind it. Lenses: heuristic UX, persona walkthrough (RU phone / EN
  desktop), comparison with learning-app references (Duolingo, Busuu, Babbel, Khan Academy, …).
- Every version's screenshots go in their own subfolder: `before/`, `v1/`, `v2/`, …
- Stop when a fresh round finds no severity ≥ 3 issue in the leading variant and scores every task
  T1–T6 at 8/10 or more — or after 4 rounds, reporting what is still open.

## Out of scope
- Exercise screens (`GrammarTaskRunner`, practice `[id]` page): the user says they work well.
- Статьи keeps the bento layout: it is a library to browse, not a path.
- Backend: every field the variants need (`best_score_pct`, `is_locked`, `enrolled`, sections)
  is already in the API.

## Open questions (after a variant is picked)
- Delete the two `/programs` catalogue pages once «Другие программы» lives on the main page?
- Hide the disabled «Напомни что я мог забыть» button until it can be used?
- What does «Повторить» do for a finished program: only expand its passed items (prototype, no
  backend change), or start a mixed review session (grammar could scope the #26 remind endpoint to
  one program — backend change)?

## Definition of Done (prototype — reduced, nothing ships)
- [x] Both languages: every view renders in RU and EN — screenshots.
- [x] Mobile at 375px: every view, no horizontal scroll — screenshots.
- [x] Desktop at 1280px: every view — screenshots.
- [x] Screenshots in `temp_files/screenshots/plan_66_grammar-practice-overview-prototype/`,
      looked at (11 views × RU/EN × 1280/375 = 44 shots, no JS errors, no horizontal scroll).
- [x] Published as a private artifact: https://claude.ai/artifact/Wbw8gNSh129QSgqTAZxEGK.
      STOP for the user's pick.
- Dropped for the prototype: autotests, CHANGELOG, component-library update, parity spec. They come
  back when the picked variant goes through `/sdlc-feature-analyst` under the same number 66.
