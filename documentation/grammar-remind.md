# Grammar «Напомни что я мог забыть» (#26)

`GET /api/grammar/remind/tasks` — a mixed 10-task review run built from every
«Повторение» (practice-level) lesson the user has already passed, across the
grammar programs (cases + verbs) they're enrolled in. Started from the
Грамматика hero card (`ProgressStatCard`'s `primaryAction`) via the same
`startLesson` flow the lesson list uses, and saved through the existing
`POST /grammar/lessons/{id}/results`.

## Eligibility rule

A lesson id is eligible when **all** of:

1. `level == "practice"` (LESSON_CONFIG for noun lessons, VERB_LESSON_CONFIG for
   verb lessons — practice is the only level with no rules shown and a
   full-word answer).
2. The user has a `GrammarLessonResult` row for it with `passed == True`.
3. It belongs to a `GrammarProgram` the user is enrolled in
   (`UserGrammarProgram`), via `_program_lesson_ids()` in
   `backend/routers/grammar.py` — which mirrors the frontend's own
   `filterLessonsForProgram` (`grammar/page.tsx`) exactly: `program_type` in
   `("verbs", "verb_cases")` → `get_verb_lessons(session, program_type=...)`;
   otherwise noun lessons from `get_lessons()`, filtered by the program's
   `lesson_filter` case groups (`CASE_INFO[c][1]`), or every noun lesson when
   `lesson_filter` is `NULL`.

No eligible lesson → `404 {"code": "no_passed_practice"}`, checked **before**
`_quota_check_and_increment` — asking and getting told "nothing yet" costs the
user nothing. Otherwise the endpoint behaves like any other lesson-tasks
endpoint for quota purposes (429 at the daily limit for free users).

Sampling: shuffle the eligible lesson ids, take up to 10, pull
`ceil(10 / n)` random tasks from each (`get_lesson_tasks` / `get_verb_lesson_tasks`
— the same generators every other lesson endpoint uses), flatten, shuffle
again, return the first 10.

## Sentinel id decision

The result is saved as a normal `GrammarLessonResult` row, but against
`REMIND_LESSON_ID = 0` (`backend/grammar_service.py`) — never a real
`LESSON_CONFIG`/`VERB_LESSON_CONFIG` entry, so `0` is free (real ids start at
1). This makes the *existing* `POST /grammar/lessons/{id}/results` handle
saving with zero new code, and it makes the run count toward the streak and
the 28-day activity calendar for free, since both are keyed off
`GrammarLessonResult.created_at` with no per-lesson filtering.

The cost: three readers that count "lessons passed" must skip the sentinel
explicitly, or a remind run would look like passing a phantom lesson:

- `backend/routers/words.py` `get_stats()` — the `lesson_best` subquery adds
  `GrammarLessonResult.lesson_id != REMIND_LESSON_ID`.
- `backend/routers/admin.py` — the per-user admin stats loop skips
  `lesson_id == REMIND_LESSON_ID` when building `best_grammar`.
- `backend/routers/grammar.py` `GET /grammar/progress` — skips the sentinel
  when building the per-lesson best-score map it returns to clients (the lesson
  lock itself is computed by `_annotate_lesson_progress`, which only looks up
  real lesson ids, so the sentinel can never unlock anything).

Streak (`_distinct_dates` over `GrammarLessonResult.created_at`) and
`GET /me/activity-calendar` are deliberately **not** filtered — a remind run
is real practice and should count as a study day.

**Rejected: a new table for remind results.** Would need a new model, two more
streak/calendar `UNION`-style reads, and a user-delete cascade in
`admin.py`'s account-deletion path. The SQLite test DB doesn't enforce foreign
keys the way production Postgres does (see
`documentation/testing-foreign-keys.md`), so a missed cascade there would ship
silently. Reusing `GrammarLessonResult` with a sentinel id costs three
one-line skips instead — smaller and the failure mode (an inflated "lessons
passed" count) is obvious and easy to test.

## Frontend

`ProgressStatCard`'s `primaryAction` gained an in-place form:
`{ label, onClick, disabled?, hint? }`, alongside the original navigating form
`{ label, href }` (still used by every other caller — Слова, Фразы,
Практика). `hint` renders as `text-xs text-faint` under the button row.
`GrammarStatsBar` (`grammar/page.tsx`) passes the onClick form; the button is
hidden entirely when zero lessons are passed (`ProgressStatCard`'s own
`count > 0` gate — unchanged), and shown disabled + `tr.grammar.remindHint`
once ≥1 lesson is passed but none of them at practice level. The disabled
state is display-only — the server 404 is the real, enforced gate.

`REMIND_LESSON` (`id: 0`) is a client-side pseudo-`Lesson` object that runs
through the exact same `startLesson`/`GrammarTaskRunner`/`postResult` flow as
a real lesson, with two branches keyed on `id === 0`: fetch
`/api/grammar/remind/tasks` instead of `/api/grammar/lessons/{id}/tasks`, and
hide the pass/fail banner on the done screen (its copy is about unlocking the
*next* lesson, which doesn't exist for a remind run — `nextLesson` is already
`null` there since `id: 0` never matches a real lesson in the list).
