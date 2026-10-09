---
kind: feature
status: draft
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: null
confirmed_effort: null
uat_rounds: 0
max_uat_rounds: 3
---

# #62c — Practice: "Диалоги" (pick the reply at each turn)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 3 of 8.**
Branch `feat/62c-practice-dialogues`. **Depends on #62a merged and deployed** (its empty-category
rule must be live in prod before this plan seeds) **and #62b merged** (#62a: the check,
`DialogueText` in `frontend/app/dashboard/components/`, ordered practice blocks, empty-passage
handling; #62b: empty categories hidden, the generic insert-only seed
`scripts/seed_practice_category.py` + `scripts/practice_validators.py`,
`documentation/practice-formats.md`).

The A2 exam has a dialogue task: a scene ("at the pharmacy: pharmacist and customer"), the other
person's lines, and at each of your turns you pick the right reply. The user placed it in Practice as
a new category, not in Phrases (idea, Q5: an exam format, not phrase SRS).

How Practice serves a test today (`backend/routers/practice.py`):
- `GET /practice/tests/{id}/exam` loads the cached test + active questions (`_load_exam`, **no
  ORDER BY**) and returns `random.sample(active, count)` — random subset, random order. A dialogue
  needs **every turn, in order**.
- A test has no notion of type. Admin create/update models are `TestIn`/`TestUpdate`; the admin
  lists `admin_list_category_tests` (`:587`) and `admin_list_tests` (`:635`) return `is_final` but
  would not return a new column; export/import (`admin_export_test`, `admin_import_test`) carry
  neither `kind` nor `lesson_text_lt` today (a later gap text would lose its text on a round trip).
- The admin practice editor is `frontend/app/dashboard/admin/page.tsx` (`PracticeTestRow` `:117`,
  `BLANK_TEST` `:164`, `saveEditTest`).
- The student page `frontend/app/dashboard/practice/[id]/page.tsx` defines its own `Question` /
  `ActiveTest` types (`:100-115`); the question card shows `q.question_lt ?? q.question_ru` as plain
  text (`:536`) and the result review repeats it (`~:660`). `PracticeTestSummary` lives in
  `frontend/lib/api.ts`.
- `DialogueText` renders `**Name:** line` with a speaker badge — the dialogue screen composes its
  transcript in that format and reuses it, no new component.

Schema change = Alembic, as #55 did for `practice_test` columns (prod `alembic_version` = head
`a1b2c3d4e5f7` on 2026-10-08). Local runs share the prod DB, so the migration runs on prod **first**,
with the user's approval; the column has a server default, so the running prod code ignores it
(#48b precedent). Pick a fresh revision id and grep `backend/migrations/` for it first
(`documentation/local-dev-gotchas.md`).

Practice is out of search (`noindex` + `Disallow`, see #62b) — no SEO surface changes here.

Model/effort: opus/high — a prod migration, a new serving rule, a new question-screen mode and a
new knowledge-check builder.

## Goals
- A new Practice category «Диалоги» / "Dialogues" with 10 dialogues (pharmacy, shop, doctor, bus
  station, café, hotel, post office, phone booking, renting a flat, meeting a friend), 5–6 turns each.
- A dialogue runs as a chat: the conversation so far, the other speaker's line, 4 candidate replies;
  after each answer the correct reply joins the conversation.
- Admins can set a test's kind; listing, editing, export and import keep it.
- Dialogue turns can appear in the knowledge check and in "Close the gaps", in order.
- No indexed page changes.
- RU + EN, desktop and 375px.

## Non-Goals
- Audio for dialogues.
- Dropdown-per-turn "all turns at once" layout (one turn per screen, like every practice test).
- Free-text replies.
- The `gap_text` kind (#62d adds it to the allowed set).

## Requirements

1. **Schema** — `practice_test.kind`: `VARCHAR(20) NOT NULL DEFAULT 'choice'` (Alembic, parent =
   current head; today `a1b2c3d4e5f7`). Model mirrors `is_final`'s pattern:
   `kind: str = Field(default="choice", max_length=20, sa_column_kwargs={"server_default": text("'choice'")})`.
   Allowed values in this plan: `choice`, `dialogue` (module constant `TEST_KINDS`; #62d adds `gap_text`).
2. **Admin** — `TestIn`/`TestUpdate` accept `kind`; anything outside `TEST_KINDS` → 400.
   `admin_list_category_tests` and `admin_list_tests` return `kind`. In `admin/page.tsx`,
   `PracticeTestRow`, `BLANK_TEST` and `saveEditTest` carry `kind`, and the test form gets a kind
   select (labels in i18n), so editing a dialogue never resets it to `choice`. Export writes `kind`
   and `lesson_text_lt`; import reads both (`kind` default `choice`, unknown → 400).
3. **Serving** — `_load_exam` orders questions by `(sort_order, id)`. `GET /practice/tests/{id}/exam`:
   `kind == "choice"` keeps today's `random.sample`; any other kind returns **all** active questions
   in stored order. The response's `test` object gains `kind`; `GET /practice/categories/{id}/tests`
   summaries gain `kind` (+ `PracticeTestSummary.kind` in `frontend/lib/api.ts`, `ActiveTest.test.kind`
   in `practice/[id]/page.tsx`).
4. **Dialogue data** — one test per dialogue: `title_ru`/`title_en` = the scene («В аптеке» /
   "At the pharmacy"), `description_ru`/`description_en` = who talks to whom, `kind` `dialogue`,
   `question_count` = number of turns, `pass_threshold` 0.7, `is_premium` false, `status` `testing`
   at seed. Each turn = one question in `sort_order`: `question_lt` = the other speaker's line(s) as
   `**Name:** text` (e.g. `**Vaistininkė:** Ką jaučiate?`), `question_ru` = same text,
   `option_a`–`option_d` = 4 distinct candidate replies (A2), `correct_option` a–d spread across the
   letters. Distractors are plausible: replies from other turns of the same scene or near-misses.
   **Sources** (`documentation/content-sources.md`): lines come from Tatoeba where a natural one
   exists — filter the Lithuanian export (https://downloads.tatoeba.org/exports/, kept in
   `temp_files/`, not in git) for the scene's words — adapted to the scene and A2; the rest is written
   for Fluent. Every turn and option carries `"source": "tatoeba:<id>"` or `"own"` in the JSON (the
   seed ignores the key; the validator requires it).
5. **Dialogue screen** — when `activeTest.test.kind === 'dialogue'`, the question view builds a
   markdown transcript — every previous turn's line, then `**Jūs:** <its correct reply>` (whatever the
   student picked, so the story stays coherent), then the current line — and renders it with
   `DialogueText` above the existing options list. Options, submit, feedback, next, result and score
   posting stay as today. The result review renders a dialogue question's text with `DialogueText`
   too (no raw `**`). «Jūs» is part of the Lithuanian content, not translated.
6. **Knowledge check** — `PRACTICE_TASK_BUILDERS["dialogue"]` in `backend/knowledge_check_service.py`:
   from one random free published dialogue test of the category, 2 random turns **returned in stored
   order**; each becomes a `reading` task with `passage_lt` = the transcript before that turn (same
   format as Req 5; empty for turn 1), `question_lt` = the turn's line, `options` = its 4 replies,
   `answer` = the correct one. #62a keeps the 2 tasks as one ordered block in both the check and the
   gaps run. The practice-topic picker uses the builder of the chosen test's `kind`.
7. **Seed** — `backend/data/practice/dialogues.json` (`"format": "dialogue"`) through #62b's
   `seed_practice_category.py`; new `validate_dialogue` in `practice_validators.py`. Category:
   `name_ru` «Диалоги», `name_en` "Dialogues", `sort_order` 12, one-line RU/EN description.
   Validator: 10 tests, all `kind` `dialogue`; 5–6 turns each; every `question_lt` matches
   `^\*\*[^*]+:\*\* .+`; 4 non-empty, distinct options; `correct_option` in a–d and not the same
   letter on every turn of a dialogue; a `source` on every turn and option; RU + EN titles. The
   generic seed writes `kind`.
8. **Credit** — if not already there, the `about-team` article gets a short closing section
   «Источники» / "Sources" (RU + EN): "Example sentences: Tatoeba (tatoeba.org), CC BY 2.0 FR; Mozilla
   Common Voice (CC0)". User step in the admin editor; appended at the end, so the meta description
   is untouched; same timing gate as other article edits (~2026-10-24).

### SEO
- Practice stays out of the index (#62b S1): no sitemap entry, no robots/metadata change; the
  `seo-snapshot` diff must be clean. llms.txt lists the category automatically (#62b S2).

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. The transcript reuses `DialogueText`'s existing speaker styling.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62c_practice-dialogues.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the question screen and result review of `practice/[id]/page.tsx`, `DialogueText` speaker badges, the knowledge-check runner's `reading` task (from #62a).
- **New part:** the dialogue transcript (the other speaker's lines + «Jūs» replies) above the options.
- **States:** turn 1; mid-dialogue; a wrong pick (feedback, then the transcript continues with the correct reply); last turn; result review (no raw `**`); a dialogue task in the knowledge-check runner; 375px with a long transcript.
- **Content:** one real dialogue (the pharmacy scene) built from Tatoeba lines per `documentation/content-sources.md`.
- **Decide in the prototype:** «Jūs» bubble look and alignment, how a wrong pick is shown, transcript scrolling on mobile.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62c_practice-dialogues-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62c_practice-dialogues.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62c_practice-dialogues-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62c-baseline.json`.
- [ ] 2. `backend/migrations/versions/<id>_add_practice_test_kind.py` + `backend/models.py` (Req 1).
  **STOP — user step:** ask the user to approve and run
  `cd backend && .venv/bin/python -m alembic upgrade head` against the shared (prod) DB. Nothing
  below that reads the column runs until it is done.
- [ ] 3. `backend/routers/practice.py` — `TEST_KINDS`, Req 2 (create/update, both admin lists,
  export/import incl. `lesson_text_lt`), Req 3 (`_load_exam` ORDER BY, kind-aware sampling, `kind`
  in the exam and summary payloads).
- [ ] 4. `frontend/lib/api.ts` (`PracticeTestSummary.kind`) + `frontend/app/dashboard/admin/page.tsx`
  (`PracticeTestRow`, `BLANK_TEST`, `saveEditTest`, kind select) — Req 2–3.
- [ ] 5. `frontend/app/dashboard/practice/[id]/page.tsx` — `ActiveTest.test.kind`, Req 5.
- [ ] 6. `backend/data/practice/dialogues.json` + `validate_dialogue` in
  `backend/scripts/practice_validators.py`; the generic seed writes `kind` — Req 4, 7.
- [ ] 7. `backend/knowledge_check_service.py` — Req 6 builder (no id to wire: the category joins
  #62a's pool by itself when its tests are published).
- [ ] 8. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — kind select labels; any new screen string.
- [ ] 9. Tests:
  - `backend/tests/test_practice_dialogues.py` — `validate_dialogue` passes on `dialogues.json` and
    fails on broken copies; a `dialogue` test's exam returns every active question in `sort_order`;
    a `choice` test still samples `question_count`; create/update with `kind="nope"` → 400; both
    admin lists return `kind`; updating a dialogue test without `kind` keeps it; export→import
    round-trips `kind` and `lesson_text_lt`; import without `kind` → `choice`.
  - `backend/tests/test_knowledge_check.py` — a dialogue category in the pool yields 2 `reading`
    tasks in stored turn order whose passages hold the earlier turns with the correct replies, 4
    options each; the gaps run keeps them in order; the category joins the pool when a dialogue is
    published, with no code change.
  - `frontend/tests/practice-dialogues.spec.ts` — Playwright, API mocked: the transcript grows turn by
    turn; after a **wrong** pick the transcript shows the **correct** reply; no raw `**` anywhere
    (question card, result review); result screen; the admin form shows and keeps the kind; a dialogue
    `reading` task in the knowledge-check runner shows the speaker badges. Screenshots (Validation).
- [ ] 10. **STOP — user step.** Ask the user to review `dialogues.json` (natural Lithuanian, one
  clearly right reply per turn) and run
  `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/dialogues.json --dry-run`
  then without `--dry-run` (prod, tests land as `testing`). Users see nothing (#62a hides the
  category; the column default keeps the running code working). Until this plan is deployed, don't
  open or edit the new tests on fluent.lt — the old code samples and shuffles their turns and shows
  raw `**` (admins only). Draft the Req 8 credit in `temp_files/articles/about-team-sources.md`
  (RU + EN) for the Release.
- [ ] 11. Docs/specs: `specs/practice.md` — the #62c scenarios from the idea (dialogue test, admin
  sets kind, export/import keep kind and text) and the changed exam-serving rule;
  `specs/knowledge-check.md` — dialogue builder and order; `documentation/practice-formats.md` — the
  `kind` column, why non-choice tests are served whole and ordered, why the transcript shows the
  correct reply, «Jūs» not translated; component library — the dialogue transcript (DialogueText
  reuse); `documentation/IMPLEMENTATION.md` — `kind` and where it is read. Close-out: add
  `- <today> — release #62c: credit + publish the dialogues once deployed (#62c)` to
  `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_practice_dialogues.py tests/test_practice_tfns.py tests/test_practice_bento.py tests/test_knowledge_check.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/practice-dialogues.spec.ts tests/practice-tfns.spec.ts tests/practice-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/dialogues.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Practice page shows nothing new — the new category is invisible.
- [ ] Prod schema check after the user's migration: `practice_test.kind` exists with default `choice`
  (read-only query via `information_schema.columns`).
- [ ] SEO diff clean (DoD command).
- [ ] Smoke (local, after the seed): as admin, run one dialogue end to end with one wrong answer; edit
  the dialogue test in the admin panel and save — it stays a dialogue; a "Чтение" test still shuffles
  and samples as before.
- [ ] Screenshots in `temp_files/screenshots/plan_62c_practice-dialogues/`, looked at and described:
  first turn, mid-dialogue transcript, wrong-answer feedback with the correct reply in the transcript,
  result screen, admin kind select, a dialogue task in the knowledge-check runner — each in **RU and
  EN**, at **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62c_practice-dialogues-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: practice page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/dialogues.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/practice-dialogues.spec.ts tests/practice-tfns.spec.ts tests/practice-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62c-baseline.json
ls temp_files/screenshots/plan_62c_practice-dialogues/ | grep -c png   # expect >= 24 (6 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/practice`, logged in as a
local admin test user (token in `localStorage('fluent_token')`), real local backend on :8000, after
the user has run the migration and the seed.

**Scenarios:**
1. Open Practice → «Диалоги» → the pharmacy dialogue.
2. Answer the first turn correctly and the second turn wrongly on purpose; continue to the end.
3. Open the same dialogue again and compare the order of the turns.
4. Switch the UI to English; resize to 375px wide.

**Acceptance criteria:**
- [ ] The category lists 10 dialogues.
- [ ] Each turn shows the conversation so far and four possible replies.
- [ ] After a wrong pick, the conversation continues with the correct reply, not the wrong one.
- [ ] The turns come in the same order on every run.
- [ ] No formatting symbols (like `**`) are visible anywhere in the dialogue or on the result screen.
- [ ] Finishing shows a result screen with the score.
- [ ] Titles appear in English in the English UI; the dialogue itself stays Lithuanian.
- [ ] At 375px nothing overflows horizontally.

## Release

Merging ships the code; the dialogues stay `testing` until these user steps. Every state in between
is consistent for users (category hidden, out of the knowledge check).

1. **Preconditions:** this plan is merged, pushed and live on Render; the migration (step 2) and the
   seed (step 10) have run.
2. **Credit first:** if the `about-team` article has no «Источники» / "Sources" section yet, paste it
   from `temp_files/articles/about-team-sources.md` (RU + EN, appended at the end). Tatoeba-derived
   lines must never be public without it. This edit is exempt from the #48c timing gate: a licence
   attribution at the end of the page, not an SEO change.
3. **Publish:** set the 10 dialogue tests to `published`.
4. **Verify** as a free user: the category lists 10 dialogues; one runs end to end with the turns in
   order; a new knowledge check can include a dialogue block.
5. **Record:** "released YYYY-MM-DD" on the #62c row in `documentation/CHANGELOG.md`, delete the
   reminder, then the news post.

**Rollback:** set the tests back to `testing` (the credit can stay). **Abandon before release:** leave
the category hidden or delete it in the admin panel; the `kind` column stays harmless (default `choice`).
