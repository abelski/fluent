---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #48b — English coverage, part 2: DB content

## Context

Idea: `plans/ideas/idea_48_full-english-coverage.md`. This is part 2 of 3. It starts after 48a is
merged.

Admin-authored content has no EN version, so EN mode shows Russian. Prod counts (2026-09-24),
checked by the cold review:

| Content | EN today | Rows | Seed source | Match key for DB-only rows |
|---|---|---|---|---|
| `practice_category.description_ru` | no column | 1 | — | `id` (2 stable rows) |
| `practice_category` 2 `name_en` = «Skaitymas» (LT) | column | fix → «Reading» | `seed_skaitymas.py`, `seed_skaitymas_new.py`, `scripts/test_seed.py` | — |
| `practice_test.description_ru` | `description_en` empty | 32 | `data/constitution/program_data.json` via `seed_constitution_program.py` (all 32 match by `sort_order`) | — |
| `word_list.title` / `description` (public, not archived) | `title_en` / `description_en` empty | 21 / 8 | — | `(subcategory, title)`; the 21 titles are LT sekmes lesson names, and EN shows `Stack <id>` for them today (`programs/[key]/page.tsx:240`) |
| `grammar_program.description` | no column | 4 (id 4 verb_cases is admin-only) | `_SEED_PROGRAMS` (`routers/grammar.py:29-41`, ids 1–2), `scripts/seed_verbs_grammar.py` (ids 3–4) | — |
| `grammar_case_rule.name_ru`, `question`, `usage`, `transform`, `endings_sg`, `endings_pl` | no columns | 18 × 6 | cases 15–20: `scripts/seed_numbers_grammar.py` `CASE_RULES` | `case_index` |
| `grammar_sentence.russian` | no column | 422 (not archived) | cases 15–20: `seed_numbers_grammar.py` `SENTENCES` | `(case_index, display, russian)`. `display+case_index` has 5 duplicates where the number is the blank; the one remaining duplicate (315/331) is identical, so apply to every match |
| `verb.translation_en` | no column | 358 | `scripts/verb_translations_en.py` (orphaned, no importer) | infinitive with stress marks stripped: NFD, then drop U+0301, U+0300 and U+0303, keeping ogonek, the dot above ė, caron and macron (as `seed_verb_programs.py` does). All 358 match. `reñgti` exists twice (219 «готовить», 220 «одевать, раздевать"), so split it by `translation_ru` |

**Local runs use the prod DB** (`backend/.env`). Adding model fields makes every `select()` on
those tables return 500 until Alembic runs (`documentation/local-dev-gotchas.md`). So the
migration runs **first**, on prod, with your approval. That is safe: the columns are nullable and
additive, and the current code ignores them.

Code facts:
- Category API: `routers/practice.py` — the builders at `:114-123`, `:180-188` and `:457-466` list
  fields explicitly; `CategoryIn` at `:471`; `CategoryUpdate` / PATCH at `:501-525`, which stores
  the raw value.
- Grammar programs: `_grammar_programs()` (`routers/grammar.py:53-56`) builds a `SimpleNamespace`
  with explicit fields.
- The rule dict is at `grammar_service.py:~198`. `_verb_pool` (`:583-607`) selects columns
  explicitly.
- The admin PATCHes for sentences (`admin.py` ~1103-1143), programs (~1432-1455) and rules
  (1330-1357) overwrite every field. `toggleSentenceLevel` (`admin/grammar/page.tsx:292-304`)
  PATCHes without the EN fields.
- The word-list meta PATCH wipes `title_en` when it's omitted (`admin.py:~822`).
- There is no admin rule editor. Admin only displays `rule.question` (`admin/grammar/page.tsx:742`).

**Model:** opus/high. It touches a prod migration, a prod backfill, three different patch
semantics, and translation quality.

## Goals
- Every piece of user-visible admin-authored content has an EN version and shows in EN.
- A re-seed brings EN back instead of erasing it.
- No admin action can silently wipe an EN value.

## Non-Goals
- `practice_question.question_ru`: all 509 rows have `question_lt`, which is shown in both languages.
- The legacy `constitution_question` rows, `verb.prefix_forms[].example_ru` (no endpoint serves
  it) and `verb.case_governance[].sentences[].ru` (only served by `verb_cases` programs, which are
  forced to `is_public=False`). Record the last one in the docs.
- New admin editors with no RU equivalent: rules, verbs, and word-list descriptions. Their EN
  comes from seeds or the apply script, and can be changed via the backend PATCH where one exists.

## Requirements
1. **Migration** (one Alembic file, parent `b8c9d0e1f2a3`, unique id) adds nullable
   `practice_category.description_en`, `grammar_program.description_en`,
   `grammar_case_rule.name_en`, `question_en`, `usage_en`, `transform_en`, `endings_sg_en`,
   `endings_pl_en`, `grammar_sentence.english`, and `verb.translation_en`.
2. **API:** every builder that serves one of the RU fields also serves its EN twin:
   - the three category builders
   - `_grammar_programs()`
   - the rule dict
   - `_verb_pool` and the dict in `_generate_verb_case_tasks`
   - the sentence and verb task payloads
3. **Admin writes:**
   - Every new EN field is assigned **only when it is present** in `body.model_fields_set`.
   - Values go through `strip()`, and an empty string becomes `None`. This applies to the new EN
     fields only; the RU twins keep their current behaviour.
   - Fix the `title_en` wipe at `admin.py:~822` the same way.
   - EN inputs appear next to the existing RU inputs for category description, grammar program
     description and sentence translation.
   - The rule fields get no editor. Admin displays `question_en` in EN.
4. **Frontend:** show the EN twin in EN mode wherever the RU field is shown:
   - `GrammarTaskRunner.tsx` (rule card incl. endings, sentence, verb translation)
   - the practice category description (drop the `lang !== 'en'` hide in `practice/page.tsx`)
   - the practice test description
   - grammar program cards
   - word-list title and description

   Fallback is RU, as in the existing pattern.
5. **Content source of truth:**
   - EN goes into each seed source listed in the table, and the seed scripts write it.
   - Rows that exist only in the DB go into committed `backend/data/en_content/*.json`, using the
     match keys from the table (never ids).
   - `backend/scripts/apply_en_content.py`:
     - It fills only empty EN fields.
     - `--dry-run` (the default) writes the review artifact; `--apply` writes to the DB.
     - It fails loudly on a key that matches no row, and is idempotent.
     - It also loads `verb_translations_en.py` using the verb key above.
     - It renames category 2, guarded by `name_en = 'Skaitymas'`.
     - It never prints `DATABASE_URL`, and it never runs `--apply` from an automated pass.
6. **Translation quality:**
   - Adapt `grammar_case_rule` `question` / `usage` / `transform` / `endings_*` for English
     speakers; don't translate them word for word. For example, «Кого? Что?» becomes
     "whom/what? (direct object)", and м.р./ж.р. become m./f.
   - Translate each sentence from the LT `display` + `full_word`, and cross-check it against the RU.
   - Keep the bracket-qualifier convention.
7. **Review gate:**
   - `apply_en_content.py --dry-run` writes `temp_files/screenshots/plan_48b_en-db-content/review.html`.
   - It is a table of LT source | RU | proposed EN, ordered by risk: every rule field, program,
     category, test and word-list row (about 150), then a random 10% of sentences and verbs.
   - Automatic pre-checks are flagged in the table: EN is empty, EN contains Cyrillic, a bracket
     qualifier is lost, or the EN/RU length ratio is off.
   - You review it before `--apply`.
8. **Category 2 rename:** update the lookups *and* insert values in `seed_skaitymas.py` (~542/551),
   `seed_skaitymas_new.py` (~509/518) and `scripts/test_seed.py:49`. First check whether
   `seed_skaitymas_new.py` is still in use; if it is dead, say so and leave it.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. This plan adds admin inputs next to existing ones and shows EN text in existing slots.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation
- [x] 1. `backend/migrations/versions/<id>_add_en_content_columns.py` + `backend/models.py` (Requirement 1). **Stop and ask the user to approve** `cd backend && .venv/bin/python -m alembic upgrade head` against the shared (prod) DB. Nothing below runs until that is done.
- [x] 2. Baseline: save the list of failing Playwright specs on the branch to `temp_files/screenshots/plan_48b_en-db-content/baseline-failures.txt`.
- [x] 3. API builders (Requirement 2).
- [x] 4. Admin writes, the wipe-bug fix and the admin EN inputs (Requirement 3).
- [x] 5. Frontend display (Requirement 4).
- [x] 6. Seed sources (Requirement 5): `data/constitution/program_data.json` + `seed_constitution_program.py`; `_SEED_PROGRAMS` and `seed_verbs_grammar.py`; `CASE_RULES` and `SENTENCES` in `seed_numbers_grammar.py`; the category-2 rename in the seed scripts (Requirement 8). Optionally add EN to `data/numbers/program_data.json`, so a future numbers seed doesn't bring the leak back.
- [x] 7. `backend/data/en_content/*.json` — Claude writes EN for all DB-only rows, following Requirement 6.
- [x] 8. `backend/scripts/apply_en_content.py` (Requirements 5 and 7).
- [x] 9. `documentation/en-content.md` — the column convention, seed file vs. `en_content`, the match keys and why ids are never used (`--reset` re-inserts rows), "re-run `apply_en_content.py` after any re-seed", the deferred `case_governance`, and why translations are committed files.
- [x] 10. `backend/tests/test_en_content.py` (SQLite test DB; it doesn't enforce FKs, per memory). It covers:
  - EN twins are served by every builder listed in Requirement 2.
  - Each new EN field survives a PATCH that omits it (sentence level toggle, program and category PATCH).
  - A word-list meta PATCH without `title_en` keeps the existing value.
  - `apply_en_content` fills only empty fields, a second run makes 0 changes, and an unknown key fails.
  - The verb key normalisation matches `dìrbti` → `dirbti` and splits `reñgti` by `translation_ru`.
  - No `*_en` value in `en_content/*.json` contains Cyrillic.
- [x] 11. `frontend/tests/plan48b-screenshots.spec.ts` — RU and EN × 1280 and 375, into `temp_files/screenshots/plan_48b_en-db-content/`, for:
  - the grammar rule card with endings
  - a sentence task and a verb task
  - the practice category description and a test description
  - a sekmes program list title
  - the admin category, program and sentence edit forms

  Mock the APIs with EN-complete fixtures.
- [x] 12. **Review gate** — run `apply_en_content.py --dry-run`, then **stop and ask the user** to review `review.html` (Requirement 7). *(manual)*
- [x] 13. **Prod apply** — `apply_en_content.py --apply`, only with explicit user approval. Report counts per table. Cached reads refresh within 10 minutes (`documentation/caching.md`). *(manual)*

## Validation
- [x] Backend: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] The 48a guard still passes: `cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts --reporter=list`
- [x] Parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots: `cd frontend && npx playwright test tests/plan48b-screenshots.spec.ts --reporter=list`, then look at every shot *(looking is manual)*
- [x] Full suite: no new failures vs `baseline-failures.txt`
- [x] After apply (manual, read-only): `apply_en_content.py --dry-run` reports 0 fields to fill

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts tests/design-system-parity.spec.ts tests/plan48b-screenshots.spec.ts --reporter=list
```

User-facing checks: **both languages (RU + EN)**, **mobile at 375px**, **screenshots proving each**
in `temp_files/screenshots/plan_48b_en-db-content/`. The review gate is passed, and the prod
apply is confirmed by you.

## Notes
- Cold risk review (2026-09-24): low risk for apply and deploy. Fixed before apply: skolinti → "to lend", privalėti/turėti "to must" → "must"/"to have to", žaibuoti → "to flash (of lightning)".
- Decided with the user: EN falls back to RU for practice descriptions when `_en` is empty (not hidden).
- Applied to prod: 956 fields + category 2 rename; follow-up dry-run reports 0.
- Found, out of scope: admin sentence-edit save re-enables all three `use_in_*` levels; admin grammar page shows program/case names in RU in EN mode.
