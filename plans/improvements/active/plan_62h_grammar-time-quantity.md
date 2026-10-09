---
kind: feature
status: draft
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: medium
confirmed_model: null
confirmed_effort: null
---

# #62h — Grammar: "Время и количество" (telling the time + quantity + Genitive)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 8 of 8.**
Branch `feat/62h-grammar-time-quantity`. **Depends on #62a and #62f being merged** (#62f: the
generic seed + validators, admin preview of hidden programs, generated admin group options, the
llms.txt grammar list, `documentation/grammar-new-programs.md`). #62g is not needed but merges first
by order.

The exam asks "Kelinta valanda?" and quantity phrases with the Genitive («puodelis kavos»,
«kilogramas obuolių»). The user grouped both into one program (idea: both are numbers + Genitive).
The Numbers program already has «Laikas: Galininkas (kelintą valandą?)» (case 19, "at what time",
e.g. «Susitinkame treč___ valandą.» → «trečią») — **it stays there**.

**Which clock system.** Fluent's own article **`numbers-03-time`** («Время по-литовски: часы,
полчаса и расписания», RU + EN) teaches the **ordinal** system only: whole hours «Dabar trečia
valanda» (Vardininkas), halves «pusė ketvirtos» (pusė + ordinal Genitive), working hours «nuo
aštuntos iki penktos» (nuo/iki + ordinal Genitive). It does not teach be/po ("five to", "ten past").
The exercises follow the article exactly, so the article and the lessons never disagree and no blank
has two valid answers (a cold review flagged cardinal/ordinal mixes as ambiguous at Practice level,
where the stem is stripped). be/po can come later, after the article gains a section on it.
The article's working-hours table pairs «dvylikta» with «**dvylikos**» while every other row is
-a → -os (pirma → pirmos, aštunta → aštuntos); «dvyliktos» looks right — flagged for the user (S3).

Data facts checked while planning:
- `backend/data/grammar/paradigms_extra.txt` has lines for ordinals 1st–20th + 30th (pirmas,
  antras, trečias… dvidešimtas) — every time blank is an ordinal, so every Basic task has options.
  `paradigms_extra.txt` is not changed.
- `backend/data/grammar/words.txt` (72 noun rows: stem + 14 endings + EN + RU, `!` marks a missing or
  irregular form) has obuolys, vanduo, agurkas and **morka** — but not kava, pienas, duona, sviestas,
  cukrus, druska, sūris, arbata, vynas, mėsa, saldainis, kiaušinis, bulvė, pomidoras. Quantity
  sentences need their nouns there for Basic options and the «от: …» hint. New rows also join
  `_FORM_TO_ROW` / `_FORM_TO_NOMINATIVE`, where a shared form would make an **existing** noun's form
  ambiguous and silently drop its options — a deterministic no-overlap test guards that.

**SEO**: `/dashboard/grammar/` metadata unchanged (client-loaded programs). Rule cards link to
`numbers-03-time` (time) and `daiktavardžiai-linksniavimas` (quantity, the Genitive endings — as the
existing Kilmininkas cases do).

Model/effort: opus/medium — ~110 sentences and ~14 noun paradigms; no generator change.

## Goals
- A new grammar program «Время и количество» / "Time and quantity" with 4 topics at Basic /
  Advanced / Practice: "Kelinta valanda?"; pusė / nuo … iki; quantity + Genitive singular; quantity +
  Genitive plural.
- Basic tasks offer 4 forms of the same numeral or noun.
- The lessons teach the same system as the `numbers-03-time` article.
- Ships hidden until the user publishes it; admins can preview it (#62f).
- RU + EN, desktop and 375px.

## Non-Goals
- Moving or changing case 19 («kelintą valandą?») or any Numbers lesson.
- be/po minute expressions (not in the article yet).
- Paradigm lines for 10–19 / dešimt / tens (would change existing Numbers tasks — the #60 header's call).
- Clock-face pictures.

## Requirements

1. **Case indices 31–34**, group `Laikas ir kiekis`: 31 `Laikas: Kelinta valanda? (Vardininkas)`,
   32 `Laikas: pusė, nuo … iki (Kilmininkas)`, 33 `Kiekis: Kilmininkas Vns.`, 34 `Kiekis: Kilmininkas
   Dgs.`. **Lessons**: basic ids 166, 172, 178, 184 (+1 advanced, +2 practice), task counts 24 / 35 / 20.
2. **Nouns** — add rows to `words.txt` for every noun a quantity sentence blanks that is not there yet
   (~14: kava, pienas, duona, sviestas, cukrus, druska, sūris, arbata, vynas, mėsa, saldainis,
   kiaušinis, bulvė, pomidoras), full 14-ending paradigm, `!` for forms that don't exist, EN + RU.
3. **Content** — `backend/data/grammar/programs/time_quantity.json` (`"format": "time_quantity"`)
   through #62f's generic seed: 4 rule cards (`status` `testing`, RU + EN, wording consistent with
   `numbers-03-time`: ordinal feminine for hours, «pusė» + Gen of the *next* hour, nuo/iki + Gen,
   container/measure word + Gen sg/pl; `article_slug` `numbers-03-time` for 31–32 and
   `daiktavardžiai-linksniavimas` for 33–34), ~28 sentences per topic with RU + EN translations (time
   given in digits, e.g. «Сейчас 3:30» / "It's 3:30", so the student builds the Lithuanian), and the
   program: `title` «Время и количество», `title_en` "Time and quantity", RU/EN description,
   `difficulty` 2, `lesson_filter` `["Laikas ir kiekis"]`, `program_type` `cases`.
   **Sources** (`documentation/content-sources.md`): start from Tatoeba (RU/EN translations included)
   and Common Voice (CC0) — filter the per-language exports (kept in `temp_files/`, not in git) for
   sentences with the target forms — then adapt to A2 and fix the translations; write the rest. Every
   sentence carries `"source": "tatoeba:<id>" | "commonvoice" | "own"` in the JSON (the seed ignores
   it; the validator requires it). If the `about-team` «Источники» credit (#62c Req 8) is not there
   yet, this plan adds it (user step).
4. **`validate_time_quantity`**: every sentence passes the #156 invariant; **every** Basic task gets
   4 options from the answer's own lexeme (this also keeps blanks off the 10–19 / tens numerals, which
   have no paradigm line); topics 31–32 blank only ordinals; topics 33–34 get a `base_lt`; no
   duplicate `display`; ≥ 25 sentences per topic; topic 32 uses each of pusė / nuo…iki ≥ 8 times;
   every sentence has a `source`.
5. **No collision from new nouns** — a deterministic test: no form or stem of the new `words.txt` rows
   equals a form of any other `words.txt` row, any `paradigms_extra.txt` line or any `adjectives.txt`
   line.
6. **Knowledge check** — no code change (published lessons join the pool as `g:<basic id>`).
7. **Release order** — as #62f Req 13 (program public + rules published in one pass, after the deploy
   and the seed; `## Release`).

### SEO
- **S1 — no indexed page changes**; the `seo-snapshot` diff must be clean. llms.txt lists the
  program automatically once public (#62f S4).
- **S2 — rule cards → articles** via `article_slug` (Req 3).
- **S3 — article updates** (user step, after release): in `numbers-03-time` (RU + EN) add a short
  closing section «Потренируйтесь в Fluent» / "Practise in Fluent" linking to `/dashboard/grammar/`;
  **ask the user** whether to fix the working-hours cell «dvylikta → dvylikos» to «dvyliktos» (RU and
  EN tables). Title, slug and the first 160 characters of both bodies stay byte-identical. **Timing
  gate:** not before the #48c RU-traffic check (~2026-10-24). IndexNow re-pushes it at the next deploy.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. (No UI change: the lesson UI and the admin select are reused.)
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62h_grammar-time-quantity.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the same Grammar page and `GrammarTaskRunner.tsx` screens as #62f, `GrammarRuleCard`.
- **New part:** time and quantity task content.
- **States:** program card; a Basic time task (ordinal options); a Basic quantity task with «от: kava»; a Practice time task (stem stripped, digits in the translation); a wrong answer; a rule card.
- **Content:** one real rule card per topic type (time, quantity) and 5 real draft sentences.
- **Decide in the prototype:** how the time appears in the translation («3:30» vs words), wording of the time rule card.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62h_grammar-time-quantity-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62h_grammar-time-quantity.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62h_grammar-time-quantity-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62h-baseline.json`.
- [ ] 2. `backend/data/grammar/words.txt` — Req 2.
- [ ] 3. `backend/data/grammar/lessons.json` — Req 1.
- [ ] 4. `backend/data/grammar/programs/time_quantity.json` + `validate_time_quantity` in
  `backend/scripts/grammar_validators.py` — Req 3, 4.
- [ ] 5. Tests:
  - `backend/tests/test_grammar_time_quantity.py` — `validate_time_quantity` passes on the seed data
    and fails on a blank on «penkiolikos», a cardinal blank in topic 31, a sentence without options;
    new noun rows have 14 endings + EN + RU; Req 5 no-collision check; lessons 166–186 are < 200,
    hidden from a free user while `testing`, and map to this program only.
  - `backend/tests/test_knowledge_check.py` — with only these topics published: `build_check` can
    pick `g:166`, `gap_tasks` serves it with options, `recommendations` maps it to «Время и количество».
  - `backend/tests/test_grammar_basic_options.py`, `test_grammar_practice_full_word.py` — still green.
  - `frontend/tests/grammar-time-quantity.spec.ts` — Playwright, API mocked **incl.
    `/api/admin/grammar/config` with the new group**: the program card; a Basic time task («Dabar
    pusė ketvirt[blank].» with 4 ordinal forms); a quantity task with the «от: kava» hint; a Practice
    time task (stem stripped, translation visible); a wrong answer. Screenshots (Validation).
- [ ] 6. **STOP — user step.** Ask the user to review the sentence sample from
  `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/time_quantity.json --dry-run`
  and the new noun rows, then run it without `--dry-run` (prod: rules `testing`, program hidden).
  Restart the local backend (or wait 10 min) before the smoke. Users see nothing: the deployed code has no lessons for these case indices and the program is
  hidden. Until this plan is deployed, don't edit the new rules or sentences in the prod admin — the
  old code rejects case indices it doesn't know (admins only). Release: see `## Release`.
  The new `words.txt` nouns go live with the deploy itself; the no-collision test (Req 5) is what
  keeps every existing lesson unchanged at that moment.
- [ ] 7. Docs/specs: `specs/grammar.md` — the #62h part of the new-programs scenario;
  `specs/knowledge-check.md` — mention the topics; `documentation/grammar-new-programs.md` — why the
  lessons follow `numbers-03-time` (ordinal only, no be/po yet), why case 19 stays in Numbers, the new
  nouns and the no-collision rule. Close-out: add
  `- <today> — release #62h: program public + rules published once deployed (#62h)` to
  `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_grammar_time_quantity.py tests/test_grammar_basic_options.py tests/test_grammar_practice_full_word.py tests/test_knowledge_check.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/grammar-time-quantity.spec.ts tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/time_quantity.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Grammar page shows nothing new — the new program and its lessons are invisible.
- [ ] SEO diff clean (DoD command).
- [ ] Smoke (local, after the seed, as admin): enroll in the hidden «Время и количество», run one
  Basic and one Practice lesson; a Numbers lesson and a Kilmininkas lesson look exactly as before.
- [ ] Screenshots in `temp_files/screenshots/plan_62h_grammar-time-quantity/`, looked at and
  described: program card, topic list, a Basic time task, a Basic quantity task with the hint, an
  Advanced task with the rule card, a Practice time task, a wrong answer — each in **RU and EN**, at
  **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62h_grammar-time-quantity-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: Grammar page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/time_quantity.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/grammar-time-quantity.spec.ts tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62h-baseline.json
ls temp_files/screenshots/plan_62h_grammar-time-quantity/ | grep -c png   # expect >= 28 (7 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

No `## UAT verification`: the lesson UI is reused unchanged and the change is data; the backend
tests drive the real generators, and the user reviews the content in step 6.

## Release

Merging ships the code; the program stays hidden and its case rules `testing` until these user
steps. Every state in between is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render; the seed has run.
2. **Credit first:** if the `about-team` article has no «Источники» / "Sources" section yet, add it
   (text in `documentation/content-sources.md`) — the sentences include Tatoeba-derived ones. Exempt
   from the #48c timing gate (a licence attribution, not an SEO change).
3. **One pass, never half:** make «Время и количество» public **and** publish its 4 case rules in the
   admin grammar page. A public program with unpublished rules would show no lessons; published rules
   with a hidden program would put the lessons into checks and the continue session with no program
   to recommend.
4. **Verify** as a free user: the program is listed; after enrolling, the first lesson is open and a
   Basic task has 4 options (a quantity task also shows the «от: …» hint); a new knowledge check can include one of its topics.
5. **Article** (after the #48c timing gate, ~2026-10-24): add «Потренируйтесь в Fluent» to `numbers-03-time` and, if the user agreed, fix «dvylikos» → «dvyliktos» (S3).
6. **Record:** "released YYYY-MM-DD" on the #62h row in `documentation/CHANGELOG.md`, delete the
   reminder, then the news post.

**Rollback:** hide the program **and** set its rules back to `testing` (both, for the same reason as
step 3); enrollments and results stay. **Abandon before release:** leave both hidden — users never
see them.
