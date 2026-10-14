---
status: prototype
number: 66
---

# Plan 66 — Grammar & Practice overview pages: clearer layout, passed vs not passed (static prototype)

## Goal
The user finds the program pages of Грамматика (`/dashboard/grammar`) and Практика
(`/dashboard/practice`) confusing: there is no split between passed and not-passed items, and a
fully passed program is noise. The exercise screens work well and are out of scope. Find the right
layout as a static mock, refined by cold usability reviews, before any product code.

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
5. **Practice tests are bare numbers** (1–6). The title is only a hover tooltip.
6. **Featured card is mostly empty** (~900 px tall on practice desktop for ~120 px of content).
7. **Long mobile scroll.** At 375 px practice is 3446 px and grammar 4589 px.
8. **Locked items look open** until tapped; the in-order rule is never stated.
9. **Old catalogue pages** (`/dashboard/{grammar,practice}/programs`) in pre-redesign styles; the
   grammar one prints a hardcoded «36 уроков» for every program.

Both pages are linear paths: practice locks test N until N-1 is passed (all users,
`routers/practice.py`), grammar does the same for free users
(`documentation/grammar-lesson-lock-and-premium.md`).

## Converged design (v3)
Two layouts (A: one page with program chips; B: program cards → program page) were sketched first;
cold reviews preferred B's structure 2:1, and v2/v3 merged the best of both.

**Overview** (`/dashboard/grammar`, `/dashboard/practice`):
1. Shared hero, unchanged shell. One line names what the button opens and the pass mark:
   «Дальше — Литовские падежи: Vardininkas Dgs. · Смешанный — лучший 60% · нужно больше 75%».
   The button carries the verb («Ещё попытка ›» / «Начать ›»).
2. «В процессе» — a card per program in progress: progress, its own «Дальше» panel with a verb
   button, «Все темы ›». The program the hero already continues has no second panel.
3. «Завершённые» — one row per fully passed program: ✓, `18/18`, «Пора повторить» when the last
   session was ≥ 7 days ago, «последний раз N дней назад», «Слабее всего: X — 78%» and a button that
   retakes exactly that («Пройти заново · Продвинутый»).
4. «Другие программы» — catalogue cards, each with «Добавить» and «Что внутри» (format line + topics
   in the UI language). Practice groups them by exam: «Экзамен на гражданство», «Экзамен A2».
5. New user: hero «Начать с падежей»; practice asks for the exam instead («Гражданство · Конституция»,
   «A2 · Чтение»). Body = the catalogue.

**Program page** (`?program=<id>` on the same route — the static export needs no new route):
1. Back link; on desktop a chip row of my programs for one-click switching (hidden on phones).
2. Compact header: title, lessons and topics passed, bar, theory link (once, when all topics share
   one article), the «Дальше» line and the verb button («Ещё попытка · Смешанный ›»), ⋯ menu with
   «Убрать программу». TAK stays 128 px but sits beside the title, so the button is on the first
   phone screen.
3. «Осталось N» — the next item first (tag «Дальше»), then the locked tail: two rows, the first says
   «Откроется после «X» — нужно …», the rest folded («Ещё 6 тем — откроются по порядку»). Grammar
   free users get one «Открыть всё сразу — с Premium» link. Practice keeps the Constitution's blocks:
   the current one open, the others one line each with a segmented progress strip; the final exam is
   pinned last («Откроется, когда сданы все блоки и итоговые тесты»).
4. «Пройдено N · слабее всего: X 78%» — collapsed, weakest first, with scores.

**One wording for states and actions on both pages:** new → «Начать»; tried below the pass mark →
amber «лучший 45% · нужно больше 75%» + «Ещё попытка»; passed → green «✓ 90%» + «Пройти заново»;
locked → lock + «Откроется после X». Green means passed only; the «Дальше» tag is neutral.
Grammar rows show each level's state as text and one verb button; every level is reachable from a
small «▾» menu (pills read as status badges in review round 2).

## Content and data work the design needs
- Constitution tests: `title_ru` holds Lithuanian. Add Russian titles («Урок 5: статьи 25–31») and
  keep the Lithuanian original as a separate field (e.g. `title_lt`).
- Reading tests: `title_en` holds Lithuanian without diacritics («Cia mano seima»). Add English
  titles and restore the Lithuanian ones («Čia mano šeima») — the user checks the Lithuanian.
- Reading category has no description (RU/EN).
- Verbs program description says «12 уроков»; it has 20.
- «Последний раз N дней назад» needs the latest result date per program from the API.
- Renames: grammar level 3 «Повторение» / "Practice" → «Смешанный» / "Mixed" (clashed with the
  «Повторить» section and the EN "Practice" tab; also shows in the exercise screens);
  «Напомни что я мог забыть» → «Повторить пройденное»; grammar hero subtitle → «Падежи,
  числительные, глаголы и прилагательные» (it said "declensions" only).

## Prototype
- `temp_files/prototypes/plan_66_grammar-practice-overview.html`, one file, published as a private
  artifact: https://claude.ai/artifact/Wbw8gNSh129QSgqTAZxEGK (v1 = A/B, v2, v3 in its history).
- Header, hero, mascot and footer are copied from the live DOM, not redrawn. Data is a snapshot of
  the real public API with made-up progress; v3 also applies the title data fixes above.
- Switchers: page, state (new user / in progress, free / in progress, Premium), RU / EN.
- No app code is touched, so no branch.

## Review loop (user request, 2026-10-13)
The user asked for cold usability reviews against references, repeated until the design is right.
- Each round runs three fresh `general-purpose` agents that see only screenshots and a neutral brief
  (`temp_files/screenshots/plan_66_grammar-practice-overview-prototype/REVIEW_BRIEF*.md`), never this
  plan. Lenses: heuristic UX, persona walkthrough (RU phone / EN desktop), learning-app references.
- Screenshots per version: `before/`, `v1/`, `v2/`, `v3/`.
- Stop when a fresh round finds no severity ≥ 3 issue and scores every task T1–T6 at 8/10 or more —
  or after 4 rounds, reporting what is still open.

| Round | Version | Task scores T1–T6 (proposal) | Severity-3 issues |
| --- | --- | --- | --- |
| 1 | v1 A / B | A 36–40/60, B 37–38/60 (before 23–26) | locks without reasons, no pass mark, label clashes |
| 2 | v2 | 8/8/7/8/7/8 · 9/8/7/8/6/8 · 8/7/6/8/7/8 | phone CTA below the fold; grammar retake pills read as badges |
| 3 | v3 | running | |

## Out of scope
- Exercise screens (`GrammarTaskRunner`, practice `[id]` page).
- Статьи keeps the bento layout: it is a library to browse, not a path.
- A diagnostic / "jump ahead" test and an exam-date study plan (suggested by reviewers; product
  decisions for later).

## Open questions (for the user, before the build plan)
- Delete the two `/programs` catalogue pages now that «Другие программы» lives on the main page?
- Rename grammar level 3 to «Смешанный» everywhere, including the exercise screens?
- What should «Пора повторить» key on: days since the last session (as drawn), the weakest score, or both?

## Definition of Done (prototype — reduced, nothing ships)
- [x] Both languages: every view renders in RU and EN — screenshots.
- [x] Mobile at 375px: every view, no horizontal scroll — screenshots.
- [x] Desktop at 1280px: every view — screenshots.
- [x] Screenshots in `temp_files/screenshots/plan_66_grammar-practice-overview-prototype/`
      (`before/`, `v1/` 48, `v2/` 48, `v3/` 52 shots), looked at; no JS errors, no horizontal scroll.
- [x] Published as a private artifact and opened for the user.
- [ ] Review loop reaches its stop condition (or 4 rounds). STOP for the user's decision.
- Dropped for the prototype: autotests, CHANGELOG, component-library update, parity spec. They come
  back when the design goes through `/sdlc-feature-analyst` under the same number 66.
