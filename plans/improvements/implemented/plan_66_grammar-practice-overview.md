---
kind: feature
status: done
iteration: 2
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
uat_rounds: 0
max_uat_rounds: 3
---

# Plan 66 — Grammar & Practice overview pages (build)

> The prototype plan `plan_66_grammar-practice-overview-prototype.md` stays beside this file as the design record.

## Context
Idea: `plans/ideas/idea_66_grammar-practice-overview.md`. Design, measurements and 5 review rounds:
`plans/improvements/active/plan_66_grammar-practice-overview-prototype.md`. Prototype v5.2:
`temp_files/prototypes/plan_66_grammar-practice-overview.html`.

Today: Грамматика/Практика overview = chips + featured card + stack + topic grid; separate
`/programs` catalogue pages. Code facts: `frontend/app/dashboard/grammar/page.tsx` (453 lines, lesson
runner + list), `components/GrammarOverview.tsx` (hero/chips/featured/stack/topics),
`practice/page.tsx` (190), `practice/programs/page.tsx`, `grammar/programs/page.tsx`,
`components/BentoParts.tsx` (`BentoHero`), `components/ProgressStatCard.tsx`. Backend:
`routers/grammar.py` (`remind_tasks` ~283, `_program_lesson_ids` ~263, `/grammar-programs` ~344),
`routers/practice.py` (`/me/practice-categories` ~151, `PracticeExamResult`).

Model: opus/high — many coupled UI states, one migration, shared-shell change across 5 pages.

## Goals
- Overview pages: hero (one «Продолжить»), «В процессе», «Завершённые», «Другие программы».
- Program page `?program=<id>` with «Осталось N» and folded «Пройдено N».
- One status wording on both pages; locks state their reason.
- Compact hero on phones on all 5 top-nav pages.
- Backend: `last_result_at` per program/category, `program_id` + weakest-first on grammar remind.
- Titles/data fixes and renames from the prototype plan.

## Non-Goals
Exercise screens; Статьи layout; diagnostic test; exam-date plan; Constitution readiness check;
practice review endpoint (button reopens the weakest passed test); early block unlock; «Ошибки» pool.

## Requirements
Behavior = the idea's Proposed spec + prototype plan «Converged design (v5.1)» + «Decisions».
Decisions made here:
- `last_result_at` for grammar = max `GrammarLessonResult.created_at` over the program's real lessons
  (remind sentinel lesson 0 excluded — it can't be attributed to a program). Practice = max
  `PracticeExamResult.created_at` over the category's tests. Computed from the user's own results in
  one query each (no per-row queries), never cached (progress).
- Grammar remind: optional `program_id`; must be enrolled else 404/403 like other program endpoints.
  With it, eligible lessons are ordered by best score ascending (weakest first) instead of shuffled;
  without it behavior is unchanged. 404 `no_passed_practice` still precedes quota.
- Constitution `title_lt`: new nullable column on `practice_test`; `title_ru`/`title_en` hold UI
  language titles. Reading tests: `title_en` real English, `title_lt` the Lithuanian with diacritics.
- Data fixes ship as an idempotent script `backend/scripts/fix_practice_titles_66.py` (`--dry-run`);
  running it on prod is the user's step (reminder in `plans/reminders.md`).

### Standing constraints
- All validation must be server-side (never frontend-only).
- Read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md`
  first; named tokens only; run `frontend/tests/design-system-parity.spec.ts` after shell/token changes.
- Add autotests and run the relevant suites.

## Implementation
Backend
- [x] 1. `backend/models.py` + Alembic revision — `practice_test.title_lt` nullable str; admin
      create/update/export/import in `routers/practice.py` + admin page carry it (server-validated length).
- [x] 2. `backend/routers/grammar.py` — `/grammar-programs` adds `last_result_at` (authenticated only,
      one results query mapped through `_program_lesson_ids`); `remind_tasks` gains `program_id`
      (enrolled check, scoped lessons, weakest-first).
- [x] 3. `backend/routers/practice.py` — `/me/practice-categories` adds `last_result_at`; test list
      returns `title_lt`.
- [x] 4. `backend/scripts/fix_practice_titles_66.py` — Constitution UI-language titles + `title_lt`,
      reading titles (RU/EN/LT), reading category description RU/EN; fix Verbs «12 уроков» → 20
      (program description). `--dry-run`. Add reminder line for the prod run.
- [x] 5. Rename level 3 «Повторение»/"Practice" → «Смешанный»/"Mixed" in lesson-level labels (grep
      `Повторение` in `backend/` i18n and `frontend/` incl. `GrammarTaskRunner`); «Напомни что я мог
      забыть» → «Повторить пройденное»; grammar hero subtitle.
Frontend
- [x] 6. `frontend/lib/api.ts` — types for `last_result_at`, `getGrammarRemindTasks(programId)`.
- [x] 7. New shared `components/ProgramOverview.tsx` (cards for «В процессе», rows for «Завершённые»,
      catalogue cards, status-label helper: «нужно 75%» / amber «лучший 45%» / green «✓ 90%» / lock +
      reason, «Пора повторить» = ≥ 7 days) used by both pages.
- [x] 8. `components/GrammarOverview.tsx` + `grammar/page.tsx` — replace chips/featured/stack/topics with
      overview + program page (`?program=`): header with ⋯ menu, «Перейти:» chips, «Осталось N»,
      level-cell strip + legend, locked tail fold, Premium variant, «Пройдено N» folded, review button
      calling remind with `program_id`.
- [x] 9. `practice/page.tsx` — overview + program page; whole-row test links; Constitution blocks and
      sample test first; final exam pinned; «Повторить» opens weakest passed test; «Добавить все части (5)»
      for A2; new-user hero «Начать с Конституции»/«Начать с чтения (A2)».
- [x] 10. Delete `grammar/programs/page.tsx`, `practice/programs/page.tsx`; repoint links in
      `GrammarOverview.tsx:230`, `practice/page.tsx:142`, `continue/page.tsx:128`; drop from sitemap/
      nav/tests if referenced.
- [x] 11. Compact phone hero: `BentoHero` (`BentoParts.tsx`) and `ProgressStatCard.tsx` — title full
      width, TAK beside the numbers (`order` change), full-width button; desktop untouched.
- [x] 12. `frontend/tailwind.config.js` — info-text token (`#5b6067`) name e.g. `ink-soft`; use it.
- [x] 13. Docs — component library (hero compact, overview cards, status wording, new token, deviations
      table), `documentation/IMPLEMENTATION.md`, new `documentation/overview-pages.md` (why program
      page lives on `?program=` — static export; why `last_result_at` excludes remind).
- [x] 14. Specs: `specs/grammar.md` (remind ~108–135, page ~323–430), `specs/practice.md` (~114–199),
      `specs/articles.md`, `specs/lists.md`, `specs/phrases.md` — per the idea's Proposed spec.
- [x] 15. i18n: every new string RU + EN (project's `useT` dictionaries).

## Review
- [x] Code review passed (round 3)
- note: `admin_import_test` accepts non-string `title_lt` via `str()` (harmless).
- note: `READING_TITLES` in `fix_practice_titles_66.py` is hand-restored LT text; user checks before `--apply` on prod.

## Validation
- [x] Backend: `backend/tests/test_grammar_remind.py` extended (program scope, weakest-first, not
      enrolled, unchanged without param); new `test_overview_last_result.py` (grammar + practice
      `last_result_at`, none → null, remind excluded); title-script test (idempotent, dry-run).
- [x] Playwright: update `grammar-bento`, `grammar-programs`, `grammar-remind`, `practice-bento`,
      `practice-enrollment`, `practice-progress` specs; new `overview-pages.spec.ts` (states: new,
      in progress free, Premium, finished + «Пора повторить», locked reason tap, weakest-test retake).
- [x] `design-system-parity.spec.ts`: add compact-hero-at-375 assertion for all 5 pages.
- [x] Screenshots in `temp_files/screenshots/plan_66_grammar-practice-overview/`: every state, RU + EN,
      1280 px + 375 px, API mocked (incl. `/api/billing/config`), looked at; no horizontal scroll.
- [x] Compare with production: nav, header, footer, login intact.
- [ ] Restart local server (one per side), smoke both pages.
  - note: frontend rebuilt (`out/`, served by uvicorn) and both pages smoke-tested as a guest against
    the running backend (hero + catalogue, no page errors). The uvicorn restart is NOT done: the new
    `PracticeTest` model selects `title_lt`, which the shared Neon DB lacks until migration
    `a9b0c1d2e3f4` is applied (user's step) — restarting now would 500 every practice endpoint.

## Definition of Done
```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
User-facing checks (manual, with evidence): both languages RU + EN, mobile 375 px, screenshots
proving each; Alembic migration noted for the user to run on prod.

## UAT verification
**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/grammar` and
`/dashboard/practice` with a signed-in test user (no code access needed).
**Scenarios:** 1) New user opens each page. 2) Enrol one program, pass nothing, open its program page.
3) User with one finished program opens the page. 4) Free user taps a locked row. 5) Phone width 375 px.
**Acceptance criteria:**
- [ ] New user sees one start button and a catalogue, nothing else to decide.
- [ ] In-progress program shows its next step as text; only one «Продолжить» on the page.
- [ ] Finished program is a single row with a review action, not a card.
- [ ] Tapping a locked row shows why it is locked.
- [ ] At 375 px the main button is visible without scrolling past the hero; no sideways scroll.

## Cold review
Skipped at the user's request (2026-10-15): approved as written; implement in a new session. Branch `feat/66-grammar-practice-overview` is created at implementation start.
