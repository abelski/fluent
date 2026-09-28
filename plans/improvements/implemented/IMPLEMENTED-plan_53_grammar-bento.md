---
kind: feature
status: done
iteration: 3
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Plan 53 — Grammar page: hero → program chips → bento


## Context

Idea: `plans/ideas/idea_53_grammar-bento.md` (confirmed). Prototype: `temp_files/prototypes/plan_53_grammar-bento.html`.

Today `/dashboard/grammar` (`frontend/app/dashboard/grammar/page.tsx`, 675 lines) renders `PageShell` →
title → `ProgressStatCard` hero → one accordion per enrolled program → one `SubcategoryGroup` accordion per
topic → lesson tiles. With no enrolled program it shows one line + a link to `/dashboard/grammar/programs`.
We replace only the **lesson-list branch** (`activeLesson === null`) with: hero card → program chips →
bento (featured card + stacked program cards) → topic cards. Exercise, done and blocked screens stay as is.

Facts found while exploring that change the idea:
- **No backend change needed.** Noun-case lessons already return a Lithuanian `title` from
  `backend/data/grammar/lessons.json` (e.g. `"Kilmininkas Vns."`, built in `get_lessons()` in
  `backend/grammar_service.py:267`), and the RU/EN case name is in `lesson.rules[0].name_ru / name_en`.
  So the idea's `title_lt` field is dropped: heading = `lesson.title`, sub-heading = `rules[0].name_ru|name_en`.
  Verb lessons have RU `title` + `title_en` and no LT name → heading = normal title, no sub-heading.
- **Guest enroll** → `router.push('/login')`, same as `grammar/programs/page.tsx:47`. OAuth always lands on
  `/dashboard` (`backend/auth.py`); returning to grammar would need an auth change — user chose not to.
- Reusable pieces: `getGrammarPrograms / enrollGrammarProgram / unenrollGrammarProgram` (`lib/api.ts:1170-1200`),
  `filterLessonsForProgram` + `getCaseGroups` (page.tsx), `PageMascot`, `PageShell`, `TakChevron`, `REMIND_LESSON`
  + `canRemind` logic (plan #26), lists' remove-program confirm dialog markup (`lists/page.tsx:817-850`) and its
  copy `tr.lists.removeProgramTitle/Body/Confirm`, `tr.common.cancel`.
- ~15 Playwright specs reach a lesson via `subcategory-toggle` → `.grid button`; `navigation.spec.ts`,
  `grammar-programs.spec.ts`, `grammar-premium-lesson-order.spec.ts` also use `category-toggle-program-*`,
  `unenroll-button`, `lesson-locked(-upsell)`. They must be migrated.

Model/effort: opus/high — a large page rewrite with design judgement plus a ~15-spec test migration; no
auth/DB risk but a lot of surface to keep consistent.

## Goals
- Grammar lesson list laid out as hero → chips → bento → topic cards, in Fluent tokens.
- One click from topic card level to lesson start (no accordions).
- Page works as onboarding: no programs → preview + enroll in place; guests see the same and go to `/login` on enroll.
- Unenroll from the page with a confirm dialog.
- RU + EN, desktop + 375px.

## Non-Goals
- Other 4 top-nav pages (keep `ProgressStatCard`), `/dashboard/grammar/programs`, exercise/done/blocked screens.
- Any backend or DB change; `title_lt`; LT names for programs or verb tenses.
- Return-to-page after login; "last studied" ordering; pastel gradients / 3D art.

## Requirements

1. **Hero card** (grammar only, new — recorded as a deliberate deviation): title `tr.grammar.title`, subtitle,
   stat row `N` + badge `из M` + `уроков пройдено`, 6px progress bar (track `bg-gray-100` + `bg-emerald-600` fill — same as `ProgressStatCard`'s `TRACK`;
   `track` is not a Tailwind token), buttons «Продолжить ›» (starts the next lesson) and «Напомни, что я забыл»
   (plan #26 rule: disabled + `remindHint` until a practice-level lesson is passed in an enrolled program).
   Right side: static declension sample (namas/namo/namui/namą, endings `text-emerald-600`, case letters V./K./N./G.)
   and `PageMascot phrase="Mokomės!"` at the standard 128px. Below 860px the sample is hidden.
   `tr.grammar.charactersNote` (Jonas/Ona note, today under the title) stays as a small `text-muted` line under the subtitle.
   - No programs (incl. guest): stat `0`, no `из M` badge, empty bar, primary button «Начать с падежей» / «Start
     with cases» enrolls the first public `cases` program; remind hidden.
   - Nothing left to continue: «Продолжить» hidden.
   - M = lesson count across enrolled programs; N = passed (`best_score_pct > 0.75`) among them.
2. **Chips**: «Все N» + one chip per public program (lesson count via `filterLessonsForProgram`), a 6px emerald
   dot on enrolled ones, active chip `bg-ink text-white`, «Все программы ›» link (`text-emerald-600`) to
   `/dashboard/grammar/programs`. «Все» counts enrolled lessons (all public when none enrolled). Chips wrap on mobile.
3. **Featured card** (`border border-line rounded-[14px]`, no shadow):
   - Enrolled program selected, or «Все» with ≥1 enrolled: next lesson = first lesson (in list order) of the
     first enrolled program (in `programs` order) with `!is_locked && !(best_score_pct > 0.75)`. Shows kicker
     «Продолжить отсюда · <program>», heading (`text-[32px] font-bold tracking-[-0.02em] text-ink`) = lesson
     title (LT for nouns), sub-heading = case name RU/EN (nouns only), meta «<level> · урок i из n · N заданий»,
     level chips of that topic (display only — the single «Начать урок ›» is the action here; the
     idea's "level buttons" live on topic cards; recorded in Decisions), «Начать урок ›» button, «k/n уроков».
     The hero's «Продолжить ›» starts this same lesson.
   - Not-enrolled program selected, or nothing left to continue: preview of a program (the selected one; for «Все»
     the first public program the user isn't enrolled in): kicker «Программа · <difficulty>», heading = title,
     description, «N уроков · M тем». No enroll button when the hero already offers «Начать с падежей» for the
     same program (no-programs state); otherwise «Добавить».
   - Everything enrolled and nothing left: completion summary; if locked lessons remain → «Дальше — с Premium»
     link to `/pricing`.
4. **Stack** (right column, below featured on mobile): every other public program — enrolled: title, `d/n`,
   progress bar, «Открыть ›» (selects its chip); not enrolled: title, `n уроков`, description, «Добавить».
5. **Topic cards** (`grid` 3 → 2 cols at 1200px → 1 col at 860px) always show the program of the featured
   card (so under «Все» they follow the featured program): heading «Темы: <program>» (or «Что внутри:»
   when not enrolled) + lesson count + «Убрать» (enrolled only; opens confirm dialog; `data-testid="unenroll-button"`).
   Each card: topic title (nouns: LT `title` as served, e.g. «Kilmininkas Vns.», + case name
   `lang==='en' ? rules[0]?.name_en ?? rules[0]?.name_ru : rules[0]?.name_ru`, omitted if no rule; verbs: `title_en` in EN
   with RU fallback, as page.tsx:94 does today), `passed/total` (emerald when
   all passed), article link (existing `↗` link, kept), admin draft/testing badge (kept), and one **level button** per
   lesson (`data-testid="level-button"`, locked → `data-testid="lesson-locked"`, disabled, with the existing
   `lesson-locked-upsell` link under it). Level label shows `✓` when passed or best `%` when attempted; levels use
   the existing `LEVEL_STYLES`. `min-h-11` (44px) at <860px. Preview mode: no scores, buttons disabled.
6. **Enroll**: logged in → `enrollGrammarProgram(id)`, mark enrolled, select that chip, refetch lessons (locks
   change on enroll). Guest → `router.push('/login')`. **Unenroll**: confirm dialog (copy the lists markup, swap
   `bg-red-500` for `bg-destructive`; no shared component for two uses) → `unenrollGrammarProgram(id)`.
   **Error**: if enroll/unenroll fails, show one line `tr.grammar.actionFailed` in `text-destructive` under the
   chips row (today it is only `console.error`); cleared on next action.
7. Existing test ids kept where the element still exists: `stats-card-grammar` (hero), `browse-programs-link`,
   `unenroll-button`, `lesson-locked`, `lesson-locked-upsell`, `category-program-<id>` (chip).
8. All strings through `tr.grammar.*` in `frontend/lib/i18n/ru.ts`, `en.ts`, `types.ts`.

### Standing constraints
- All validation must be server-side (never frontend-only). Enroll/unenroll/lock/quota rules are already server-side; no new client-side gate.
- Read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first; named tokens only (`ink`, `muted`, `line`, `faint`, `emerald-600/700`, `destructive`…); run `frontend/tests/design-system-parity.spec.ts`.
- Add autotest coverage and run the suites as part of Validation.

## Implementation

- [x] 1. `plans/improvements/active/plan_53_grammar-bento-prototype.md` → move to `plans/improvements/implemented/PROTOTYPE-plan_53_grammar-bento-prototype.md` (superseded by this plan; avoids two active plan_53 files). Update the path in the idea file.
- [x] 2. `plans/ideas/idea_53_grammar-bento.md` — Proposed spec: remove the `title_lt` API scenario (heading uses existing `title`, e.g. «Kilmininkas Vns.» / «Skaičiai: …», + `rules[0].name_*`); change the guest scenario to "sent to /login" (no return); featured card shows level chips + one «Начать урок» (buttons are on topic cards); under «Все» topics follow the featured program; add the enroll/unenroll error line. Add each to Decisions. (`specs/grammar.md` itself is updated at close-out by `sdlc-spec-writer`, Phase 6 step 0.)
- [x] 3. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — new `tr.grammar` keys: `emptySubtitle`, `startWithCases`, `continueHere`, `lessonOf` (`урок {i} из {n}`), `startLesson`, `open`, `add`, `program`, `insideTitle`, `topicsTitle`, `topicsCount` (plural), `difficulty` {1,2,3}, `allChip`, `premiumNext`, `programDone`, `declHouse`. Reuse existing keys where they exist (`statsPassed`, `statsOf`, `remindHint`, `lessonsCount`, `tasksCount`, `levels`, `unenrollBtn`, `browseProgramsLink`, `stats.remindForgotten`, `lists.removeProgram*`, `common.cancel`).
- [x] 4. `frontend/app/dashboard/components/GrammarOverview.tsx` (new) — presentational: `GrammarHero`, `ProgramChips`, `FeaturedCard`, `ProgramStack`, `TopicCard`, plus a local (not exported) `pickNext`. Props only; no fetching. Tokens from the component library.
- [x] 5. `frontend/app/dashboard/grammar/page.tsx` — lesson-list branch: load programs for guests too (drop the enrolled-only empty state), compute per-program lessons with existing `filterLessonsForProgram`, `selected` chip state (default «Все»), enroll/unenroll handlers (guest → `/login`), confirm-dialog state, render `GrammarOverview` pieces inside `PageShell`. Remove `GrammarStatsBar`, `SubcategoryGroup`, `openCategories`. Keep `startLesson`, `REMIND_LESSON`, `canRemind`, blocked/done/exercise branches untouched.
- [x] 6. Migrate existing Playwright specs to the new markup: replace the `subcategory-toggle` click + `.grid button` pattern with `getByTestId('level-button')` (or `lesson-locked`) in the ~15 affected specs (`grep -rlE "subcategory-toggle|category-toggle" frontend/tests`); `navigation.spec.ts` category-toggle tests → chip `category-program-<id>` selects program; `grammar-programs.spec.ts` unenroll → click `unenroll-button`, confirm dialog, assert the no-programs hero («Начать с падежей», stat `0`) — not `browse-programs-link`, which is now always visible (lines 57, 96); `issue-104-grammar-titles-translated.spec.ts:41` → scope `getByText('Lithuanian Cases')` to the chip `category-program-1` (the title now appears in several places). Assertions about behaviour stay; only selectors/steps change.
- [x] 7. `frontend/tests/grammar-bento.spec.ts` (new, mocked API incl. `/api/billing/config`) — one test per Proposed-spec scenario: no-programs hero (0, no badge, «Начать с падежей», no remind); enroll from hero calls `POST /api/me/grammar-programs/<cases id>` and switches to enrolled; guest click → `/login`; chips (count, dot, «Все» count, selection switches featured + topics); featured next-lesson pick incl. skipping locked; LT heading + case name for a noun lesson, plain title for verbs; nothing-left → other program preview, and all-enrolled → summary with `/pricing` link; level button starts lesson (tasks request fired), locked disabled + upsell, label `✓` when passed and `%` when attempted; level button ≥44px tall at 375px; hero «Продолжить ›» fires the same lesson's tasks request as the featured card; nothing-left hides «Продолжить»; no-programs stack cards show description + «Добавить», and stack «Добавить» fires `POST`; preview topic cards show no scores; unenroll confirm → `DELETE` fired; enroll `500` → error line visible; EN copy on one state.
- [x] 8. `frontend/tests/plan53-screenshots.spec.ts` (new) — mocked API; saves to `temp_files/screenshots/plan_53_grammar-bento/`: states `no-programs`, `some-programs`, `all-programs`, `nothing-left`, `enroll-error` × RU/EN × 1280/375; asserts `scrollWidth <= viewport` for each.
- [x] 9. `documentation/design system/Component Library (as-built).html` — new "Grammar hero / chips / bento" section (hero card, chips with dot, featured card, stack card, topic card with level buttons) + a "Deliberate deviations" row: grammar hero is not `ProgressStatCard` (declension sample + in-place enroll), the title lives inside the hero card (a third page ordering), and «Все программы ›» sits in the chips row instead of the page end — with why. `documentation/IMPLEMENTATION.md` — map these to `GrammarOverview.tsx`.
- [x] 10. `documentation/grammar-bento.md` (new) — decisions: no `title_lt` (title already LT), guest → `/login` without return (auth always lands on /dashboard), next-lesson rule, grammar-only hero deviation.

## Validation

- [x] Backend untouched but suite still green: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Static export builds: `cd frontend && npm run build`
- [x] New spec passes: `cd frontend && npx playwright test tests/grammar-bento.spec.ts --reporter=list`
- [x] Migrated grammar specs pass: `cd frontend && npx playwright test tests/navigation.spec.ts tests/grammar-programs.spec.ts tests/grammar-premium-lesson-order.spec.ts tests/grammar-remind.spec.ts --reporter=list`
- [x] Parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots: `cd frontend && npx playwright test tests/plan53-screenshots.spec.ts --reporter=list`, then open every shot and check: RU and EN, 1280 and 375, no overflow, no clipped text, one TAK per screen, error line readable.
- [x] Full suite: `cd frontend && npx playwright test --reporter=list`
- [ ] Manual local run: `/dashboard/grammar` logged out and logged in; enroll, start lesson from a level button, finish, back to list shows updated score; unenroll with confirm. Header/nav/footer/login intact vs production.
- [ ] News post via /news-writer (after merge, if user wants).

## Review

- [x] Code review passed (round 3)
- note: documented the `caseName()` parenthetical-stripping gotcha in `documentation/grammar-bento.md`.

## Definition of Done

User-facing change — all three checks are required: **both languages (RU + EN)**, **mobile at 375px**,
**screenshots proving each** (in `temp_files/screenshots/plan_53_grammar-bento/`, reviewed).

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list
cd frontend && npx playwright test tests/grammar-bento.spec.ts tests/plan53-screenshots.spec.ts --reporter=list
cd frontend && npx playwright test --reporter=list
```

UAT section skipped on purpose: the states need a mocked API (local runs share the prod DB, so a real
enroll by a black-box tester would write to production).

## Cold review (fixed / rejected)
Fixed: `bg-track` token doesn't exist → `bg-gray-100` like ProgressStatCard; «Все» now defines which topics
show (featured program's); featured card's display-only levels recorded as a decision; missing tests added
(hero Continue, nothing-left hides it, stack «Добавить», ✓/%, preview no scores); `charactersNote` kept;
`issue-104` spec and `browse-programs-link` checks added to migration; deviation row now covers page order and
link position; sub-heading null-safe fallback; verbs keep `title_en`; enroll/unenroll error line + test + shot;
`npm run build` added; `pickNext` not exported; guest screenshot dropped; dialog uses `bg-destructive`, no shared
component; `specs/grammar.md` update assigned to close-out spec-writer.
Rejected: folding `documentation/grammar-bento.md` into the idea — CLAUDE.md asks for architecture decisions
in `documentation/`, where future sessions look; the idea file moves to `implemented/` and is not documentation.
