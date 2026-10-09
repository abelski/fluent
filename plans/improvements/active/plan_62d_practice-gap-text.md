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

# #62d — Practice: "Текст с пропусками" (gap text with a word bank)

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 4 of 8.**
Branch `feat/62d-practice-gap-text`. **Depends on #62a deployed** (empty categories hidden in prod
before this plan seeds) **and #62b–#62c merged** (#62c's migration already ran on prod) — #62c adds
`practice_test.kind`, `TEST_KINDS`, ordered whole-test serving for non-`choice` kinds, the admin kind
select (`frontend/app/dashboard/admin/page.tsx`) and `kind` + `lesson_text_lt` in export/import;
#62b adds the collapsible text block, hides empty categories and the generic insert-only seed
(`scripts/seed_practice_category.py` + `scripts/practice_validators.py`); #62a keeps a practice
topic's tasks as one ordered block.

The A2 exam has a long text with gaps and a shared bank of words to place. The user placed it in
Practice as its own category (idea, Q6), not under Articles.

What exists after #62c: a test with `kind != "choice"` is served whole, in `sort_order`; the
question screen (`frontend/app/dashboard/practice/[id]/page.tsx`) switches on `activeTest.test.kind`;
`startTest()` shows the reading screen first whenever `lesson_text_lt` is set; #62b's `<details>`
text block shows `lesson_text_lt` during questions. Both of those would show the raw gap markers for
a gap text, so this kind skips them.

Practice is out of search (`noindex` + `Disallow`, see #62b) — no SEO surface changes here.

Model/effort: opus/high — a new interactive screen (tap-to-place word bank) that must work at 375px,
plus a knowledge-check builder.

## Goals
- A new Practice category «Текст с пропусками» / "Gap text" with 8 texts of 10–12 gaps each.
- One screen: the text with numbered gaps and a word bank (each gap's word + one distractor). Tap a
  word to fill the active gap, tap a filled gap to take the word back; "Check" grades all gaps.
- Works by tapping (no drag), so it works on phones.
- Gaps can appear in the knowledge check and in "Close the gaps" without giving answers away.
- No indexed page changes.
- RU + EN, desktop and 375px.

## Non-Goals
- Drag and drop.
- A per-gap dropdown.
- Partial credit inside a gap; typing words.
- Changing the existing multiple-choice question screen.

## Requirements

1. **Kind** — add `gap_text` to `TEST_KINDS` (`backend/routers/practice.py`) and to the admin kind
   select in `frontend/app/dashboard/admin/page.tsx` (+ i18n label «Текст с пропусками» / "Gap text").
2. **Data contract** — one test per text: `kind` `gap_text`; `lesson_text_lt` = the text (120–200
   words, A2, plain paragraphs, no markdown) with markers `{1}` … `{N}`, each exactly once and in
   order; `question_count` = N; `pass_threshold` 0.7; `is_premium` false; `status` `testing` at seed.
   One question per gap: `question_lt` = `question_ru` = its marker (`"{3}"` — ties the row to its
   gap explicitly, not just by order), `option_a` = the correct word in its correct form, `option_b`
   = one distractor (a wrong form of the same word or a near-synonym), `option_c` = `option_d` = "",
   `correct_option` `a`. Gaps target A2 grammar (case endings, verb forms) and everyday words. Texts
   are written for Fluent — no openly licensed A2 texts exist (`documentation/content-sources.md`).
3. **Start** — `startTest()` goes straight to the gap screen for `kind === 'gap_text'` (no reading
   screen); #62b's text block is not rendered for this kind.
4. **Gap screen** (new component `frontend/app/dashboard/components/GapText.tsx`, used by the
   practice page when `activeTest.test.kind === 'gap_text'`):
   - The text split on `/\{(\d+)\}/`; each gap is a button showing its number when empty or its word
     when filled; one gap is **active** (the first empty one at start, highlighted).
   - **Bank** = every gap's `option_a` + every gap's `option_b`, shuffled once per run; each chip is
     used at most once. The bank is `position: sticky; bottom: 0` so it stays in reach on a phone.
   - Tap a chip → it fills the active gap and leaves the bank; the active gap moves to the next empty
     one. Tap a filled gap → its word goes back to the bank and that gap becomes active.
   - "Проверить" / "Check" is enabled when every gap is filled. Grading: a gap is correct when its
     word equals its `option_a`. After Check the same screen shows each gap green or red (red ones
     also show the correct word), the score line, and the existing retry / back-to-tests buttons;
     `score/total` is posted to the existing `POST /practice/tests/{id}/results` (existing pattern:
     the client posts the score; the server validates `0 ≤ score ≤ total`).
   - Keyboard: chips and gaps are buttons (Tab/Enter work); each gap has an `aria-label`
     ("Gap 3, empty" / "Gap 3: namuose") from i18n.
5. **Knowledge check** — `PRACTICE_TASK_BUILDERS["gap_text"]` in `backend/knowledge_check_service.py`:
   from one random free published gap text of the category, 2 random gaps, **returned in gap order**.
   Each becomes a `reading` task: `passage_lt` = the text with every *other unchosen* gap filled with
   its `option_a`, the task's own gap as `___` and the other chosen gap as `(…)` — so neither task
   reveals the other's answer; `question_lt` = the sentence holding `___` (split on `.`, `!`, `?` +
   whitespace); `options` = this gap's `option_a`, its `option_b`, and the `option_b` of 2 other gaps
   (distractors never appear in the text), deduplicated, shuffled — at least 2, at most 4;
   `answer` = `option_a`. No id to wire: the category joins #62a's pool when its tests are published.
6. **Seed** — `backend/data/practice/gap_text.json` (`"format": "gap_text"`) through #62b's
   `seed_practice_category.py`; new `validate_gap_text` in `practice_validators.py`. Category:
   `name_ru` «Текст с пропусками», `name_en` "Gap text", `sort_order` 13, one-line RU/EN description.
   Validator: 8 tests, all `kind` `gap_text`; 10–12 gaps; markers `{1}`…`{N}` each once, in order,
   no other `{` or `}` in the text; N questions whose `question_lt` is `{n}` for n = 1…N;
   `option_a`/`option_b` non-empty and different; `option_c`/`option_d` empty; `correct_option` `a`;
   no gap's `option_b` equals any gap's `option_a` in the same text; text 600–1400 chars; RU + EN titles.

### SEO
- Practice stays out of the index (#62b S1): no sitemap entry, no robots/metadata change; the
  `seo-snapshot` diff must be clean. llms.txt lists the category automatically (#62b S2).

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. Chips and gaps are new shared-looking UI: add them to the component library.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62d_practice-gap-text.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the practice question card shell, buttons and feedback colours of `practice/[id]/page.tsx`; the knowledge-check runner's `reading` task (from #62a).
- **New part:** GapText: numbered gaps, the active gap, the word-bank chips (sticky at the bottom), the after-Check marks.
- **States:** empty start (first gap active); half filled; all filled (Check enabled); after Check with two mistakes; 375px with a gap low in the text and the sticky bank; a gap task in the knowledge-check runner.
- **Content:** one real draft gap text (10–12 gaps) — it becomes the first test of `gap_text.json`.
- **Decide in the prototype:** chip style, active-gap highlight, bank height at 375px, how a wrong gap shows the right word.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62d_practice-gap-text-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
_Filled in at step 0 (date + what the user approved or changed). Until then the Requirements stand
as written; anything the prototype changes is copied into the Requirements before step 1._


## Implementation

- [ ] 0. **Prototype** — build `temp_files/prototypes/plan_62d_practice-gap-text.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62d_practice-gap-text-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [ ] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62d-baseline.json`.
- [ ] 2. `backend/routers/practice.py` — Req 1 (`TEST_KINDS` += `gap_text`).
- [ ] 3. `frontend/app/dashboard/components/GapText.tsx` — Req 4.
- [ ] 4. `frontend/app/dashboard/practice/[id]/page.tsx` — Req 3 + render `GapText` for the kind;
  `frontend/app/dashboard/admin/page.tsx` — the kind select gains the option.
- [ ] 5. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — check button, score line, gap aria-labels,
  kind label.
- [ ] 6. `backend/data/practice/gap_text.json` + `validate_gap_text` in
  `backend/scripts/practice_validators.py` — Req 2, 6.
- [ ] 7. `backend/knowledge_check_service.py` — Req 5 builder.
- [ ] 8. Tests:
  - `backend/tests/test_practice_gap_text.py` — `validate_gap_text` passes on `gap_text.json` and
    fails on a missing marker, a duplicated marker, out-of-order markers, a `question_lt` not matching
    its marker, equal `option_a`/`option_b`, a distractor equal to another gap's answer; a `gap_text`
    test's exam returns all gaps in order; `kind="gap_text"` accepted by create/update/import.
  - `backend/tests/test_knowledge_check.py` — a gap-text category in the pool yields 2 `reading`
    tasks in gap order; each passage has exactly one `___` and one `(…)`, and the other chosen gap's
    answer is not written at its place; options hold the answer, are distinct, 2–4 of them, and none
    of the distractors appears in the passage; the gaps run keeps the pair in order.
  - `frontend/tests/practice-gap-text.spec.ts` — Playwright, API mocked: fill gaps by tapping chips;
    tapping a filled gap returns its chip; Check disabled until all filled; after Check correct/wrong
    marks + score; results POST body has the right score; no reading screen and no text block for
    this kind; a gap `reading` task in the knowledge-check runner. Screenshots (Validation).
- [ ] 9. **STOP — user step.** Ask the user to review `gap_text.json` (natural Lithuanian; each gap
  has one right word in the bank) and run
  `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/gap_text.json --dry-run`
  then without `--dry-run` (prod, `testing`). Users see nothing (#62a hides the category). Until
  this plan is deployed, don't open or edit the new tests on fluent.lt — the deployed #62c code shows
  raw `{n}` markers and its admin form rejects the `gap_text` kind on save (admins only).
- [ ] 10. Docs/specs: `specs/practice.md` — the #62d scenario from the idea; `specs/knowledge-check.md`
  — gap builder (both chosen gaps blank, distractor rule); `documentation/practice-formats.md` — the
  `{n}` marker contract, why the bank is correct words + one distractor per gap, why tap-to-place
  instead of drag, why the client posts the score (existing pattern); component library — GapText
  gaps + bank chips; `documentation/IMPLEMENTATION.md` — GapText. Close-out: add
  `- <today> — release #62d: publish the gap texts once deployed (#62d)` to `plans/reminders.md`.

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_practice_gap_text.py tests/test_practice_dialogues.py tests/test_practice_tfns.py tests/test_knowledge_check.py`
- [ ] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright: `cd frontend && npx playwright test tests/practice-gap-text.spec.ts tests/practice-dialogues.spec.ts tests/practice-tfns.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/gap_text.json --dry-run`
- [ ] Leak check right after the real seed: on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Practice page shows nothing new — the new category is invisible.
- [ ] SEO diff clean (DoD command).
- [ ] Smoke (local, after the seed): as admin, complete one gap text with two deliberate mistakes;
  the score is N−2 and the result is saved.
- [ ] Screenshots in `temp_files/screenshots/plan_62d_practice-gap-text/`, looked at and described:
  empty start (active gap highlighted), half filled, all filled before Check, after Check with
  mistakes, the bank at 375px while a gap far down the text is active, a gap task in the
  knowledge-check runner — each in **RU and EN**, at **1280px and 375px**.
- [ ] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62d_practice-gap-text-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: practice page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/gap_text.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/practice-gap-text.spec.ts tests/practice-dialogues.spec.ts tests/practice-tfns.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62d-baseline.json
ls temp_files/screenshots/plan_62d_practice-gap-text/ | grep -c png   # expect >= 24 (6 states x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/practice`, logged in as a
local admin test user (token in `localStorage('fluent_token')`), real local backend on :8000, after
the user has run the seed.

**Scenarios:**
1. Open Practice → «Текст с пропусками» → the first text.
2. Fill three gaps, then take one word back by tapping its gap, then fill every gap, two of them
   wrongly on purpose, and press Check.
3. Repeat at 375px wide, filling a gap near the end of the text.
4. Switch the UI to English and open the category again.

**Acceptance criteria:**
- [ ] The text shows numbered gaps and a bank of words; one gap is marked as active.
- [ ] Tapping a word puts it into the active gap; tapping a filled gap returns the word to the bank.
- [ ] Check is only possible when every gap is filled.
- [ ] After Check, wrong gaps are marked and show the right word, and the score counts only correct gaps.
- [ ] At 375px the word bank stays reachable while working on a gap low in the text, with no
  horizontal scroll.
- [ ] Titles and buttons appear in English in the English UI; the text stays Lithuanian.

## Release

Merging ships the code; the gap texts stay `testing` until these user steps. Every state in between
is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render; the seed (step 9) has run.
2. **Publish:** set the 8 gap-text tests to `published`.
3. **Verify** as a free user at 375px: the category lists 8 texts; one can be filled and checked; a
   new knowledge check can include a gap block.
4. **Record:** "released YYYY-MM-DD" on the #62d row in `documentation/CHANGELOG.md`, delete the
   reminder, then the news post.

**Rollback:** set the tests back to `testing`. **Abandon before release:** leave the category hidden
or delete it in the admin panel.
