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

# #62g — Grammar: "Приставки движения" (motion-verb prefixes)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 7 of 8.**
Branch `feat/62g-grammar-motion-prefixes`. **Depends on #62a and #62f being merged** — #62f brings
the generic seed (`scripts/seed_grammar_program.py` + `scripts/grammar_validators.py`), admin preview
of hidden programs, the generated admin group options, the llms.txt grammar list, the removal of the
duplicate-word cleanup, and `documentation/grammar-new-programs.md`.

Lithuanian motion verbs change direction with a prefix: iš-eiti (go out) / į-eiti (go in) / per-eiti
(cross) / pra-eiti (pass by) / par-eiti (come home)… The exam tests them in context, and the
preposition usually echoes the prefix: «Lina **iš**eina **iš** namų». Format: the root is printed,
the student supplies the prefix.

Facts found in `backend/grammar_service.py` and the UI:
1. **The blank sits before the root**, not after a stem: `display` «Lina ___eina iš namų.»,
   `answer_ending` «iš», `full_word` «iš». `_STEM_BLANK_RE` (`(\w+)___`) finds no stem, so the #156
   invariant holds (`'' + 'iš' == 'iš'`), the practice-level strip does nothing, and every level
   grades the prefix. (The duplicate-word cleanup that would have deleted «iš» after the blank is gone
   since #62f.)
2. **Basic options** come from `_paradigm_forms` — a prefix has no paradigm, so Basic would fall back
   to typing. `_sentence_options` needs a prefix branch.
3. `SentenceBlank` (`GrammarTaskRunner.tsx`) renders `before` + blank + `after`, so «Lina [__]eina iš
   namų.» displays correctly. But `GrammarRuleCard` (`GrammarTaskRunner.tsx:270-287`) always shows
   an endings row; with both endings «—» (a prefix rule has none) it prints «Множественное число: —».
4. Lithuanian: ap- becomes **api-** before b/p (apibėgti); pa- with motion verbs is mostly
   perfective (pabėgti iš namų), not directional; at- and nu- also fit į / iš / prie sentences
   (atėjo į kambarį, atbėgo iš mokyklos, atėjo prie namo) — so a random distractor can be a second
   correct answer.

**SEO**: `/dashboard/grammar/` metadata is unchanged (client-loaded programs). The article
**`verb-governance`** («Управление глаголов и приставочные образования», RU + EN) already has a
"## Приставочные глаголы" section; it becomes the rule cards' article and gets a short motion-prefix
addition.

Model/effort: opus/medium — two small, well-located code changes plus ~110 natural sentences.

## Goals
- A new grammar program «Приставки движения» / "Motion prefixes" with 4 topics at Basic / Advanced /
  Practice: iš-/į-; nu-/pri-/at-; per-/pra-; ap-/su-/už-/par-.
- The sentence shows the verb root; the student picks (Basic) or types (Advanced, Practice) the prefix.
- Basic never offers a second correct prefix.
- Ships hidden until the user publishes it; admins can preview it (#62f).
- Rule cards link to `verb-governance`, and the article links back.
- RU + EN, desktop and 375px.

## Non-Goals
- pa- and other non-directional prefixes (pa- as perfective, nu- as "finish"…).
- Typing the whole verb at Practice level (all three levels grade the prefix; Practice differs by
  showing no rule card, as for every topic).
- Reflexive or participle forms.

## Requirements

1. **`MOTION_PREFIXES`** in `grammar_service.py`: `("ap", "at", "iš", "nu", "par", "per", "pra",
   "pri", "su", "už", "į")`.
2. **Basic options** — `_sentence_options(full)`: if `full.lower()` is in `MOTION_PREFIXES`, return
   `_pick_options(full, <the other prefixes, shuffled>)`, where for an answer in {«į», «iš», «pri»}
   the candidates exclude «at» and «nu». Other answers unchanged.
3. **Rule card** — `GrammarRuleCard` hides the endings rows when both `endings_sg` and `endings_pl`
   are «—» or empty. Cards with one real endings row (Numbers) render as today.
4. **Case indices 27–30**, group `Priešdėliai`: 27 `Priešdėliai: iš-, į-`, 28 `Priešdėliai: nu-,
   pri-, at-`, 29 `Priešdėliai: per-, pra-`, 30 `Priešdėliai: ap-, su-, už-, par-`.
   **Lessons**: basic ids 142, 148, 154, 160 (+1 advanced, +2 practice), task counts 24 / 35 / 20.
5. **Content** — `backend/data/grammar/programs/prefixes.json` (`"format": "prefixes"`) through #62f's
   generic seed: 4 rule cards (`status` `testing`, RU + EN: what each prefix means and which
   preposition pairs with it — iš + Gen, į + Acc, nuo + Gen, prie + Gen, per + Acc, pro + Acc,
   aplink + Acc, už + Gen, pas + Acc, namo; `endings_sg`/`endings_pl` «—»; `article_slug`
   `verb-governance`), ~28 sentences per topic with motion verbs (eiti, važiuoti, bėgti, skristi,
   plaukti, lipti, nešti, vežti) in the present and past, RU + EN translations that pin down the
   meaning (вошёл ≠ пришёл); the program: `title` «Приставки движения», `title_en` "Motion prefixes",
   RU/EN description, `difficulty` 2, `lesson_filter` `["Priešdėliai"]`, `program_type` `cases`.
   **Sources** (`documentation/content-sources.md`): start from Tatoeba (RU/EN translations included)
   and Common Voice (CC0) — filter the per-language exports (kept in `temp_files/`, not in git) for
   sentences with the target forms — then adapt to A2 and fix the translations; write the rest. Every
   sentence carries `"source": "tatoeba:<id>" | "commonvoice" | "own"` in the JSON (the seed ignores
   it; the validator requires it). If the `about-team` «Источники» credit (#62c Req 8) is not there
   yet, this plan adds it (user step).
6. **`validate_prefixes`**: exactly one `___`, preceded by a space and followed directly by a
   lowercase letter (the root); the blank is never sentence-initial; `answer_ending == full_word`, in
   `MOTION_PREFIXES` and in the topic's own prefix set; «ap» never before a root starting with b or p;
   the task built from each row keeps `display` unchanged and has 4 prefix options that obey Req 2;
   no duplicate `display`; ≥ 25 sentences per topic, every prefix of the topic used ≥ 4 times; every
   sentence has a `source`.
7. **Knowledge check** — no code change (published lessons join the pool as `g:<basic id>`).
8. **Release order** — as #62f Req 13 (program public + rules published in one pass, after the deploy
   and the seed; `## Release`).

### SEO
- **S1 — no indexed page changes**; the `seo-snapshot` diff must be clean. llms.txt lists the
  program automatically once public (#62f S4).
- **S2 — rule cards → article** via `article_slug` `verb-governance` (Req 5).
- **S3 — article → program** (user step, after release): add a short subsection «Приставки движения»
  / "Motion prefixes" inside "## Приставочные глаголы" of `verb-governance` (RU + EN): a 4-row table
  (prefix → meaning → preposition → example) and a link to `/dashboard/grammar/`. Title, slug and the
  first 160 characters of both bodies stay byte-identical. **Timing gate:** not before the #48c
  RU-traffic check (~2026-10-24). IndexNow re-pushes it at the next deploy.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. (Only the rule-card guard changes.)
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62g_grammar-motion-prefixes.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the same Grammar page and `GrammarTaskRunner.tsx` screens as #62f, `GrammarRuleCard`.
- **New part:** the blank before the verb root («Lina [__]eina iš namų.»), the prefix option buttons, the rule card without endings rows.
- **States:** program card; a Basic task before and after picking; an Advanced typed task; a Practice task; a wrong answer; the rule card.
- **Content:** one real rule card (iš- / į-) and 5 real draft sentences.
- **Decide in the prototype:** blank width before the root, whether to show the plain verb (eiti) as a hint.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62g_grammar-motion-prefixes-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62g_grammar-motion-prefixes.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62g_grammar-motion-prefixes-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62g-baseline.json`.
- [ ] 2. `backend/grammar_service.py` — Req 1, 2.
- [ ] 3. `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — Req 3.
- [ ] 4. `backend/data/grammar/lessons.json` — Req 4.
- [ ] 5. `backend/data/grammar/programs/prefixes.json` + `validate_prefixes` in
  `backend/scripts/grammar_validators.py` — Req 5, 6.
- [ ] 6. Tests:
  - `backend/tests/test_grammar_prefixes.py` — `validate_prefixes` passes on the seed data and fails
    on a sentence-initial blank, a prefix outside the topic, a stem before the blank, «ap» before
    «bėga»; a prefix row's task keeps «Lina ___eina iš namų.» byte-for-byte at all three levels;
    Basic gives 4 distinct prefixes including the answer, and for «į»/«iš»/«pri» never «at» or «nu»;
    lessons 142–162 are < 200, hidden from a free user while `testing`, and map to this program only.
  - `backend/tests/test_knowledge_check.py` — with only these topics published: `build_check` can
    pick `g:142`, `gap_tasks` serves it with prefix options, `recommendations` maps it to «Приставки
    движения».
  - `backend/tests/test_grammar_basic_options.py`, `test_grammar_practice_full_word.py` — still green.
  - `frontend/tests/grammar-prefixes.spec.ts` — Playwright, API mocked **incl.
    `/api/admin/grammar/config` with the new group**: the program card; a Basic prefix task renders
    «Lina [blank]eina iš namų.» with 4 prefix buttons; picking one fills the blank before the root;
    the rule card shows no «—» endings row; a Numbers rule card still shows its endings. Screenshots
    (Validation).
- [ ] 7. **STOP — user step.** Ask the user to review the sentence sample from
  `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/prefixes.json --dry-run`,
  then run it without `--dry-run` (prod: rules `testing`, program hidden). Restart the local backend
  (or wait 10 min) before the smoke. Users see nothing: the deployed code has no lessons for these case indices and the program is
  hidden. Until this plan is deployed, don't edit the new rules or sentences in the prod admin — the
  old code rejects case indices it doesn't know (admins only). Release: see `## Release`.
- [ ] 8. Docs/specs: `specs/grammar.md` — the #62g part of the new-programs scenario: the prefix
  blank, prefix options and the distractor rule, the rule-card guard; `specs/knowledge-check.md` —
  unchanged rule, mention the topic; `documentation/grammar-new-programs.md` — why the blank sits
  before the root, why all levels grade the prefix, why pa- is out, why at-/nu- are not distractors
  for į/iš/pri, the ap-/api- rule. Close-out: add
  `- <today> — release #62g: program public + rules published once deployed (#62g)` to
  `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_grammar_prefixes.py tests/test_grammar_basic_options.py tests/test_grammar_practice_full_word.py tests/test_knowledge_check.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/grammar-prefixes.spec.ts tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/prefixes.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Grammar page shows nothing new — the new program and its lessons are invisible.
- [ ] SEO diff clean (DoD command).
- [ ] Smoke (local, after the seed, as admin): enroll in the hidden «Приставки движения», run one
  Basic and one Advanced lesson; existing noun and numeral lessons look exactly as before.
- [ ] Screenshots in `temp_files/screenshots/plan_62g_grammar-motion-prefixes/`, looked at and
  described: program card, topic list, Basic task before and after picking, Advanced task with the
  rule card, a Practice task, a wrong answer showing the correct prefix — each in **RU and EN**, at
  **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62g_grammar-motion-prefixes-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: Grammar page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_grammar_program.py data/grammar/programs/prefixes.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/grammar-prefixes.spec.ts tests/grammar-adjectives.spec.ts tests/grammar-bento.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62g-baseline.json
ls temp_files/screenshots/plan_62g_grammar-motion-prefixes/ | grep -c png   # expect >= 28 (7 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

No `## UAT verification`: the lesson UI is reused (one small guard); the backend changes are covered
by tests that drive the real generator, and the user reviews the content in step 7.

## Release

Merging ships the code; the program stays hidden and its case rules `testing` until these user
steps. Every state in between is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render; the seed has run.
2. **Credit first:** if the `about-team` article has no «Источники» / "Sources" section yet, add it
   (text in `documentation/content-sources.md`) — the sentences include Tatoeba-derived ones. Exempt
   from the #48c timing gate (a licence attribution, not an SEO change).
3. **One pass, never half:** make «Приставки движения» public **and** publish its 4 case rules in the
   admin grammar page. A public program with unpublished rules would show no lessons; published rules
   with a hidden program would put the lessons into checks and the continue session with no program
   to recommend.
4. **Verify** as a free user: the program is listed; after enrolling, the first lesson is open and a
   Basic task has 4 options (prefixes) and no «—» endings row on the rule card; a new knowledge check can include one of its topics.
5. **Article** (after the #48c timing gate, ~2026-10-24): add the «Приставки движения» subsection to `verb-governance` (S3).
6. **Record:** "released YYYY-MM-DD" on the #62g row in `documentation/CHANGELOG.md`, delete the
   reminder, then the news post.

**Rollback:** hide the program **and** set its rules back to `testing` (both, for the same reason as
step 3); enrollments and results stay. **Abandon before release:** leave both hidden — users never
see them.
