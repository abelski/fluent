---
status: prototype-approved
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

## Converged design (v5.1)
Two layouts (A: one page with program chips; B: program cards → program page) were sketched first.
Cold reviews preferred B's structure 2:1; five review rounds refined it into the design below.

**Overview** (`/dashboard/grammar`, `/dashboard/practice`):
1. Shared hero, unchanged shell. One line names what the button opens and the pass mark:
   «Дальше — Литовские падежи: Vardininkas Dgs. · Смешанный — лучший 60% · нужно больше 75%».
   The only «Продолжить» on the page. It continues the program practised last (needs the
   per-program last-result date below).
2. «В процессе» — one card per program in progress; the whole card opens the program. Count, bar,
   «Дальше — <item> — <state>» as text, «Открыть программу ›». No buttons on the cards.
3. «Завершённые» — one row per fully passed program; the row opens the program. ✓, `18/18`,
   «Пора повторить» when the last session was ≥ 7 days ago, «последний раз N дней назад · слабее
   всего: X — ✓ 78%», and one action: «Повторить · ~10 заданий» with «Короткая сессия из
   пройденного, сначала слабое».
4. «Другие программы» — catalogue cards with «Что внутри» (format line with the level names, topics
   in the UI language) and «Добавить». Practice groups them by exam; the A2 group has «Добавить все
   части (5)». «Добавить» opens the program with «✓ … теперь в твоих программах · Отменить».
5. New user: hero «Начать с падежей»; practice «Начать с Конституции» / «Начать с чтения (A2)».
   Body = the catalogue.
6. Not drawn: every added program complete → hero says so and offers the most overdue review.

**Program page** (`?program=<id>` on the same route — the static export needs no new route):
1. Back link and «Перейти:» chips for my other programs (a sideways-scrolling row on a phone).
2. Compact header: title (⋯ menu with «Убрать программу» in the top-right corner), lessons and
   topics passed, bar, theory link (once, when all topics share one article), the «Дальше» line and
   the page's one button. TAK stays 128 px but sits beside the stats, so the button is on the first
   phone screen. A finished program shows ✓, «Пора повторить», the weakest item and «Повторить · ~10».
3. «Осталось N»:
   - The next item first, tinted, kicker «Дальше» («Начни здесь» on an untouched program).
   - Grammar: a legend («Каждый уровень темы — отдельный урок…; с ✓ — пройден, без ✓ — лучшая
     попытка»), then each topic's levels as one strip of tappable cells (name, «✓ 90% ›» / «60% ›» /
     «не начат ›» / lock). Started topics are tagged «Начато».
   - Locked tail: two rows, the first says «Откроется после «X» — нужно …», the rest folded
     («Ещё 6 тем — откроются по порядку»). Free grammar users get «Открыть всё сразу — с Premium».
     Premium sees next + started + two more, the rest folded (open by default on desktop).
   - Practice rows open their test (whole row, ›). The Constitution keeps its blocks: the current
     one open with all its tests, the others one line each («Откроется после «Блок 1…»»), a
     segmented strip and `4/6`. Its sample test (no pass mark, locks nothing) comes first as «Начни
     здесь · без проходного балла». The final exam is pinned last.
4. «Пройдено N · слабее всего: X ✓ 78%» with «Показать ▾» — collapsed while in progress, open when
   complete. In progress it starts with the review session; rows go weakest first.

**One wording on both pages:** new → «нужно больше 75%» / «нужно 60%»; tried below the pass mark →
amber «лучший 45%»; passed → green «✓ 90%»; locked → lock + «Откроется после X». Green means passed
only. Verbs: «Продолжить» (the path's next step, once per page), «Повторить · ~10» (a review
session), «Добавить» (catalogue), «Начать с …» (new-user hero). Lists carry no verb buttons: rows and
level cells open the item themselves.

**Build notes from the reviews:** tapping a locked row or cell shows its reason; information text
uses a darker grey than `muted` (#5b6067 in the prototype; `muted` at 12–13 px is 3.2:1 and fails
AA). That is a new token for the component library.

## Content and data work the design needs
- Constitution tests: `title_ru` holds Lithuanian. Add UI-language titles — «Тест 5: статьи 25–31» /
  "Test 5: Art. 25–31", «Контрольная 1: статьи 1–31» / "Checkpoint 1: Art. 1–31", «Пробный тест» —
  and keep the Lithuanian original as a separate field (e.g. `title_lt`).
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
  artifact: https://claude.ai/artifact/Wbw8gNSh129QSgqTAZxEGK (v5.2 current; v1 = A/B, v2–v5.1 in its history).
- Header, hero, mascot and footer are copied from the live DOM, not redrawn. Data is a snapshot of
  the real public API with made-up progress; v3 also applies the title data fixes above.
- Switchers: page, state (new user / in progress, free / in progress, Premium), RU / EN.
- No app code is touched, so no branch.

## Review loop (user request, 2026-10-13)
The user asked for cold usability reviews against references, repeated until the design is right.
- Each round runs three fresh `general-purpose` agents that see only screenshots and a neutral brief
  (`temp_files/screenshots/plan_66_grammar-practice-overview-prototype/REVIEW_BRIEF*.md`), never this
  plan. Lenses: heuristic UX, persona walkthrough (RU phone / EN desktop), learning-app references.
- Screenshots per version: `before/`, `v1/` … `v5/`.
- Stop when a fresh round finds no severity ≥ 3 issue and scores every task T1–T6 at 8/10 or more —
  or after 4 rounds, reporting what is still open. Round 4's only severity-3 issue was one concrete
  bug that all three reviewers found, so a fifth round checks the fix; round 5 is the hard cap.

Outcome: round 5 found no severity ≥ 3 issue; every task scored 8–9 except T3 at 7 in two reports.
Final polish without a further round (v5.1, `v5.1/` 60 shots): an action cue in the level cells,
«Показать ▾» on «Пройдено», a ✓ on its weakest score, a legend without a fixed «60%», darker lock
reasons and info text, chips for my other programs on phones, «Открыть программу ›» on cards, ⋯ in the
header corner, Undo on «Добавлено», «Добавить все части» for A2, «Начать с …» on the new-user hero,
«Тест N» names for the Constitution, full block lists, the hero following the program practised last.
The T3 fixes were not re-reviewed.

| Round | Version | Task scores T1–T6 (proposal) | Severity-3 issues |
| --- | --- | --- | --- |
| 1 | v1 A / B | A 36–40/60, B 37–38/60 (before 23–26) | locks without reasons, no pass mark, label clashes |
| 2 | v2 | 8/8/7/8/7/8 · 9/8/7/8/6/8 · 8/7/6/8/7/8 | phone CTA below the fold; grammar retake pills read as badges |
| 3 | v3 | 9/8/8/7/8/8 · 8/8/8/7/8/8 · 9/9/8/6/8/9 | four "do it again" actions with three verbs on one screen (T4) |
| 4 | v4 | 9/8/8/9/8/7 from all three reviewers | Constitution first visit: the sample test (pass mark 0) sat last under «Итоговые тесты», printed «нужно 0%», and Block 1's lock named its own first test (T6) |
| 5 | v5 | 8/8/7/9/8/8 · 9/8/8/9/8/8 · 9/8/7/9/8/9 | none — T3 at 7 in two reports: level cells gave no tap cue, «Пройдено» toggle too faint |

v4 changes after round 3: three verbs with one meaning each — «Продолжить» (the path's next step: hero,
cards, program header), «Начать / Ещё попытка / Пройти заново» (one item in a list), «Повторить · ~10
заданий» (a review session scoped to one program); the hero's «Напомни что я мог забыть» moved into
the program's «Пройдено»; every in-progress card has its own «Дальше»; Constitution blocks keep their
passed tests folded inside; catalogue «Начать» adds the program and opens it (after-add state drawn);
level locks state their reason; Premium's started topics come first; contrast fixed (amber-700,
#5b6067, emerald-700 on the soft button); title full width on phones.

v5 changes after round 4 (each raised by at least two of the three reviewers):
- **Constitution sample test.** It has no pass mark and locks nothing (`pass_threshold` 0 in
  `routers/practice.py`, so lesson 1 is open from the start). It now comes first, as «Начни здесь ·
  без проходного балла». Block 1 opens on the first visit, «нужно 0%» is never printed, and a closed
  block's lock names the block before it.
- **One layout for every program.** Practice programs with blocks now split «Осталось» and
  «Пройдено» like the others: blocks show only what is left, passed tests go to «Пройдено», weakest
  first, with their block name. Locked rows fold after two, inside blocks too.
- **No buttons in lists.** A practice row opens its test (whole row, chevron). A grammar topic's levels
  form one strip of tappable cells (name + ✓ 90% / 60% / не начат / lock), replacing the split button
  and the ▾ menu, so a topic takes one row on a phone. A legend under «Осталось» explains it. The next
  item keeps the tint and the «Дальше» kicker, but the page's one button is in the header.
- **Overview cards.** A whole in-progress card opens the program and names its next step. The hero
  holds the only «Продолжить». A completed row opens its program, and its review button says what the
  session draws from.
- **Adding a program.** The catalogue button says «Добавить» and lands on the program with «✓ … теперь
  в твоих программах». The practice hero buttons name what they add: «Тест по Конституции»,
  «Экзамен A2 — начать с чтения».
- **Premium.** The list shows the next topic, the started ones (tag «Начато») and two more; the rest
  fold under «Ещё N тем».
- **Copy.** «Повторение N» / "Review N" became «Контрольная N» / "Checkpoint N", since they clashed
  with the «Повторить» button. «Сдано» became «Пройдено». The catalogue legend was dropped.

## Out of scope
- Exercise screens (`GrammarTaskRunner`, practice `[id]` page).
- Статьи keeps the bento layout: it is a library to browse, not a path.
- A diagnostic / "jump ahead" test and an exam-date study plan (suggested by reviewers; product
  decisions for later).

## Decisions (user, 2026-10-15)
The user approved the design and took the proposed defaults, with one change: the compact hero on
phones is in scope.
- Delete the two `/programs` catalogue pages; «Другие программы» on the main page replaces them.
- Rename grammar level 3 to «Смешанный» / "Mixed" everywhere, including the exercise screens.
- «Пора повторить» keys on 7+ days since the program's last session.
- **Compact hero on phones on all five top-nav pages.** It uses the program header's layout: title
  full width, TAK beside the numbers instead of above the title, the button full width. Desktop is
  unchanged. Shared `BentoHero` (Грамматика, Практика, Статьи) and `ProgressStatCard` (Слова, Фразы),
  guarded by `design-system-parity.spec.ts`. Drawn in v5.2: at 375 px the overview hero is 114 px
  shorter, and «Продолжить» ends at about 500 px instead of about 615 px.
- Premium «Продолжить» goes to the next lesson in order.
- The Practice overview is not grouped by exam (the A2 group keeps «Добавить все части»).
- Backend in scope: a review session scoped to one program, and the latest result date per program
  (it drives «последний раз», «Пора повторить» and which program the hero continues).

## Notes for the build plan (code facts, 2026-10-15)
Next step: `/sdlc-brainstorm` → `plans/ideas/idea_66_<slug>.md` (none exists yet) →
`/sdlc-feature-analyst`, reusing #66. Facts already checked, so the next session needn't re-derive them:
- **Review session today:** `GET /grammar/remind/tasks` (`backend/routers/grammar*.py`, #26) samples up to
  10 tasks from passed «practice»-level (Mixed) lessons across *all* enrolled programs. It spends a daily
  session and returns 404 `no_passed_practice` before charging when nothing is eligible.
  `_program_lesson_ids()` already maps a program to its lessons, so program scoping is a filter. Practice
  has no review endpoint yet. Weakest-first ordering is new: the copy «сначала слабое» needs it, or the
  copy must drop it.
- **Heroes:** `BentoHero` (`app/dashboard/components/BentoParts.tsx`) serves Грамматика, Практика,
  Статьи. `ProgressStatCard` (`app/dashboard/components/ProgressStatCard.tsx`) serves Слова, Фразы.
  Both put TAK first on phones today (`order-first` / icon first in a `flex-col`).
- **Links to the `/programs` pages being deleted:** `GrammarOverview.tsx:230`,
  `app/dashboard/practice/page.tsx:142`, `app/dashboard/continue/page.tsx:128`.
- **Practice locks:** `routers/practice.py` ~line 305 — test N locked while test N-1's best score is below
  its `pass_threshold`. The Constitution sample test has threshold 0, so it locks nothing. Premium:
  `GET /practice/tests/{id}/exam` → 403 `premium_required`.
- **Specs to update:**
  - `specs/grammar.md`: remind scenarios at lines ~108–135, page scenarios at ~323–430
    (chips, featured card, topic cards; level name «Повторение»);
  - `specs/practice.md`: page scenarios at ~114–199;
  - `specs/articles.md`, `specs/lists.md`, `specs/phrases.md`: the compact hero.
- **Prototype source:** the published file `temp_files/prototypes/plan_66_grammar-practice-overview.html`
  is self-contained (data inlined) and can be edited directly. The session scratchpad that built it is
  gone with this session.

## Later (not in #66)
- The Constitution sample test as a readiness check against the real exam bar (a reviewer found
  14 of 20 in the 2009 rules; current rules unconfirmed). saunuole.lt does this.
- A passed block checkpoint opening the next block early.
- A «Ошибки (N)» pool: re-ask missed questions instead of retaking whole tests.

## Definition of Done (prototype — reduced, nothing ships)
- [x] Both languages: every view renders in RU and EN — screenshots.
- [x] Mobile at 375px: every view, no horizontal scroll — screenshots.
- [x] Desktop at 1280px: every view — screenshots.
- [x] Screenshots in `temp_files/screenshots/plan_66_grammar-practice-overview-prototype/`
      (`before/`, `v1/` 48, `v2/` 48, `v3/` 52, `v4/` 60, `v5/` 60, `v5.1/` 60, `v5.2/` 60 shots), looked at; no JS errors, no
      horizontal scroll.
- [x] Published as a private artifact and opened for the user.
- [x] Review loop: 5 rounds; no severity ≥ 3 left, T3 at 7 in two reports (fixed, not re-reviewed).
      STOP for the user's decision.
- Dropped for the prototype: autotests, CHANGELOG, component-library update, parity spec. They come
  back when the design goes through `/sdlc-feature-analyst` under the same number 66.
