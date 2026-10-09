# Knowledge check + "Work on mistakes" (#62a)

Spec: `specs/knowledge-check.md`. Code: `backend/knowledge_check_service.py` (logic),
`backend/routers/knowledge_check.py` (auth/gating/persistence), `frontend/app/dashboard/check/page.tsx`,
`frontend/components/GapWidget.tsx`, `reading` task type in `GrammarTaskRunner.tsx`.

## Topic keys
- `g:<id>` — a noun/numeral lesson family, keyed by its **basic** `LESSON_CONFIG` id (published only).
- `v:<id>` — verb tense, basic ids 200/202/204/206/208/210 (not 220–225 practice, not 300 cases).
- `p:<category_id>` — a Practice category with ≥ 1 free published test, minus
  `CHECK_EXCLUDED_CATEGORY_IDS = {1}` (Конституция, civics). New categories join by publishing a
  test — seeding and releasing #62b–#62e content never needs a deploy.

## Decisions
- **MC only → exact server grading.** Basic lessons attach 4 options (#60), so the server compares
  strings; no Lithuanian normalisation port to Python. The client still gets `answer` (instant
  feedback, as in every lesson) but the *graded* copy is `knowledge_check.tasks_json`.
- **Practice tasks stay one ordered block.** Dialogue turns / gap-text gaps (#62c/#62d) must never
  appear out of order, so `_insert_blocks` shuffles grammar tasks and inserts each practice block
  whole. Builders are keyed by test kind (`PRACTICE_TASK_BUILDERS`); #62a ships `"choice"` only.
- **Close the gaps reuses `REMIND_LESSON_ID = 0`.** Same save path as remind (#26): counts toward
  streak/calendar, and every "lessons passed" reader already skips id 0. Budget: practice blocks
  first (2 tasks each), the rest split `ceil(budget/n)` across weak grammar topics, capped at 10.
- **No quota.** The check is a diagnostic/funnel step; charging a daily session would make free
  users pay for being sold to. Gating is "one completed check unless Premium" instead.
- **Open check reuse.** Start returns an unsubmitted check if one exists, so abandoned starts can't
  pile up rows (and a free user can't reroll tasks before submitting).
- **Page is noindex.** `/dashboard/check/` has `robots: noindex,nofollow` in its layout and
  `Disallow: /dashboard/check/` in robots.txt; it's not in `PUBLIC_PREFIXES` or the sitemap.
- **Empty Practice categories are hidden from non-admins** (`/practice/categories`,
  `/me/practice-categories`) so later plans can seed `testing` categories into the shared prod DB.

## Task instruction line (#63)

Each grammar task carries `instruction_ru` / `instruction_en`, built by `_instruction()` in
`backend/grammar_service.py` and attached in `get_lesson_tasks` / `get_verb_lesson_tasks`; reading
tasks get theirs in `knowledge_check_service._build_choice`. Why server-built: the server already
knows the lesson's cases / tense, which the task payload doesn't carry (the check strips `topic`),
and a future mobile client gets the same text for free. Why in the generators rather than the check
only: first scoped to the check + gaps run, widened at the prototype review (2026-10-10) so that
grammar lessons announce the task too — attaching at generation covers every caller (lessons, check,
gaps, remind, continue) with one change. Old stored checks lack the fields; the runner just omits the line.

## Gotcha — the table is created in prod by a local boot
`KnowledgeCheck` (`knowledge_check`) is a new table created by `create_all()` on startup. Local
`DATABASE_URL` is production Neon, so the first local uvicorn boot after the model landed created
it in prod. `create_all()` never adds columns to an existing table — any later column needs a
hand-run migration (or another new table).
