---
kind: feature
status: draft
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: medium
confirmed_model: null
confirmed_effort: null
uat_rounds: 0
max_uat_rounds: 3
---

# #62b — Practice: "Верно / Неверно / Не сказано" (True / False / Not stated)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 2 of 8.**
Branch `feat/62b-practice-true-false-not-stated`. **Depends on #62a being merged and deployed**
(#62a hides categories with nothing published from users, so this plan can seed its hidden category
into the shared prod DB before its own deploy; the check's pool picks the category up by itself once
its tests are published; `DialogueText` lives in `frontend/app/dashboard/components/`).

The A2 exam's reading part asks "Tiesa / Netiesa / Nepasakyta" (true / false / not stated) about a
short text. Fluent's "Чтение" category (id 2) is already the 2-option version: all 128 questions have
`option_a` «Teisingas», `option_b` «Neteisingas», `option_c`/`option_d` = "" (seeded by
`backend/scripts/seed_skaitymas_new.py`, `pass_threshold` 0.7, mostly 6 questions per test). The user
chose a **separate category** for the 3-option format (idea, Decisions).

What already works, so this is mostly content:
- `frontend/app/dashboard/practice/[id]/page.tsx` hides empty options
  (`OPTIONS.filter((opt) => getOptionText(q, opt).trim() !== '')`), so a 3-option question renders
  with no UI change.
- Admin question create/update and JSON import already accept an empty `option_d`
  (`backend/routers/practice.py` `QuestionIn`, `admin_import_test`).
- The reading screen shows `lesson_text_lt` before the questions (spec "reading view before a test").

Gaps found while planning:
1. **The text disappears during the questions.** The question view (`view === 'question'`) never
   shows `lesson_text_lt`. For "Nepasakyta" the student must re-check the text, as in the real exam.
   Texts can be long: Конституция tests carry up to 7,060 chars.
2. **Empty categories** were visible to users ("0 tests" card) — fixed by #62a (Req 11 there), which
   is live before this plan seeds anything.
3. **Seeding.** Prod writes are the user's step (memory: an admin JWT and SQL inserts into Neon are
   blocked for Claude). The precedents (`seed_skaitymas_new.py`, `seed_numbers_program.py`) have a
   `--reset` that deletes tests — that fails on Postgres once anyone has a `practice_exam_result`
   (FK; SQLite tests don't enforce it, memory "Tests don't enforce foreign keys"). So this plan adds
   **one generic, insert-only seed script** that #62c–#62e reuse with their own JSON.

SEO facts (`documentation/seo.md`): `/dashboard/practice/` is deliberately out of search —
`practice/layout.tsx` sets `robots: { index: false, follow: false }`, `robots.txt` has
`Disallow: /dashboard/practice/`, and no practice URL is in the sitemap. `/llms.txt` lists programs,
lists, grammar and articles, but not Practice.

Model/effort: opus/medium — the code is small, but 10 correct, natural A2 Lithuanian texts with
unambiguous "not stated" statements need the stronger model.

## Goals
- A new Practice category "Верно / Неверно / Не сказано" / "True / False / Not stated" with 10 tests:
  each a short A2 text plus 6 statements answered Tiesa / Netiesa / Nepasakyta.
- During any test with a text, the text stays available in a collapsible, height-capped block above
  the question.
- The category joins the knowledge check's practice pool (#62a) by itself once its tests are
  published — no code change after seeding.
- Every intermediate state is consistent for users: before release they see nothing new.
- No indexed page changes; llms.txt starts listing the exam-format practice.
- RU + EN, desktop and 375px.

## Non-Goals
- Changing the "Чтение" questions (they stay 2-option True/False).
- Opening `/dashboard/practice/` to search engines.
- Server-side grading of practice tests (existing pattern: client posts score/total).
- A new admin UI: the existing test/question editor covers this content.
- A table-style "all statements at once" layout (one statement per screen, like every practice test).

## Requirements

1. **Category** `practice_category`: `name_ru` «Верно / Неверно / Не сказано», `name_en`
   "True / False / Not stated", `description_ru`/`description_en` (one line: "Read a short text and
   decide for each statement: true, false or not stated in the text."), `sort_order` 11 (after
   "Чтение" = 10), no `source_url`.
2. **Tests** — 10, each: `title_ru`/`title_en` (topic, e.g. «Мои соседи» / "My neighbours"),
   `lesson_text_lt` 80–150 words of A2 Lithuanian (everyday topics from the exam: home and
   neighbours, shop or office notice, a letter to a friend, a weekend, work, health, travel, weather,
   family, an advertisement), `question_count` 6, `pass_threshold` 0.7 (same as "Чтение"),
   `is_premium` false, `status` **`testing`** at seed time, no section. Texts are written for Fluent —
   no openly licensed A2 texts exist (`documentation/content-sources.md`); the format follows the NŠA
   samples without copying them.
3. **Statements** — 6 per test: `question_lt` = the statement (one sentence, A2), `question_ru` = the
   same Lithuanian text (Reading's convention); `option_a` «Tiesa», `option_b` «Netiesa», `option_c`
   «Nepasakyta», `option_d` ""; `correct_option` a/b/c. Every test has at least one of each answer.
   "Nepasakyta" statements must be plausible but neither confirmed nor contradicted by the text.
4. **Text during questions** — in the question view, when the active test has `lesson_text_lt`,
   render it above the question card in a native `<details>` (summary = existing `t.textLabel`
   «Текст» / "Text"), closed by default, body via `DialogueText` inside a block capped at
   `max-h-[40vh]` with `overflow-y-auto`. Applies to every category with texts ("Чтение",
   Конституция). The reading screen before the test is unchanged.
5. **Empty categories** — nothing to build: #62a already hides a category with no visible test from
   non-admins (this plan relies on it).
6. **Generic seed** — `backend/scripts/seed_practice_category.py <data.json>` (`--dry-run` validates
   and prints counts without touching the DB). Insert-only: if a category with the same `name_ru`
   exists, it prints its id and changes nothing; otherwise it inserts the category, tests and
   questions in one transaction and prints the new category id. **No `--reset`** (FK, Context 3);
   later fixes go through the admin editor. The JSON has a `"format"` key; validators live in
   `backend/scripts/practice_validators.py` (`VALIDATORS = {"tfns": validate_tfns}`; #62c–#62e add
   theirs). `validate_tfns`: 10 tests; text length 400–1200 chars; exactly 6 statements per test;
   options exactly as Req 3; each of a/b/c at least once per test; no duplicate statements; RU + EN
   titles present.
7. **Knowledge check** — nothing to wire: #62a's pool takes every category with a free published
   test (except Конституция), so the category joins at release and stays out while its tests are
   `testing`. Its questions use #62a's `"choice"` builder (3 non-empty options → a 3-option
   `reading` task).

### SEO
- **S1 — Practice stays out of the index** (deliberate, see Context): no change to
  `practice/layout.tsx` robots, the `Disallow`, or the sitemap; the new category adds no indexed URL.
  The `seo-snapshot` diff must be clean (no RU title/description/canonical change anywhere).
- **S2 — llms.txt** gains a dynamic `## Exam-format practice` section: every practice category a
  guest can see (#62a's visibility rule), as `- <name_en> (<N> tests)`, plus one line that the formats mirror
  the A2 exam's reading part. #62c–#62e appear in it automatically.
- **S3 — search traffic** for exam formats comes from the `prepare-for-lithuanian-a2` article update
  in #62e, once all four formats exist (not here).

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. The new `<details>` block uses tokens (`border-line`, `rounded-[14px]`, `text-muted`), even though the surrounding legacy page still uses raw steps — record that in "Deliberate deviations" only if it ends up looking inconsistent.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62b_practice-true-false-not-stated.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the reading screen and question screen of `frontend/app/dashboard/practice/[id]/page.tsx` (card, options rows, feedback colours, buttons), `DialogueText`, the category card of the Practice page (`PracticeOverview` / bento).
- **New part:** the collapsible text block during questions; a 3-option Tiesa / Netiesa / Nepasakyta question.
- **States:** category card in the Practice list; reading screen; question with the text closed; text open; a Конституция question with its long text open (cap + scroll); answered correct; answered wrong; result screen.
- **Content:** one real draft test (text + 6 statements) — it becomes the first test of `tfns.json` — and one real Конституция text for the long case.
- **Decide in the prototype:** block position (above the question card), closed vs open by default, cap height on desktop and at 375px.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62b_practice-true-false-not-stated-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62b_practice-true-false-not-stated.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62b_practice-true-false-not-stated-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62b-baseline.json`.
- [ ] 2. `backend/data/practice/tfns.json` — `"format": "tfns"`, the category, 10 tests and 60
  statements (Req 1–3). Keep the language A2: present/past tense, common words, short sentences.
- [ ] 3. `backend/scripts/seed_practice_category.py` + `backend/scripts/practice_validators.py` — Req 6.
- [ ] 4. `frontend/app/dashboard/practice/[id]/page.tsx` — Req 4.
- [ ] 5. `backend/main.py` llms.txt — S2.
- [ ] 6. Tests:
  - `backend/tests/test_practice_tfns.py` — `validate_tfns` passes on `tfns.json` and fails on broken
    copies (a missing "c" answer, 5 statements, a 4th option); the seed's insert path on the SQLite
    test DB creates 1 category / 10 tests / 60 questions, all `testing`, and a second run inserts
    nothing; right after the seed a guest and a free user don't see the category (#62a's rule);
    `GET /practice/tests/{id}/exam` returns a 3-option question unchanged (`option_d` "").
  - `backend/tests/test_seo_files.py` — llms.txt lists a published category and omits a
    `testing`-only one.
  - `backend/tests/test_knowledge_check.py` — the seeded category (all `testing`) is never picked;
    after publishing one test, with **no code change**, a check can yield 2 `reading` tasks from it
    with exactly 3 options.
  - `frontend/tests/practice-tfns.spec.ts` — Playwright, API mocked (categories, the category's
    tests, the exam with a passage and 3-option questions): 3 options render (no empty 4th row); the
    `<details>` text block exists on the question screen, closed by default, opens on click and
    scrolls inside its cap with a long text; answer feedback; result screen. Screenshots (Validation).
- [ ] 7. **STOP — user step.** Ask the user to review `backend/data/practice/tfns.json` (Lithuanian
  quality, "not stated" statements) and run
  `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/tfns.json --dry-run`
  then without `--dry-run` (writes to prod; tests land as `testing`, so only admins see them; users
  see nothing because of #62a's rule). Until this plan is deployed, don't open the new tests on
  fluent.lt — the old code shows them without the text block (admins only).
- [ ] 8. Docs/specs: `specs/practice.md` — the #62b scenarios from the idea (new statement scenario,
  changed "reading view before a test"); `specs/knowledge-check.md` — the pool will include the
  category once published; `specs/seo.md` — llms.txt lists practice; new
  `documentation/practice-formats.md` — the format, why one statement per screen, why the category is
  separate from "Чтение", the empty-category rule, the insert-only seed and why no `--reset`, the
  staged rollout (seed hidden → deploy → release) and why every step is safe for users, why Practice
  stays noindex (#62c–#62e append to this file); component library — the collapsible text block;
  `documentation/IMPLEMENTATION.md` — seed script + validators. Close-out: add
  `- <today> — release #62b: publish the 10 tests once deployed (#62b)` to `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_practice_tfns.py tests/test_practice_bento.py tests/test_seo_files.py tests/test_knowledge_check.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/practice-tfns.spec.ts tests/practice-bento.spec.ts tests/seo-public-pages.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/tfns.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Practice page shows nothing new — the new category is invisible.
- [ ] SEO diff clean (DoD command); `curl localhost:8000/llms.txt` shows the practice section.
- [ ] Smoke (local server, after the user's seed): as admin, open the new category, take one test
  end to end; the text block works during questions. As a free user the category is not listed
  until the user publishes a test.
- [ ] Screenshots in `temp_files/screenshots/plan_62b_practice-true-false-not-stated/`, looked at and
  described: category in the practice list, reading screen, question with the text closed, question
  with the text open + answer feedback, a Конституция question with its long text open (cap +
  scroll), result screen — each in **RU and EN**, at **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62b_practice-true-false-not-stated-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: practice page nav, header, footer intact; "Чтение" still works.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/tfns.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/practice-tfns.spec.ts tests/practice-bento.spec.ts tests/seo-public-pages.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62b-baseline.json
ls temp_files/screenshots/plan_62b_practice-true-false-not-stated/ | grep -c png   # expect >= 24 (6 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/practice`, logged in as a
local admin test user (token in `localStorage('fluent_token')`), real local backend on :8000, after
the user has run the seed.

**Scenarios:**
1. Open Practice, find the "Верно / Неверно / Не сказано" category, open its first test.
2. Read the text, go to the questions, open the text block during a question, answer all 6.
3. Switch the UI to English and open the category again; resize to 375px wide.

**Acceptance criteria:**
- [ ] The category is listed and has 10 tests.
- [ ] Each statement offers exactly three answers: Tiesa, Netiesa, Nepasakyta.
- [ ] During the questions the text can be opened and closed above the question, and a long text
  scrolls inside its block instead of pushing the question off screen.
- [ ] Finishing shows a result screen with the score.
- [ ] Category and test titles appear in English in the English UI.
- [ ] At 375px nothing overflows horizontally.

## Release

Merging ships the code; the 10 tests stay `testing` (hidden from users, out of the knowledge check)
until these user steps. Every state in between is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render; the seed (step 7) has run.
2. **Publish:** in the admin panel set the category's 10 tests to `published`.
3. **Verify** as a free user (or a private window): the category is listed with 10 tests; one test
   runs end to end with the text block; a new knowledge check can draw from the category.
4. **Record:** add "released YYYY-MM-DD" to the #62b row in `documentation/CHANGELOG.md`, delete the
   reminder line, then the news post.

**Rollback:** set the tests back to `testing` — the category disappears for users and leaves the
check pool; nothing else changes. **Abandon before release:** leave the category hidden or delete it
in the admin panel (no results exist yet).

