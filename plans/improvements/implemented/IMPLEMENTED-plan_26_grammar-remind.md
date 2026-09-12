---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# #26 — Grammar «Напомнить» (mixed review of passed «Повторение» lessons)

## Context

`/dashboard/grammar` has no way to refresh old material. Each case/verb topic has 3 levels:
`basic`, `advanced`, `practice` (UI label «Повторение», `frontend/lib/i18n/ru.ts` `grammar.levels`).
The user wants a remind button that builds one short run from tasks of every «Повторение» lesson
they already passed.

Answers from the user:
- 10 tasks per run.
- Source: passed `practice` lessons **in programs the user is enrolled in** (cases + verbs).
- Counts like a normal lesson: spends 1 daily session (free users) and counts toward streak.
- No passed practice lesson yet → button shown disabled with a hint.

What exists and gets reused:
- Task generators: `get_lesson_tasks` / `get_verb_lesson_tasks` in `backend/grammar_service.py`
  (practice level already strips the stem → full-word answer; pools are cached).
- Passed-lesson query pattern: `_grammar_phase` in `backend/routers/continue_session.py`.
- Enrollment: `cache.enrollment_ids(...)`, `_grammar_programs(session)` in `backend/routers/grammar.py`.
- Quota: `_quota_check_and_increment` (`backend/quota.py`), run after eligibility so a 404 costs nothing.
- Result save: existing `POST /api/grammar/lessons/{id}/results` + `saveGrammarLessonResult`
  (`frontend/lib/api.ts`). Streak/calendar read `GrammarLessonResult.created_at`, so saving a row is
  what makes the run count toward streak.
- UI: hero `ProgressStatCard` already carries «Напомни что я мог забыть» on Слова
  (`StatsBar.tsx`, `tr.stats.remindForgotten`). Grammar uses the same slot and copy.
- Runner: `GrammarTaskRunner` switches on `task.type` per task, so noun + verb tasks can mix.
  `level='practice'` hides rules/hints, so no per-task rules are needed.
- Page state: `grammar/page.tsx` already has blocked (403/429), exercise and done screens. A remind
  run is a pseudo-lesson through the same `startLesson` flow — no new route.

Design decision — **sentinel lesson id `REMIND_LESSON_ID = 0`** for the stored result (LESSON_CONFIG
starts at 1). Streak and activity calendar pick it up for free. Cost: 3 readers that count
"lessons passed" must skip it (`words.py` stats → feeds achievements, `admin.py` user stats,
`grammar.py` `/grammar/progress`). Rejected: a new table — needs a model, 2 streak unions, and a
user-delete cascade in `admin.py` (SQLite tests don't enforce FKs, so a missed cascade would hide).

Model rationale: `sonnet`/`medium` — patterned change reusing existing generators, quota and save
flow; the only subtle part (sentinel filters) is spelled out below and covered by a test.

## Goals

- «Напомни что я мог забыть» button in the Грамматика hero card.
- Click → 10 mixed tasks from passed «Повторение» lessons of enrolled programs → done screen.
- Run spends a daily session (free users) and counts toward streak.
- Disabled button + hint when no practice lesson is passed yet.

## Non-Goals

- No spaced repetition / weakest-lesson weighting — random spread only.
- No new route, no new table, no user setting for task count.
- No change to lesson lock, best scores, or "lessons passed" counts.
- Not added to continue-session.

## Requirements

- `GET /api/grammar/remind/tasks`
  - 401 without auth.
  - Eligible = lessons with `level == "practice"`, user has a `GrammarLessonResult.passed` row,
    lesson belongs to an enrolled program. Program → lessons mapping mirrors frontend
    `filterLessonsForProgram`: `program_type` `verbs`/`verb_cases` → `get_verb_lessons(session, program_type)`;
    otherwise noun lessons from `get_lessons(session, is_admin=user.is_admin)`, filtered by
    `lesson_filter` case groups (`CASE_INFO[c][1]`); null filter = all noun lessons.
  - None eligible → 404 `{"code": "no_passed_practice"}`, **before** quota (no session spent).
  - Then `_quota_check_and_increment` (429 at limit for free users).
  - Shuffle eligible, take up to 10 lessons, take `ceil(10 / n)` random tasks from each, flatten,
    shuffle, return first 10 as a plain list (same shape as lesson task endpoints).
- Result: frontend posts to `POST /api/grammar/lessons/0/results` (existing endpoint, existing
  score validation). Row counts for streak/calendar, never for "lessons passed".
- Button disabled state is display-only; the server 404 is the real gate.
- Hero rule kept: `ProgressStatCard` hides actions when `count == 0`. So a user with zero passed
  lessons sees no button; disabled + hint shows once ≥1 lesson is passed but no practice lesson.

### Standing constraints
- All validation must be server-side (never frontend-only).
- This plan touches markup and a shared component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after the `ProgressStatCard` change.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/grammar_service.py` — add `REMIND_LESSON_ID = 0` and `REMIND_TASK_COUNT = 10` constants with a one-line comment on why 0 is a sentinel.
- [x] 2. `backend/routers/grammar.py` — add `GET /grammar/remind/tasks` per Requirements (auth → eligibility → 404 → quota → sample). Small local helper for program → lesson ids. Reuse `_grammar_programs`, `cache.enrollment_ids`, `get_lessons`, `get_verb_lessons`, `get_lesson_tasks`, `get_verb_lesson_tasks`, `_quota_check_and_increment`. Also skip `REMIND_LESSON_ID` in `GET /grammar/progress`.
- [x] 3. `backend/routers/words.py` — `get_stats`: add `GrammarLessonResult.lesson_id != REMIND_LESSON_ID` to the `lesson_best` subquery only. Streak and `/me/activity-calendar` unchanged (they should count it).
- [x] 4. `backend/routers/admin.py` — user stats (~line 165): skip `REMIND_LESSON_ID` when counting `grammar_lessons_passed`.
- [x] 5. `frontend/app/dashboard/components/ProgressStatCard.tsx` — `primaryAction` becomes `{ label; href?; onClick?; disabled?; hint? }`. `href` → `Link` (unchanged); `onClick` → `<button type="button">` with same classes; `disabled` → `disabled` attr + `opacity-50 cursor-not-allowed`; `hint` → `<p className="text-xs text-faint mt-1.5">` under the button row. Existing callers untouched.
- [x] 6. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — add `grammar.remindHint` (ru: «Пройдите хотя бы один урок «Повторение», чтобы открыть», en: "Pass at least one Practice lesson to unlock"). Button label reuses `tr.stats.remindForgotten`.
- [x] 7. `frontend/app/dashboard/grammar/page.tsx`:
  - `const REMIND_LESSON: Lesson = { id: 0, title: '', level: 'practice', task_count: 10, is_locked: false, best_score_pct: null }`.
  - `startLesson`: when `lesson.id === 0` fetch `/api/grammar/remind/tasks`; existing 403/429/`!ok` handling stays.
  - `canRemind` = some enrolled program's `filterLessonsForProgram(...)` has `level === 'practice' && best_score_pct > 0.75`.
  - `GrammarStatsBar` gets `primaryAction={{ label: tr.stats.remindForgotten, onClick: () => startLesson(REMIND_LESSON), disabled: !canRemind, hint: canRemind ? undefined : tr.grammar.remindHint }}`.
  - Done screen: hide the pass/fail "unlock next lesson" banner when `activeLesson.id === 0` (`nextLesson` is already null there). «Повторить» reruns remind; result saves via existing `postResult`.
- [x] 8. `backend/tests/test_grammar_remind.py` — reuse helpers style from `test_continue_session.py` (`_user`, `_enroll_grammar`, `_publish_lesson_case`, direct `GrammarLessonResult` inserts). Cases:
  - no auth → 401;
  - enrolled, no passed practice lesson (only basic lesson 1 passed) → 404 and `sessions_today` unchanged;
  - passed practice lesson 3 in enrolled program → 200, 10 tasks, `sessions_today` +1;
  - passed practice lesson 3 but program filter excludes its case group (or not enrolled) → 404;
  - free user at `DAILY_LIMIT` → 429;
  - `POST /api/grammar/lessons/0/results` (10/10) → `/api/me/stats` `grammar_lessons_passed` unchanged, `streak >= 1`.
- [x] 9. `frontend/tests/grammar-remind.spec.ts` — mocks like `grammar-programs.spec.ts` (fake token, `/api/admin/grammar/config`, `/api/grammar-programs`, `/api/grammar/lessons`, `/api/grammar/verb-lessons*` → `[]`):
  - passed practice lesson → remind button enabled → click → mocked `/api/grammar/remind/tasks` returns sentence tasks → exercise screen renders;
  - practice lesson not passed (basic passed) → button disabled, hint visible.
- [x] 10. Docs: new `documentation/grammar-remind.md` (eligibility rule, sentinel id decision + the 3 readers that must skip it, why not a new table); component library "ProgressStatCard" section — note `onClick`/`disabled`/`hint` action; `documentation/CHANGELOG.md` — append `| 26 | <date> | … |`.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q tests/test_grammar_remind.py`
- [x] Backend regression: `cd backend && .venv/bin/python -m pytest -q tests/test_continue_session.py tests/test_grammar_premium_lock.py tests/test_stats_query_efficiency.py`
- [x] Type check: `cd frontend && npx tsc --noEmit`
- [x] Playwright autotest added: `cd frontend && npx playwright test tests/grammar-remind.spec.ts --reporter=list`
- [x] Shared shell: `cd frontend && npx playwright test tests/design-system-parity.spec.ts tests/grammar-programs.spec.ts tests/grammar-premium-lesson-order.spec.ts --reporter=list`
- [ ] Smoke on :8000: user with a passed «Повторение» lesson → button → 10 tasks → done screen; `/api/me/stats` passed count unchanged, streak counts today
- [ ] Edge: user with only basic lessons passed → button disabled + hint; direct `GET /api/grammar/remind/tasks` → 404, no session spent
- [ ] News post written and published via /news-writer

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/grammar-remind.spec.ts tests/design-system-parity.spec.ts tests/grammar-programs.spec.ts tests/grammar-premium-lesson-order.spec.ts --reporter=list
```
