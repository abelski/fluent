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

# #62a — Knowledge check + "Work on mistakes" home widget

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 1 of 8**
(#62a → #62h, each on its own branch, merged in order; branch `feat/62a-knowledge-check-gap-widget`).
The idea holds the placement map; #62b–#62h build the new formats and topics and plug them into
this check. **This plan builds the check itself:** a free knowledge check on home that does a gap
analysis, then an upsell (free) or "Close the gaps" + "Recommendations" tabs (Premium).

What exists and gets reused:
- **Task generators** — `backend/grammar_service.py`: `get_lesson_tasks(lesson_id)` (noun/numeral
  lessons from `data/grammar/lessons.json` `LESSON_CONFIG`, triples basic/advanced/practice per
  topic, e.g. 10/11/12 = "Kilmininkas Vns.") and `get_verb_lesson_tasks(lesson_id)` (verb lessons in
  `VERB_LESSON_CONFIG`; basic conjugation ids are 200, 202, 204, 206, 208, 210). On `basic` level
  both attach 4 `options` when a paradigm allows (#60) — so a check can be **multiple choice only**,
  which makes server grading an exact string compare (no Lithuanian normalisation port needed).
- **Mixed-run precedent** — `GET /grammar/remind/tasks` (#26, `backend/routers/grammar.py:283`,
  `documentation/grammar-remind.md`) samples tasks across lessons, and saves the run as a normal
  `GrammarLessonResult` under the sentinel `REMIND_LESSON_ID = 0`, so it counts toward streak/calendar
  and the 3 "lessons passed" readers already skip it. "Close the gaps" reuses that sentinel and save
  path unchanged. Its final `random.shuffle(pool)` must **not** be copied for practice tasks (Req 2).
- `_program_lesson_ids(program, session)` (`routers/grammar.py:263`) maps a program to its lesson ids
  and `_grammar_programs(session)` (`routers/grammar.py:47`) is the cached program list — both reused
  to map weak topics → grammar programs for Recommendations.
- **Reading questions** — Practice category `id=2` "Чтение": 19 published tests, all free, every one
  with a `lesson_text_lt` passage (≤ 915 chars), 128 active **True/False** questions: `option_a`
  «Teisingas», `option_b` «Neteisingas», `option_c`/`option_d` empty strings (seeded by
  `scripts/seed_skaitymas_new.py`). So a practice task has 2–4 options, not always 4. Passages are
  markdown (`*…*`, `— ` dialogue lines) rendered by `DialogueText` in `practice/[id]/page.tsx`.
- **Runner** — `frontend/app/dashboard/components/GrammarTaskRunner.tsx` runs any `Task[]`, with MC
  `options`, feedback and the #60 retry queue; already reused outside Grammar by
  `app/dashboard/continue/page.tsx`.
- **Home** — `frontend/app/LandingClient.tsx:310-313` renders `<Leaderboard />` then
  `<EffortRadar />` (`frontend/components/EffortRadar.tsx`, #56) in the right column; the widget goes
  directly under it. The widget renders only in the signed-in view, so the prerendered (guest)
  landing HTML does not change.
- Premium check: `_lock_bypassed(user)` (`routers/grammar.py:88`) = admin or
  `quota.is_premium_active(user)`. Enrollment endpoints already exist:
  `POST /me/grammar-programs/{id}`, `POST /me/practice-categories/{id}`.
- Schema: **no Alembic** for new tables — `create_all()` on boot creates missing tables
  (`backend/database.py:45`, `documentation/deploy-render.md`, `documentation/audio.md` "Why a DB
  table, created by `create_all()`"). Local `DATABASE_URL` is production Neon, so the first local boot
  creates the table in prod: **stop any local backend before editing the model**, and get every column
  right in one go (`create_all` never adds columns later).
- **SEO surface** (`documentation/seo.md`): `robots.txt` (`backend/main.py` `robots_txt`) starts
  with `Allow: /`, so any new page is crawlable unless disallowed; `/dashboard/review/` is the
  precedent for a private page (layout `robots: { index: false, follow: false }` + `Disallow`).
  `frontend/tests/seo-public-pages.spec.ts` lists public and private dashboard pages;
  `frontend/scripts/seo-snapshot.mjs --diff` guards every RU title/description/canonical.
  `/llms.txt` (`backend/main.py`) describes the app for AI assistants.

Model/effort: opus/high — new table created in the shared prod DB on first boot, server-side Premium
gating, server-side grading, a new runner task type and a 3-state widget.

## Goals
- A signed-in user who never took the check sees a "Work on mistakes" card directly above the effort radar (right column: leaderboard → widget → radar)
  offering a free knowledge check (16 multiple-choice tasks, ~10 min).
- The check mixes noun/numeral cases, verb tenses and reading; it is graded on the server and ends
  with a per-topic breakdown (strong / weak).
- Free user after the check: their weak topics + an upsell to `/pricing`; no retake.
- Premium user after the check: tabs "Close the gaps" (start a generated lesson on weak topics) and
  "Recommendations" (grammar programs + Practice categories to enroll in, with the reason), plus
  "Take the check again".
- The check page stays out of search engines; no indexed page changes.
- Practice categories with nothing published are hidden from users — the prerequisite that lets
  #62b–#62e seed hidden content into the shared prod DB before their own deploy.
- The pricing page lists the new Premium feature the upsell points to.
- RU + EN, desktop and 375px.

## Non-Goals
- The new Practice categories / question types (Signs, T/F/NS, Dialogues, Gap text), the 3 new
  grammar programs, describe-a-picture, nasal vowels — later numbers per the idea's map.
- Recommending Phrases or Words; adding missed words to review.
- Any entry to the check outside the home widget (no Practice card, no landing link, no guest access
  — the user's decision; the SEO side of exam prep is handled by the A2 article update in #62e).
- Analytics/event tracking (success is measured by SQL on existing tables).
- Changing the effort radar, the Premium upsell card, or the existing remind flow.

## Requirements

1. **Topics.** A topic is one lesson family, keyed by its `basic` lesson id:
   - noun/numeral: `"g:<basic LESSON_CONFIG id>"` for published lessons (`get_lessons(is_admin=False)`),
   - verbs: `"v:<basic VERB_LESSON_CONFIG id>"` for the 6 conjugation tenses (200, 202, 204, 206,
     208, 210 — not 220–225, not 300),
   - practice: `"p:<category_id>"` for every Practice category with at least one free published
     test, except `CHECK_EXCLUDED_CATEGORY_IDS = {1}` (Конституция — a civics test, not language).
     Today that is "Чтение" only; #62b–#62e categories join **by themselves when their tests are
     published** — no code change after seeding, so seeding and releasing never need a deploy.

   Titles: noun/numeral topics use the Lithuanian `LESSON_CONFIG` title in both languages (there is
   no `title_en`, e.g. "Kilmininkas Vns."); verb topics use the RU title / `title_en` from
   `get_verb_lessons`; practice topics use the category's `name_ru` / `name_en`.
2. **Check composition** (constants in the new service): 5 random noun/numeral topics × 2 tasks,
   2 random verb topics × 2 tasks, 1 random practice topic × 2 questions from one random test of
   that category (`status='published'`, `is_premium == False`; both questions share that test's
   passage) = **16 tasks**. If the practice pool is empty, a 6th noun/numeral topic takes the practice
   topic's place. Only tasks that
   carry `options` are used (generate the basic lesson, filter `options`, take 2; if a topic yields
   < 2, swap in another topic of the same kind). Practice tasks are built by a per-test-kind builder
   (`PRACTICE_TASK_BUILDERS`); #62a has the one for ordinary multiple-choice tests (`"choice"`, every
   test today), #62c/#62d add the dialogue/gap-text ones. Until #62c adds `practice_test.kind`, every
   test is `"choice"`; afterwards a test whose kind has no builder is skipped (defensive — a kind and
   its builder always ship in the same plan). **Order:** grammar tasks are shuffled; the
   practice topic's tasks stay **one block, in builder order**, inserted at a random position (a later
   dialogue turn or gap must never be shown before an earlier one).
3. **Server owns the answers.** Starting a check stores the full task list (incl. `answer` and
   `topic`) in a new `knowledge_check` row and returns the tasks to the client (the runner needs
   `answer` for instant feedback, same as every grammar lesson today). Submitting sends the picked
   option string per task index; the **server** grades (`response == answer`) and stores the result.
4. **Weak topic** = topic score **not > 75%** (inverse of the lesson pass gate `score/total > 0.75`,
   `routers/grammar.py:227`). With 2 tasks per topic that means any wrong answer.
5. **Gating, server-side:**
   - "Premium" everywhere below = `_lock_bypassed(user)` — `is_premium_active` alone excludes admins.
   - Start: allowed when the user has no *completed* check, or is Premium. Otherwise
     `403 {"code": "premium_required"}`. If the user has an open (uncompleted) check, start
     **returns that same check** instead of writing a new row — abandoned starts can't pile up.
   - Submit: owner only (404 otherwise), once (409 if already completed), response list length must
     equal the task count (422).
   - Gaps tasks: Premium only (`403 premium_required`); `404 {"code": "no_check"}` without a
     completed check; `404 {"code": "no_gaps"}` when the latest check has no weak topics.
   - The check does **not** consume the daily study quota and writes no `GrammarLessonResult`.
6. **Close the gaps run:** up to 10 tasks from the latest completed check's weak topics, **sorted by
   score ascending** (weakest first, at most 5 topics), `ceil(10/n)` per topic. No enrollment
   required. Grammar topics draw from `get_lesson_tasks` / `get_verb_lesson_tasks` of the topic's
   **basic** lesson and are shuffled; a practice topic = 2 tasks from a random **published, free**
   test of that category, built by the same builder as in the check, kept as one ordered block
   (Req 2). Saved via the existing `POST /grammar/lessons/0/results` (`REMIND_LESSON_ID`) — no new
   save path, counts toward streak/calendar like remind.
7. **Recommendations** (Premium only, in the state response): for each weak topic, the public grammar
   programs (`_grammar_programs(session)` filtered on `is_public` — keeps hidden `verb_cases` out)
   whose `_program_lesson_ids` include that topic's basic lesson, and for `p:<id>` that Practice
   category if it has a free published test; deduplicated, each with `enrolled` (via
   `cache.enrollment_ids(...)` for `UserGrammarProgram` and `UserPracticeCategoryEnrollment`) and the
   list of weak topic titles that caused it. Free users never receive this list.
8. **New runner task type `reading`:** `{type:"reading", passage_lt, question_lt, question_ru,
   options, answer}` — `options` = the question's non-empty option texts (2–4). Renders the passage
   (scrollable block above the question; **no block when `passage_lt` is empty**) + the question +
   the existing MC options UI. Passage **and question** render through `DialogueText` (markdown and
   `**Name:** line` speaker lines — #62c's dialogue turns use that format), moved unchanged from
   `practice/[id]/page.tsx` to `frontend/app/dashboard/components/DialogueText.tsx` and imported by
   both. Optional runner prop `onAnswer(index, response)` fires on the **first** attempt of each
   original task (never on a retry).
9. **Widget states** (`GapWidget`, directly above `<EffortRadar />`, also rendered when the radar is hidden
   for a brand-new user):
   - no completed check (free **or** Premium) → title, one-line pitch, CTA "Проверить знания / Check
     my knowledge" → `/dashboard/check`;
   - completed, free → weak-topic chips (or "Пробелов нет / No gaps found") + upsell line + link
     to `/pricing`;
   - completed, Premium → tabs "Проработать пробелы / Close the gaps" and "Рекомендации /
     Recommendations"; first tab lists weak topics + "Начать / Start" → `/dashboard/check?gaps=1`
     (disabled with "No gaps found" when empty); second lists recommendation rows with an enroll
     button (calls the existing enroll endpoint, then shows "Записан / Enrolled"); footer link
     "Пройти проверку снова / Take the check again" → `/dashboard/check`.
10. **Check page** `/dashboard/check` (static route, `?gaps=1` read at runtime from
    `window.location` like `resolveListId`): start → runner (`level="basic"`, no rules) → on finish
    submit → result screen with per-topic rows (strong/weak) and "На главную / Back home". `?gaps=1`
    runs the gaps tasks and saves with `saveGrammarLessonResult(0, …)`, then returns home. 403 →
    show the upsell text + `/pricing` link instead of the runner.
11. **Hide empty Practice categories** — `GET /practice/categories` and `GET /me/practice-categories`
    omit, for non-admin callers (guests included), a category with no test the caller may see. Admin
    output unchanged. Lives here, not in #62b: it must already be live in prod when #62b–#62e seed
    their hidden (`testing`) categories into the shared DB, which happens before their own deploy.
    Changes the spec scenario "anyone lists practice categories" ("every category is returned").
12. **Pricing** — `tr.pricing.premiumFeatures` (RU + EN) gains one line: «Работа над ошибками: уроки
    по твоим пробелам после проверки знаний» / "Work on mistakes: lessons built from your gaps after
    the knowledge check". The pricing page's title, description and canonical do not change.

### SEO
- **S1 — the check page is private.** `frontend/app/dashboard/check/layout.tsx` with metadata
  `{ title: 'Проверка знаний', robots: { index: false, follow: false } }` (same as
  `dashboard/review/layout.tsx`); `robots.txt` gains `Disallow: /dashboard/check/`; the path is **not**
  added to `PUBLIC_PREFIXES` (logged-out visitors are redirected) and **not** to the sitemap.
- **S2 — no indexed page changes.** The guest landing, `/dashboard/grammar/` and every other RU page
  keep their title, description and canonical: the `seo-snapshot` diff shows exactly one difference,
  the new `/dashboard/check/` page.
- **S3 — llms.txt.** The "Key features" list gains one line: "Free knowledge check with a gap
  analysis; Premium builds lessons from your mistakes (sign-in required)".

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. Cards are flat `border border-line rounded-[14px]`, no shadow; Inter only; green accent `emerald-600`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62a_knowledge-check-gap-widget.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** `UserHome` in `frontend/app/LandingClient.tsx` (streak card with TAK in its ring, leaderboard, the right column), `frontend/components/EffortRadar.tsx` (the card below the widget), `GrammarTaskRunner.tsx` (task screen, options grid, feedback, TAK), `DialogueText` (passage look), the component library's pill tabs (Статьи / Settings), the Premium card of `frontend/app/pricing/PricingClient.tsx`.
- **New part:** GapWidget, the check page (runner with a `reading` task, result screen, 403 upsell), the pricing line.
- **States:** widget — no check (free), no check (Premium), free after the check (weak-topic chips + upsell), free with no gaps, Premium «Проработать пробелы» tab, Premium with no gaps (Start disabled), Premium «Рекомендации» tab (enroll → «Записан»); check page — a grammar MC task, a reading task with a passage, a reading task without a passage, the result screen (strong / weak topics), the 403 upsell; pricing — the Premium list with the new line; home at 375px with the widget stacked above the radar.
- **Content:** real topic titles from `LESSON_CONFIG` / `get_verb_lessons` and one real «Чтение» passage with its True/False statements.
- **Decide in the prototype:** widget title, pitch and CTA copy; weak-topic chip style; result-screen layout; tab labels; where the widget sits on mobile.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62a_knowledge-check-gap-widget-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
**2026-10-09 — approved** (prototype v2, https://claude.ai/artifact/WFo2vFRE5fwnNyR5bQ6mvm):
- **Changed:** the widget sits **above** the effort radar, not under it (right column: leaderboard →
  GapWidget → «Куда уходят усилия»). Copied into Goals, Req 9 and step 9.
- **Rejected:** adding word tasks to the check — it stays 16 tasks, grammar + reading only.
- **Kept as prototyped:** title «Работа над ошибками» / "Work on mistakes" (radar-style uppercase
  label); pitch with TAK 40px; full-width ink CTA «Проверить знания ›»; date + score meta line;
  weak-topic chips `bg-destructive/10 text-destructive rounded-full`; grey "no gaps" box; free upsell
  line + green «Узнать о Premium ›»; equal-width pill tabs; recommendation rows (kind label, name,
  «Из-за: …», outlined Enroll → green «✓ Записан» pill); green «Пройти проверку снова ›»; result
  screen (TAK «Gerai!», score, weak section then strong section, n/2 + Слабая/Сильная pill, one-line
  upsell, ink «На главную»); 403 card; pricing line as item 8, before «Поддержка развития сервиса».
- Recommendation program names in the mock are placeholders — the build uses real
  `grammar_program` names.


## Implementation

- [x] 0. **Prototype** — build `temp_files/prototypes/plan_62a_knowledge-check-gap-widget.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62a_knowledge-check-gap-widget-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [x] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62a-baseline.json`.
- [x] 2. `backend/models.py` — **stop any local backend first.** Add `KnowledgeCheck` table
  (`knowledge_check`): `id`, `user_id` (FK `user.id`, index), `created_at`, `tasks_json: str` (server
  copy incl. `answer` + `topic`), `result_json: Optional[str]` (per-topic
  `{topic, title_ru, title_en, correct, total, weak}`; NULL = not completed). Created by
  `create_all()` on boot — no Alembic migration.
- [x] 3. `backend/knowledge_check_service.py` — topic list, `CHECK_EXCLUDED_CATEGORY_IDS`,
  `PRACTICE_TASK_BUILDERS` keyed by test kind (only `"choice"` here), `build_check(session)`
  (Req 1–2), `grade(tasks, responses)` (Req 3–4), `gap_tasks(result, session)` (Req 6),
  `recommendations(result, user, session)` (Req 7, imports `_program_lesson_ids` and
  `_grammar_programs` from `routers.grammar` — no import cycle, no copy). Reading tasks built
  from `PracticeQuestion` rows (`option_<correct_option>` → `answer`).
- [x] 4. `backend/routers/knowledge_check.py` + register in `backend/main.py` —
  `GET /me/knowledge-check` (state: `latest` result or null, `is_premium`, and `recommendations`
  only for Premium; the client derives "can start" from `latest` + `is_premium`),
  `POST /me/knowledge-check` (start, Req 5 gate, returns `{id, tasks}` with `answer` but without
  `topic`), `POST /me/knowledge-check/{id}/answers` (`{responses: list[str|null]}`, Req 5 checks,
  returns the result), `GET /me/knowledge-check/gaps/tasks` (Req 5–6). All require auth (401).
- [x] 5. `backend/tests/test_knowledge_check.py` — composition (16 tasks; grammar tasks have 4
  options, practice tasks 2–4; topics as Req 2; two builds with different `random.seed` differ; a
  Premium or `testing` reading test is never used; a pool category with only `testing` tests is
  skipped and the check still has 16 tasks; the practice block is contiguous and in builder order);
  Конституция is never used; a new category joins the pool as soon as it has one free published test
  and needs no code change; open-check reuse (second start without submit returns the same id, no new
  row); admin counts as
  Premium; server grading (wrong `responses` → weak topic; forged extra/short list → 422); free
  retake 403, Premium retake 200, submit twice 409, other user's check 404; gaps 403 for free /
  404 `no_check` / 404 `no_gaps` / 200 ≤ 10 tasks for Premium, ordered weakest first, practice block
  contiguous, also for a Premium user with zero enrollments; recommendations absent for free and
  correct (program + category, `enrolled` flag) for Premium; no quota row and no
  `GrammarLessonResult` written by start/submit.
- [x] 6. `frontend/lib/api.ts` — types + `getKnowledgeCheck()`, `startKnowledgeCheck()`,
  `submitKnowledgeCheck(id, responses)`, `getGapTasks()` (mirror `getEffort` style; surface 403 code).
- [x] 7. `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — add `ReadingTask` to the `Task`
  union, its render branch (Req 8), and the optional `onAnswer` prop. Move `DialogueText` (+ its
  `speakerColor`/`ANON_COLORS`/`InlineOnly` helpers) out of `practice/[id]/page.tsx` into
  `frontend/app/dashboard/components/DialogueText.tsx`, unchanged; the practice page imports it. No
  behaviour change for existing callers.
- [x] 8. `frontend/app/dashboard/check/page.tsx` + `layout.tsx` — check + gaps page (Req 10) and the
  S1 metadata.
- [x] 9. `frontend/components/GapWidget.tsx` + `frontend/app/LandingClient.tsx` — the widget (Req 9),
  placed right before `<EffortRadar />` (after `<Leaderboard />`); on mobile it stacks right before the radar. Tabs reuse the
  component library's existing pill-tab recipe (Статьи category tabs / Settings) — not a new
  pattern. Re-run `effort-radar.spec.ts`; update its column assertions only if the new sibling
  breaks them (the radar's own behaviour must not change).
- [x] 10. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — all new strings (widget, tabs, check page,
  result screen, upsell, errors) in both languages; keys declared in `types.ts` so `tsc` fails on a
  key missing from either language.
- [x] 11. SEO: `backend/main.py` `robots_txt` (S1 `Disallow`) and the llms.txt "Key features" line
  (S3); `backend/tests/test_seo_files.py` (new) asserts both; `frontend/tests/seo-public-pages.spec.ts`
  adds `/dashboard/check` to `PRIVATE_PAGES`.
- [x] 12. `frontend/tests/knowledge-check.spec.ts` — Playwright with **all** API calls mocked
  (`/api/me/knowledge-check*`, `/api/me/effort`, stats, `/api/billing/config` → `{"enabled": true}`):
  the widget's no-check state for **both** a free and a Premium user, free-after, Premium tabs
  switch, the two "no gaps" empty states (free card; Premium tab with Start disabled), enroll click,
  check run to result screen, a reading task renders its passage (and none when `passage_lt` is
  empty), 403 start shows the upsell. Saves the screenshots listed under Validation.
- [x] 13. `backend/routers/practice.py` `list_categories` + `list_enrolled_categories` — Req 11.
  Tests: `backend/tests/test_cache_endpoints.py::test_publishing_a_practice_test_updates_the_category_count`
  rewritten for the new rule (the draft-only category is absent for the user before publishing,
  present with count 1 after); new cases in `backend/tests/test_practice_bento.py` (or a new file):
  a `testing`-only category is hidden from a guest and a free user in both lists and shown to an
  admin; a category with one published test is visible to everyone.
- [x] 14. `frontend/lib/i18n/ru.ts`, `en.ts` — Req 12.
- [x] 15. Docs/specs: `specs/home.md` (widget scenarios from the idea), new `specs/knowledge-check.md`
  (endpoints, gating, grading, task order, the exclude-list pool), `specs/practice.md` (the changed
  "anyone lists practice categories" scenario and the enrolled list, Req 11), new `specs/seo.md` lines if that spec lists robots rules,
  `documentation/knowledge-check.md` (topic keys, composition, why MC-only = exact server grading,
  why practice tasks stay an ordered block, why the gaps run reuses `REMIND_LESSON_ID`, why no
  quota, the gotcha that `create_all()` creates `knowledge_check` in prod on the first local boot,
  why the page is noindex), `documentation/design system/Component Library (as-built).html`
  (GapWidget card entry; tabs point to the existing pill-tab recipe), `documentation/IMPLEMENTATION.md`
  mapping.

## Review

- [x] Code review passed (round 2)
- note: `answer` is sent to the client for instant feedback; grading still uses the server copy — a client can only cheat its own score.
- note: an abandoned open check is reused forever (no expiry); concurrent starts may create two open rows, latest wins — harmless.
- note: gap runs may include typed-answer grammar tasks (check itself is MC-only).

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q tests/test_knowledge_check.py tests/test_seo_files.py tests/test_cache_endpoints.py tests/test_practice_bento.py tests/test_grammar_remind.py tests/test_grammar_basic_options.py`
- [x] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright: `cd frontend && npx playwright test tests/knowledge-check.spec.ts tests/seo-public-pages.spec.ts tests/effort-radar.spec.ts tests/grammar-remind.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [x] SEO diff: the only reported difference is `/dashboard/check/: new page` (DoD command).
- [ ] Smoke on local server (one uvicorn, one next dev): free test user → widget CTA → run the check
  → result screen → home shows weak topics + upsell; a second `POST /api/me/knowledge-check` → 403.
- [ ] Premium/admin user → tabs visible, "Close the gaps" run completes and writes a
  `grammar_lesson_result` row with `lesson_id = 0`; Recommendations enroll works.
- [x] Auth gate (accepted 2026-10-09: live server answers **400** "Missing token", same as every `/api/me/*` via shared `require_user`; TestClient asserts 401): every `/api/me/knowledge-check*` call without a token → 401; `/dashboard/check`
  logged out redirects away; `curl localhost:8000/robots.txt` shows `Disallow: /dashboard/check/`.
- [ ] Screenshots in `temp_files/screenshots/plan_62a_knowledge-check-gap-widget/`, looked at
  and described: widget **no-check (free) / no-check (Premium) / free-after / free no-gaps /
  Premium-gaps tab / Premium no-gaps / Premium-recommendations tab**, check runner with a **reading**
  task, **result screen**, **403 upsell**, **pricing Premium list** — each in **RU and EN**, at
  **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62a_knowledge-check-gap-widget-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: nav, header, footer, login intact on home.
- [ ] News post written and published via /news-writer (user's call at close-out).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/knowledge-check.spec.ts tests/seo-public-pages.spec.ts tests/effort-radar.spec.ts tests/grammar-remind.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62a-baseline.json 2>&1 | grep -q "changed on 1 point" && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62a-baseline.json 2>&1 | grep -qx "/dashboard/check/: new page"
ls temp_files/screenshots/plan_62a_knowledge-check-gap-widget/ | grep -c png   # expect >= 44 (11 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000`, logged in as a local test user (token
in `localStorage('fluent_token')`), real local backend on :8000 — (a) a free user with no prior
check, (b) an admin user.

**Scenarios:**
1. As (a): open `/`, find the "Work on mistakes" card, start the check, answer all tasks, finish.
2. As (a): return to `/`, read the card; try to start the check again from any visible control.
3. As (b): open `/`, switch between the two tabs, enroll in one recommendation, start "Close the gaps"
   and finish it.
4. Switch the UI to English and look at the card again; resize to 375px wide.

**Acceptance criteria:**
- [ ] A user who never took the check is offered it on the home page under the effort chart.
- [ ] The check has 16 multiple-choice tasks, including a reading passage with questions, and ends
  on a screen listing topics as strong or weak.
- [ ] After the check, a non-Premium user sees their weak topics and an offer to buy Premium, and
  cannot start the check a second time.
- [ ] A Premium/admin user sees two tabs; the recommendations tab offers enrollable programs with a
  reason, and enrolling changes the row to enrolled.
- [ ] "Close the gaps" starts a lesson of at most 10 tasks and returns home when finished.
- [ ] All card and check texts appear in English when the UI is English.
- [ ] At 375px the card fits without horizontal scroll.

## Release

Nothing to publish: the widget, the check, the empty-category rule and the pricing line go live with
the deploy, and every state they can show is complete (no content of later plans is involved).
After the deploy: take one knowledge check on fluent.lt as a free test user, then the news post.
Rollback = revert the merge; the `knowledge_check` table can stay (nothing else reads it).

