---
kind: feature
status: draft
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# #62f — Grammar: "Прилагательные" (adjectives in cases)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 6 of 8.**
Branch `feat/62f-grammar-adjectives`. **Depends on #62a being merged** (the new lessons join the
knowledge check automatically; this plan only tests that). Independent of #62b–#62e. It also lands
the **shared grammar groundwork** #62g and #62h reuse (generic seed, admin preview of hidden programs,
generated admin group options, llms.txt grammar list).

The A2 exam checks adjective–noun agreement ("Man reikia **šiltos** striukės"). Grammar covers noun
cases and numerals, not adjectives.

The **Numbers program is the precedent** — it was added as data, not code:
- `backend/data/grammar/lessons.json`: `cases` (= `CASE_INFO`, index → `[name, group]`) and
  `lessons` (= `LESSON_CONFIG`, `[id, level, [case_index], task_count, title]`, a basic / advanced /
  practice triple per topic). Numbers = case indices 15–20, group `Skaičiai`, lessons 70–102.
- `backend/scripts/seed_numbers_grammar.py` inserts `GrammarCaseRule` (the rule card, RU + EN) and
  `GrammarSentence` rows (`display` with `___`, `answer_ending`, `full_word`, `russian`, `english`,
  `use_in_basic/advanced/practice`). It inserts unconditionally (a rerun duplicates rows). Numbers
  has 35–38 sentences per case.
- A program shows lessons whose cases all belong to its `lesson_filter` groups
  (`filterLessonsForProgram` in `frontend/app/dashboard/grammar/page.tsx`, `_program_lesson_ids` in
  `backend/routers/grammar.py`). Case groups reach the frontend from `GET /api/admin/grammar/config`.
- Non-admins only see lessons whose case rules are all `published` (`get_lessons`).

How tasks are built (`backend/grammar_service.py`): `_generate_sentence_tasks` reads the sentence
pool; the stem is the word right before `___` (`_STEM_BLANK_RE`); the #156 invariant
`stem + answer_ending == full_word` filters bad rows; Basic multiple choice (#60) takes 4 forms of
the answer's lexeme from `_paradigm_forms` (noun rows in `words.txt`, then `paradigms_extra.txt`,
whose header says order inside a line is irrelevant); the «от: …» hint (`base_lt`) comes from the
noun tables only. A **duplicate-word cleanup** (`grammar_service.py:489-493`) deletes `full_word`
from the text after the blank when it appears there as a *substring* — 0 prod rows trigger it today
(checked 2026-10-08), but adjective rows would: «Tai ger___ knyga, o filmas geras.» → «…filmas s.».

Constraints found (verified in code):
- Noun-pipeline lesson ids **must stay below 200**: `remind_tasks` and `filterLessonsForProgram` treat
  `id >= 200` as a verb lesson. Next free basic ids follow the step-6 pattern: 106, 112, 118, 124,
  130, 136.
- **Do not add the program to `_SEED_PROGRAMS`** (`routers/grammar.py`): `_ensure_seed` creates
  missing seeds on the first request — public, in prod, on the first local boot, with `lesson_filter`
  NULL (= every noun lesson).
- **Admins cannot preview a hidden program today:** `GET /grammar-programs` drops non-public programs
  for everyone (`routers/grammar.py:352`) and enrolling in one returns 404 (`:383`).
- `_grammar_programs` has **no ORDER BY**, and the Grammar hero's «Начать с падежей» enrolls
  `programs.find(type==='cases')` (`grammar/page.tsx:234`) — with more `cases` programs the pick
  depends on table row order.
- The admin grammar page hard-codes the `lesson_filter` `<select>` options
  (`frontend/app/dashboard/admin/grammar/page.tsx:552-555`); `GROUP_ORDER` only matters for a program
  without `lesson_filter`.
- A `-us` adjective with a t/d stem alternates (platus → plačios, saldus → saldžios).
- Typed answers go through `normalizeLt`, which drops diacritics, so at Advanced/Practice «gera» and
  «gerą» are both accepted; the nominative/accusative contrast is only really tested at Basic.
- Seed scripts write from their own process: the app cache shows them within its 10-minute TTL or
  after a restart (`documentation/caching.md`). Prod writes are the user's step.

**SEO** (`documentation/seo.md`): `/dashboard/grammar/` is indexed (sitemap 0.9). Its title
«Грамматика литовского языка — падежи и склонения» stays; its description already says «Практикуйте
склонения существительных и прилагательных» — this plan makes that true. Programs load client-side,
so the prerendered HTML does not change. The article **`būdvardžiai-linksniavimas`** («Прилагательные:
склонение», RU + EN, three declension types, definite forms, comparison) already exists; case rules
link to articles through `article_slug` (cases 2–13 → `daiktavardžiai-linksniavimas`). `/llms.txt`
describes Grammar with a hard-coded noun-case sentence.

Model/effort: opus/high — ~210 correct Lithuanian sentences with RU/EN translations and ~1,000
adjective forms, plus the shared groundwork; the content is the main risk.

## Goals
- A new grammar program «Прилагательные» / "Adjectives": 6 topics (adjective agreement in
  Vardininkas, Kilmininkas, Naudininkas, Galininkas, Įnagininkas, Vietininkas; singular and plural,
  masculine and feminine mixed), each at Basic / Advanced / Practice like every noun lesson.
- Basic tasks offer 4 forms of the same adjective; every task shows the adjective's dictionary form
  («от: šiltas»).
- Ships hidden (rules `testing`, program not public); admins can preview and enroll before release.
- Rule cards link to the existing adjectives article, and the article links back to the program.
- RU + EN, desktop and 375px.

## Non-Goals
- Definite (pronominal) adjectives (gerasis), comparatives and superlatives.
- Šauksmininkas.
- New articles; changing the Grammar page title or description.
- Changes to existing lessons or option rules (the cleanup removal changes no current row).

## Requirements

1. **Case indices 21–26**, group `Būdvardžiai`, in `lessons.json` `cases`:
   21 `Būdvardžiai: Vardininkas`, 22 `Būdvardžiai: Kilmininkas`, 23 `Būdvardžiai: Naudininkas`,
   24 `Būdvardžiai: Galininkas`, 25 `Būdvardžiai: Įnagininkas`, 26 `Būdvardžiai: Vietininkas`.
2. **Lessons** in `lessons.json` `lessons`: basic ids 106, 112, 118, 124, 130, 136 (+1 advanced,
   +2 practice each), task counts as the existing topics (24 / 35 / 20), titles = the case names.
3. **Adjective paradigms** — new `backend/data/grammar/adjectives.txt`: one adjective per line,
   tab-separated, **first column = the dictionary form** (masc. nom. sg.), then every form (m/f ×
   sg/pl × the 6 cases). Built by a rule table per declension type (`-as/-a`, `-ias/-ia`, `-us/-i`
   with the t→č / d→dž alternation before `i` + vowel, `-is/-ė`) in
   `backend/scripts/build_adjective_paradigms.py`, output committed; ~40 common A2 adjectives,
   regular ones only. `grammar_service.py` loads it into a separate `_ADJ_FORM_TO_FORMS` (form → the
   full line), checked **last** in `_paradigm_forms`; a form found on two lines → ambiguous → typing.
4. **`base_lt`** for sentence tasks: `_FORM_TO_NOMINATIVE.get(full_word)`, else the first column of
   the full word's `_ADJ_FORM_TO_FORMS` line, else `_STEM_TO_NOMINATIVE.get(stem)`. Noun rows are
   unchanged.
5. **Remove the duplicate-word cleanup** in `_generate_sentence_tasks` (it changes no current row,
   breaks adjective rows, and would break #62g's prefix rows).
6. **Generic grammar seed** — `backend/scripts/seed_grammar_program.py <data.json>`, data in
   `backend/data/grammar/programs/adjectives.json` (`"format": "adjectives"`), validators in
   `backend/scripts/grammar_validators.py` (`VALIDATORS = {"adjectives": validate_adjectives}`;
   #62g/#62h add theirs). The JSON holds the case rules, the sentences and the program. Behaviour:
   `--dry-run` validates without the DB and prints a sample of 10 sentences per case; the real run
   inserts rules (`status` `testing`) and sentences only for case indices that have **none** yet
   (re-runnable, never duplicates), and **upserts** the program by title (insert with `is_public`
   false, or update in place — never delete; enrollments reference it); `--reset` deletes and
   re-inserts the rules and sentences of the JSON's case indices only.
7. **Content** — 6 `GrammarCaseRule` rows (RU + EN `name`, `question`, `usage`, `endings_sg`,
   `endings_pl`, `transform`; `article_slug` `būdvardžiai-linksniavimas`, matching the article's
   declension types) and ~35 `GrammarSentence` rows per case (`use_in_basic/advanced/practice` true;
   RU + EN translations; blank on the adjective, the noun visible; m/f and sg/pl mixed; only
   adjectives from `adjectives.txt`). Program: `title` «Прилагательные», `title_en` "Adjectives", RU/EN
   description, `difficulty` 2, `lesson_filter` `["Būdvardžiai"]`, `program_type` `cases`.
   **Sources** (`documentation/content-sources.md`): start from Tatoeba (RU/EN translations included)
   and Common Voice (CC0) — filter the per-language exports (kept in `temp_files/`, not in git) for
   sentences with the target forms — then adapt to A2 and fix the translations; write the rest. Every
   sentence carries `"source": "tatoeba:<id>" | "commonvoice" | "own"` in the JSON (the seed ignores
   it; the validator requires it). If the `about-team` «Источники» credit (#62c Req 8) is not there
   yet, this plan adds it (user step).
8. **`validate_adjectives`** (also used by pytest): every sentence passes `_sentence_invariant_holds`;
   for every sentence, `_paradigm_forms(full_word)` equals its `adjectives.txt` line (≥ 4 distinct
   forms) and `base_lt` equals that line's first column; no `adjectives.txt` form appears in
   `words.txt` or `paradigms_extra.txt`; no duplicate `display`; ≥ 30 sentences per case, each case
   using ≥ 10 different adjectives and both numbers; every sentence has a `source`.
9. **Admin preview of hidden programs** — `GET /grammar-programs` also returns non-public programs to
   admins (each with `is_public`), and `POST /me/grammar-programs/{id}` lets an admin enroll in a
   non-public program; non-admins are unchanged (404). Spec updated.
10. **Stable program order** — `_grammar_programs` loads `.order_by(GrammarProgram.id)`, so the hero's
    «Начать с падежей» keeps picking «Литовские падежи».
11. **Admin `lesson_filter` select** — keeps its 4 labelled options and adds one option per config
    group not already covered, labelled with the group name (`["Būdvardžiai"]` → «Būdvardžiai»).
    #62g/#62h need no admin change.
12. **Knowledge check** — no code change: once published, lessons 106…136 join the topic pool as
    `g:<basic id>`; Recommendations map them to this program via `_program_lesson_ids`.
13. **Release order** (user step, `## Release`): after the deploy and the seed, make the program
    public and publish its six case rules **in the same pass** — rules published while the program is hidden would put
    the lessons into checks and the continue session with no program to recommend.

### SEO
- **S1 — no indexed page changes.** `/dashboard/grammar/` keeps its title, description and canonical;
  the `seo-snapshot` diff must be clean.
- **S2 — rule cards → article.** The six rules carry `article_slug` `būdvardžiai-linksniavimas`
  (Req 7), so every adjective lesson links to the existing article.
- **S3 — article → program** (user step, after release): append a short closing section «Потренируйтесь
  в Fluent» / "Practise in Fluent" to both bodies of `būdvardžiai-linksniavimas`, naming the six
  topics and linking to `/dashboard/grammar/`. Title, slug and the first 160 characters of both
  bodies (the meta description) stay byte-identical. **Timing gate:** not before the #48c RU-traffic
  check (~2026-10-24). The edit bumps `updated_at`, so IndexNow re-pushes it at the next deploy.
- **S4 — llms.txt** "## Grammar" lists the public grammar programs from the DB (`title_en` + lesson
  count) instead of the hard-coded noun-case sentence, so #62g/#62h appear automatically.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. (Only the admin select changes; the lesson UI is reused as is.)
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62f_grammar-adjectives.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the Grammar page program cards and topic list (`grammar/page.tsx`, `GrammarOverview.tsx`), `GrammarTaskRunner.tsx` task screens, `GrammarRuleCard`.
- **New part:** the adjective content: the rule card text and the «от: šiltas» hint.
- **States:** «Прилагательные» card and its topic list; a Basic task (4 forms + hint + rule card); an Advanced typed task with the collapsible rule; a Practice task; a wrong answer.
- **Content:** one real rule card (Kilmininkas) and 5 real draft sentences from Tatoeba / Common Voice.
- **Decide in the prototype:** the rule card's endings layout for adjectives (m/f × sg/pl), whether the hint also shows the gender.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62f_grammar-adjectives-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62f_grammar-adjectives.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62f_grammar-adjectives-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62f-baseline.json`.
- [ ] 2. `backend/scripts/build_adjective_paradigms.py` → `backend/data/grammar/adjectives.txt` (Req 3).
- [ ] 3. `backend/grammar_service.py` — load `adjectives.txt` (Req 3), `base_lt` lookup (Req 4),
  remove the duplicate-word cleanup (Req 5).
- [ ] 4. `backend/data/grammar/lessons.json` — Req 1, 2.
- [ ] 5. `backend/scripts/seed_grammar_program.py` + `backend/scripts/grammar_validators.py` +
  `backend/data/grammar/programs/adjectives.json` — Req 6, 7, 8.
- [ ] 6. `backend/routers/grammar.py` — Req 9 (admin list + enroll), Req 10 (ORDER BY).
- [ ] 7. `frontend/app/dashboard/admin/grammar/page.tsx` — Req 11.
- [ ] 8. `backend/main.py` llms.txt — S4.
- [ ] 9. Tests:
  - `backend/tests/test_grammar_adjectives.py` — `validate_adjectives` passes on the seed data; every
    `adjectives.txt` line has a unique first column; an adjective Basic task has 4 options from its
    own line and `base_lt` = its dictionary form; a noun sentence's `base_lt` and options are
    unchanged; a sentence whose full word reappears after the blank keeps its `display` byte-for-byte
    (cleanup removed); lesson ids 106–138 are < 200 and unique; with the rules `testing` a free
    user's `GET /grammar/lessons` has none of them and an admin's has all 18; with them `published`
    and the program public, `_program_lesson_ids` returns exactly the 18, and «Литовские падежи» —
    with its prod `lesson_filter` `["Vienaskaita","Daugiskaita"]` set in the test — none of them;
    the seed run twice inserts the sentences once and keeps the program id.
  - `backend/tests/test_programs.py` (or a new file) — an admin lists and enrolls in a hidden
    program; a free user gets neither (404 on enroll); `GET /grammar-programs` order is by id.
  - `backend/tests/test_knowledge_check.py` — with only these topics published: `build_check` can
    pick `g:106`, `gap_tasks` serves it with options, `recommendations` maps it to «Прилагательные».
  - `backend/tests/test_seo_files.py` — llms.txt lists the public grammar programs, not hidden ones.
  - `backend/tests/test_grammar_basic_options.py`, `test_grammar_practice_full_word.py` — still green.
  - `frontend/tests/grammar-adjectives.spec.ts` — Playwright, API mocked **incl.
    `/api/admin/grammar/config` with the new group**: the program card and its topic list on
    `/dashboard/grammar`; a Basic adjective task with 4 options and the «от: šiltas» hint; an
    Advanced typed task; a Practice task; a wrong answer; the hero's «Начать с падежей» still targets
    «Литовские падежи». Screenshots (Validation).
- [ ] 10. **STOP — user step.** Ask the user to review `adjectives.txt` and the sentence sample from
  `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/adjectives.json --dry-run`,
  then run it without `--dry-run` (prod: rules `testing`, program hidden). Restart the local backend
  (or wait 10 min) before the smoke. Users see nothing: the deployed code has no lessons for these case indices and the program is
  hidden. Until this plan is deployed, don't edit the new rules or sentences in the prod admin — the
  old code rejects case indices it doesn't know (admins only). Release: see `## Release`.
- [ ] 11. Docs/specs: `specs/grammar.md` — the #62f part of the idea's new-programs scenario, the
  `base_lt` adjective fallback, the removed cleanup, admin preview of hidden programs, program order;
  `specs/knowledge-check.md` — new grammar lessons join the pool; `specs/seo.md` — llms.txt grammar
  list; new `documentation/grammar-new-programs.md` (#62g/#62h append): the data-only approach, ids
  < 200, why not `_SEED_PROGRAMS`, why `adjectives.txt` is separate from `paradigms_extra.txt`, the
  generic seed's idempotency and why the program is never deleted, the release order, why the cleanup
  was removed, the diacritics limit at the typing levels; `documentation/IMPLEMENTATION.md` — the
  grammar data files and seed. Close-out: add
  `- <today> — release #62f: credit + program public + rules published once deployed (#62f)` to
  `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_grammar_adjectives.py tests/test_programs.py tests/test_grammar_basic_options.py tests/test_grammar_practice_full_word.py tests/test_knowledge_check.py tests/test_seo_files.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/adjectives.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Grammar page shows nothing new — the new program and its lessons are invisible.
- [ ] SEO diff clean (DoD command).
- [ ] Smoke (local, after the seed, as admin): the hidden «Прилагательные» is listed for the admin;
  enroll, run one Basic and one Practice lesson; «Литовские падежи» and «Числительные» look exactly as
  before.
- [ ] Screenshots in `temp_files/screenshots/plan_62f_grammar-adjectives/`, looked at and described:
  program card on the Grammar page, the program's topic list, a Basic task, an Advanced task with
  the rule card (article link visible), a Practice task, a wrong answer, the admin lesson-filter
  select — each in **RU and EN**, at **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62f_grammar-adjectives-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: Grammar page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/adjectives.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62f-baseline.json
ls temp_files/screenshots/plan_62f_grammar-adjectives/ | grep -c png   # expect >= 28 (7 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

No `## UAT verification`: the lesson UI is reused unchanged and the new behaviour is data plus small
backend rules; the backend tests drive the real generators, and the user reviews the content in step 10.

## Release

Merging ships the code; the program stays hidden and its case rules `testing` until these user
steps. Every state in between is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render; the seed has run.
2. **Credit first:** if the `about-team` article has no «Источники» / "Sources" section yet, add it
   (text in `documentation/content-sources.md`) — the sentences include Tatoeba-derived ones. Exempt
   from the #48c timing gate (a licence attribution, not an SEO change).
3. **One pass, never half:** make «Прилагательные» public **and** publish its 6 case rules in the
   admin grammar page. A public program with unpublished rules would show no lessons; published rules
   with a hidden program would put the lessons into checks and the continue session with no program
   to recommend.
4. **Verify** as a free user: the program is listed; after enrolling, the first lesson is open and a
   Basic task has 4 options and the «от: …» hint; a new knowledge check can include one of its topics.
5. **Article** (after the #48c timing gate, ~2026-10-24): append «Потренируйтесь в Fluent» / "Practise in Fluent" to `būdvardžiai-linksniavimas` (S3).
6. **Record:** "released YYYY-MM-DD" on the #62f row in `documentation/CHANGELOG.md`, delete the
   reminder, then the news post.

**Rollback:** hide the program **and** set its rules back to `testing` (both, for the same reason as
step 3); enrollments and results stay. **Abandon before release:** leave both hidden — users never
see them.
