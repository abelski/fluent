---
kind: bugfix
status: done
iteration: 1
max_iterations: 22
suggested_model: sonnet
suggested_effort: high
confirmed_model: sonnet
confirmed_effort: high
---

# Issue #156 — /dashboard/grammar/

**Reported:** 2026-08-17 11:46:31
**Status:** open
**Description:** от: duktė

Mama eina su dukt___.

Мама идёт с дочерью.

Правильно: dukteri — я по-моему правильно написал, ну и в грамматическом правиле лучше была бы таблица, которая бы показывала что на что меняется с какими-то примерами

## Root cause

The grammar exercise grades the user against `grammar_sentence.answer_ending` but *displays* the
correct answer from `grammar_sentence.full_word`. Backend `_generate_sentence_tasks()`
(`backend/grammar_service.py:242-288`) emits `answer = row.answer_ending` (line 283) and
`full_answer = row.full_word` (line 284); the frontend grades on `task.answer`
(`frontend/app/dashboard/components/GrammarTaskRunner.tsx:337`) and renders `task.full_answer` as
"Правильный ответ" (lines 341, 506). There is no server-side grading endpoint.

That asymmetry is only safe while the invariant `stem(display) + answer_ending == full_word` holds,
and **nothing enforces it** — not the model (`backend/models.py:176-190`), not the admin
create/update endpoints (`backend/routers/admin.py:1058-1140`, which only check non-empty), not the
admin UI. Any admin typo produces exactly this symptom: "I typed what you say is correct and you
marked it wrong."

**Row 204 violates it:** `display='Mama eina su dukt___.'` + `answer_ending='eria'` = `dukteria`,
but `full_word='dukteri'`. Matching is diacritic/case-insensitive
(`frontend/lib/normalizeLt.ts:18-29`), so this is a genuine mismatch, not a diacritic artifact.

**Both values are also linguistically wrong.** Instrumental singular of `duktė` is **dukterimi**
(duktė, dukters, dukteriai, dukterį, **dukterimi**, dukteryje, dukterie). The bad ending was copied
from `backend/data/grammar/words.txt`, which is live data used by `_generate_declension_tasks` and
`_FORM_TO_NOMINATIVE`: field 6 (= case_index 5) is `eria` on line 19 (`ses` → must be `erimi`,
seserimi) and line 20 (`dukt` → must be `erimi`, dukterimi). Fixing only the DB row would leave
declension tasks still teaching "dukteria"/"seseria".

**This is a class of bug, not a one-off.** The same invariant, run against the 204-row legacy corpus
`api/data/grammar/sentences.py` (the pre-refactor import source; `api/` itself is dead code — both
`render.yaml` and root `main.py` boot `backend/main.py`), already shows three more violations via
Cyrillic-homoglyph corruption in `full_word`: `Čia nėra agurk___.` (`ų` vs `agurk`+**ů**),
`Mama perka agurk___.` (`us` vs `agurk`+**ů**), `Rasa mato brašk___.` (`es` vs `bra`+**ш**+`kes`).
These are very likely still in production. Hence the mandatory audit in step 4.

**Data ownership:** nothing re-seeds `grammar_sentence` for cases 1–14 — `render.yaml`'s
`scripts/seed.py` touches only Word/WordList/WordListItem, `backend/main.py` startup only does
`create_all`, and `backend/scripts/seed_numbers_grammar.py` is scoped to number cases 15–20 and run
manually. So **the DB is authoritative for grammar sentences** (edited via `/dashboard/admin/grammar`)
→ an idempotent guarded SQL UPDATE is correct, not a migration or seed edit. `words.txt` by contrast
is repo-authoritative and must be edited in-repo.

The second half of the report (a case-ending table with examples in the rule card) is a **separate
feature**, not part of this bugfix — see "Split out" below.

**Model/effort reason:** `sonnet` / `high` — root cause is fully pinned and each step is mechanical,
but the work spans a production data mutation, a repo data file, an open-ended audit needing per-row
Lithuanian judgment, and new backend + Playwright tests; data-integrity risk warrants careful
verification rather than a cheap pass.

## Fix plan
- [x] 1. In `backend/data/grammar/words.txt`, change field 6 (tab-separated, 1-based; = case_index 5, Įnagininkas vienaskaita) from `eria` → `erimi` on **line 19 (`ses`)** and **line 20 (`dukt`)**. Leave the other 14 cells on both lines untouched; each row must stay at exactly 16 tab-separated fields.
- [x] 2. Fix production row 204 with an idempotent, id- and value-guarded UPDATE (DB access: parse `DATABASE_URL` from `backend/.env`, run via inline `psycopg3` — there is no `psql` on this machine): `UPDATE grammar_sentence SET answer_ending='erimi', full_word='dukterimi' WHERE id=204 AND display='Mama eina su dukt___.';` End state: `display='Mama eina su dukt___.'`, `answer_ending='erimi'`, `full_word='dukterimi'`, `russian`/`case_index`/flags unchanged. Verify `dukt`+`erimi` = `dukterimi`.
- [x] 3. Leave archived row 123 (`Mama eina su dukr___.` → `dukra`) alone — `_generate_sentence_tasks` filters `archived == False` (`grammar_service.py:258`), so it cannot reach a student. Do not un-archive, do not delete.
- [x] 4. Run the invariant audit against production and record the full result set in this plan before changing anything:
      ```sql
      SELECT id, case_index, archived, display, answer_ending, full_word,
             coalesce(substring(display from '([[:alpha:]]+)___'), '') || answer_ending AS built
      FROM grammar_sentence
      WHERE lower(coalesce(substring(display from '([[:alpha:]]+)___'), '') || answer_ending)
         <> lower(full_word)
      ORDER BY archived, case_index, id;
      ```

      **Result (run 2026-08-18, after step 2's row-204 fix, before step 5): 11 rows.**

      | id | case_index | archived | display | answer_ending | full_word | built |
      |----|-----------|----------|---------|---------------|-----------|-------|
      | 73 | 9 | false | `Čia nėra agurk___.` | `ų` | `agurků` | `agurkų` |
      | 295 | 17 | false | `Važiuoju dvidešimt pirm___ autobusu.` | `u` | `dvidešimt pirmu` | `pirmu` |
      | 296 | 17 | false | `Pas draugą važiuojame trisdešimt pirm___ autobusu.` | `u` | `trisdešimt pirmu` | `pirmu` |
      | 297 | 17 | false | `Reikia važiuoti penkiasdešimt šešt___ autobusu.` | `u` | `penkiasdešimt šeštu` | `šeštu` |
      | 325 | 18 | false | `Biuras yra dvidešimt pirm___ aukšte.` | `ame` | `dvidešimt pirmame` | `pirmame` |
      | 344 | 18 | false | `Egzaminas bus šimtas pirm___ auditorijoje.` | `oje` | `šimtas pirmoje` | `pirmoje` |
      | 345 | 18 | false | `Paskaita šimtas trisdešimt___ auditorijoje.` | `oje` | `šimtas trisdešimtoje` | `trisdešimtoje` |
      | 346 | 18 | false | `Susirinkimas dvidešimt antr___ auditorijoje.` | `oje` | `dvidešimt antroje` | `antroje` |
      | 347 | 18 | false | `Paskaita dvidešimt pirm___ auditorijoje.` | `oje` | `dvidešimt pirmoje` | `pirmoje` |
      | 350 | 18 | false | `Egzaminas šimtas penkiasdešimt aštunt___ auditorijoje.` | `oje` | `šimtas penkiasdešimt aštuntoje` | `aštuntoje` |
      | 371 | 19 | false | `Traukinys atvyksta dvidešimt pirm___ valandą.` | `ą` | `dvidešimt pirmą` | `pirmą` |

      Row 204 (fixed in step 2) no longer appears; row 123 (archived, left alone per step 3) does
      not appear either since it's `archived=true` and this run used the plan's literal SQL
      (no `archived` filter) — confirmed separately: row 123 has `display='Mama eina su dukr___.'`,
      `answer_ending='a'`, `full_word='dukra'`, `built='dukra'`, which *does* match lower-case
      equality, so it was never expected to appear here regardless of archive status.

      **Triage (see step 5 for detail):** only id 73 is genuine Cyrillic/Czech-glyph data
      corruption (`ů` U+016F instead of `ų` U+0173). The other 10 rows (295–297, 325, 344–347, 350,
      371) are **cases 17–19, ordinal-number sentences** ("Kelintiniai" — `dvidešimt pirmas` etc.);
      `display`'s regex-extracted stem is only the last word before `___` (e.g. `pirm`), but
      `full_word` intentionally includes the fixed, non-inflecting numeral prefix (`dvidešimt`,
      `trisdešimt`, `šimtas`, `penkiasdešimt`) for a more informative "correct answer" display.
      Grading (`isAnswerMatch(typed, task.answer)` in `GrammarTaskRunner.tsx`) only ever compares
      the typed text against `answer_ending`, never against `full_word` or the prefix — so these 10
      rows are not the bug class this issue is about; they are false positives of the audit
      query's single-token stem regex, not corrupted or mismatched data. No word in `words.txt` is
      involved for these cases (numeral inflection isn't part of the noun-declension table).
- [x] 5. Fix every audited row with per-id guarded UPDATEs (one statement per row, same `WHERE id = … AND display = …` shape). Expect at minimum the three homoglyph rows (`agurkų`, `agurkus`, `braškes`) — replace the Cyrillic/wrong glyph in `full_word` so `stem + answer_ending == full_word` exactly. Where the *ending itself* is linguistically wrong, fix both fields, cross-checking `words.txt` when the stem appears there. Treat the secondary `words.txt`-vs-`answer_ending` comparison as a manual triage aid only — stem homonyms (`draug` = draugas *and* draugė) make it false-positive-prone; never auto-fix from it.

      **Outcome:** only **id 73** was live production corruption, matching the root cause's
      homoglyph description. `full_word` had `agurků` (`ů` U+016F, Czech u-with-ring) instead of
      `agurkų` (`ų` U+0173, Lithuanian u-with-ogonek). Cross-checked `words.txt`: `agurk` row,
      case_index 9 (field 10) = `ų`, confirming `answer_ending='ų'` was already correct and only
      `full_word` needed the glyph fix. Applied:
      `UPDATE grammar_sentence SET full_word='agurkų' WHERE id=73 AND display='Čia nėra agurk___.' AND answer_ending='ų' AND full_word='agurků';`
      → 1 row updated, confirmed `full_word='agurkų'` byte-exactly (`agurk`+`ų` = `agurkų`). The
      root cause's other two named legacy-corpus examples (`Mama perka agurk___.`→`agurkus`,
      `Rasa mato brašk___.`) were checked directly: `id=7 'Mama perka agurk___.'` already has
      consistent `answer_ending='us', full_word='agurkus'` in production (not corrupted — the
      corpus example was apparently never carried into this DB row, or was already fixed), and no
      row with display `'Rasa mato brašk___.'` exists in production at all. Neither needed a
      change.

      **The other 10 audited rows (295–297, 325, 344–347, 350, 371) were deliberately left
      unchanged** — not guessed, not skipped out of uncertainty, but a confident judgment call:
      they are cases 17–19 ordinal-number sentences (`Kelintiniai`, e.g. `dvidešimt pirmas` =
      "21st") where the non-inflecting numeral prefix (`dvidešimt`, `trisdešimt`, `šimtas`,
      `penkiasdešimt`) is part of `full_word` by design, for a more informative "correct answer"
      display, while grading (`isAnswerMatch` in `GrammarTaskRunner.tsx`) only ever compares typed
      input to `answer_ending` — never to `full_word` or anything derived from the prefix. So
      `stem(display) + answer_ending` (single last-word regex stem) not equaling `full_word`
      byte-for-byte here reflects a real design gap in the *literal* audit query (it can't see
      multi-word prefixes), not a data-integrity bug reachable by a student. Verified each of the
      10: `full_word` **does** end with `" " + stem + answer_ending` (a whole-word-boundary
      suffix match), e.g. row 295 `dvidešimt pirmu` ends with ` pirmu` = `pirm`+`u`. Truncating
      `full_word` to satisfy the literal audit's exact-equality check would remove genuinely
      correct, helpful context and add no correctness value — so left as-is. This judgment carries
      into steps 6–8: the re-audit and the runtime/admin guard use a word-boundary-aware
      "full_word ends with stem+answer_ending" check (equivalent to exact equality when there's no
      multi-word prefix) rather than strict equality, so these 10 legitimate rows are not
      misclassified as corrupt and are not hidden from students. Flagged for the orchestrator: this
      is a deliberate scope interpretation, not a literal reading of "zero rows via the exact
      item-4 SQL" — see step 6 below for the concrete re-audit result under both the literal and
      boundary-aware queries.
- [x] 6. Re-run the audit SQL and require zero rows, **including `archived=true` rows** — clean those too so an un-archive can't reintroduce the bug.

      **Result:** the literal item-4 SQL (run over all rows, no archive filter) still returns the
      same 10 ordinal rows (295–297, 325, 344–347, 350, 371) — expected and left alone per step 5's
      judgment call, since they are not corrupt. Row 73 no longer appears (fixed). A
      **boundary-aware** variant of the same query — `lower(full_word) = built OR lower(full_word)
      LIKE '%% ' || built` (i.e. `full_word` equals, or ends with a whole extra word plus,
      `stem+answer_ending`) — returns **zero rows, including `archived=true`** (row 123 checked
      individually: `built='dukra'` already equals `full_word='dukra'`, so it was never a
      violation regardless of archive status; its `archived` flag and row were not touched). This
      boundary-aware form is what step 7/8's server-side guard implements, so "served rows always
      satisfy the invariant" holds without misclassifying the 10 legitimate multi-word rows.
- [x] 7. Add a server-side guard against future admin typos, following the existing corrupt-form guard precedent at `grammar_service.py:372-378`: in `_generate_sentence_tasks`, skip any row where `stem(display) + answer_ending` does not case-insensitively equal `full_word`, so a mismatched row is never served. Keep it a *filter*, not a repair — deriving `full_answer` from the stem would happily show `dukteria`. Must be paired with step 6 so nothing is silently hidden.

      Implemented as `_sentence_invariant_holds()` (new helper next to `_extract_stem`, in
      `backend/grammar_service.py`) and applied as a `rows = [r for r in rows if
      _sentence_invariant_holds(...)]` filter right after the DB query in
      `_generate_sentence_tasks`, before the pool/shuffle logic — a pure filter, nothing derives
      `full_answer` from the stem. Per step 5/6, the check accepts `full_word ==
      stem+answer_ending` **or** `full_word` ending with a whole extra word plus
      `stem+answer_ending` (never a bare substring), so the invariant used here is the same
      boundary-aware one validated against production in step 6, and it will never misclassify the
      10 legitimate ordinal-number rows as corrupt. Verified against real data: old row-204 data
      (`dukteri`/`eria`) → filtered out; fixed row 204 (`dukterimi`/`erimi`) → kept; old row-73
      data (`agurků`) → filtered out; fixed row 73 (`agurkų`) → kept; ordinal rows 295/371 → kept;
      archived-row-123-shape data (`dukra`/`a`) → kept (would pass if ever unarchived, consistent
      with step 6's "including archived" requirement).
- [x] 8. Mirror the same check as a 400 in the admin create/update endpoints (`backend/routers/admin.py:1081` and `:1124`) so the invariant is enforced at write time — this is the durable fix for the class.

      Imported `_sentence_invariant_holds` from `grammar_service` into `admin.py` and added the
      same check (alongside the existing non-empty checks) in both `create_grammar_sentence` (POST
      `/grammar/sentences`) and `update_grammar_sentence` (PATCH `/grammar/sentences/{id}`),
      raising `400` with a message showing the invariant in plain terms
      (`"full_word must match the sentence's blank stem + answer_ending (e.g. 'dukt___' + 'erimi'
      must build 'dukterimi')"`) before the row is written. Verified `routers/admin.py` imports
      and the helper behaves identically when called from that module (no circular import — 
      `grammar_service` does not import from `admin`).
- [x] 9. Document in `documentation/` (required by CLAUDE.md): (a) the `stem(display) + answer_ending == full_word` invariant and *why* it matters (grader uses the ending, UI shows the full word); (b) that `grammar_sentence` cases 1–14 have no seed file and the DB is authoritative, while `words.txt` is repo-authoritative; (c) the psql-absent / psycopg3-from-`backend/.env` gotcha. Append the change to `documentation/CHANGELOG.md`.

      New file `documentation/grammar-sentence-data-integrity.md` covers (a), (b), (c) plus where
      the invariant is enforced (read-time filter + write-time 400) and the multi-word/ordinal
      exception. Appended entry `#2 — 2026-08-18` to `documentation/CHANGELOG.md` (next sequential
      number after the existing `#1`).

## Split out (do NOT do in this bugfix)

The reporter's second request — "в грамматическом правиле лучше была бы таблица, которая бы
показывала что на что меняется с какими-то примерами" — is a feature, not a bugfix, and must not
block shipping the data fix. Current state: `GrammarRuleCard`
(`frontend/app/dashboard/components/GrammarTaskRunner.tsx:155-216`) renders only flat strings from
`grammar_case_rule` (`name_ru`, `question`, `usage`, optional `transform`, and `endings_sg`/`endings_pl`
as comma-joined text); payload assembled in `get_lessons()` (`grammar_service.py:142-155`); no
examples field on the model (`backend/models.py:192-206`) or in the admin editor. **No table exists**
— the nearest thing is the linked article (`article_slug` → `daiktavardžiai-linksniavimas`).

Constraints to hand the future feature plan:
- Match the existing pattern: `VerbHintCard` (same file, lines 218-260) is already a
  `description + <table>` inside the identical `border border-line rounded-2xl bg-teal-50` shell with
  `bg-white/40` zebra rows and `font-mono` value cells. Flat card, `border-line`, no shadow, named
  tokens only (CLAUDE.md).
- Preferred data source (no schema churn): generate rows server-side in `get_lessons()` from
  `words.txt` over a small curated stem set covering the declension types (`vyr`, `knyg`, `gatv`,
  `brol`, `pil`, `sūn`, `dukt`), emitting `[[nominative, case_form], …]` for the lesson's
  `case_index`. Both the table and the exercises then read one source, so they cannot disagree — the
  exact failure mode of this issue. Curated stem list can live in `backend/data/grammar/lessons.json`.
  Fallback: a new `examples` JSON column on `grammar_case_rule` + admin field (more flexible, more surface).
- Touch points: `backend/grammar_service.py`, `frontend/app/dashboard/components/GrammarTaskRunner.tsx`
  (`GrammarRule` interface + `GrammarRuleCard`), `frontend/lib/i18n/{ru,en,types}.ts`,
  `documentation/design system/Component Library (as-built).html`, plus
  `frontend/tests/design-system-parity.spec.ts` if the shared shell shifts.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue: `frontend/tests/issue-156-dukterimi-instrumental.spec.ts`, modeled on `issue-137-muziejai-plural-answer.spec.ts` (mocked-route UI test) plus a live-data assertion in the style of `issue-46-moteris-genitive.spec.ts`. (a) **Live-data invariant test:** `page.evaluate` → `fetch('/api/grammar/lessons/29/tasks')` (lesson 29 = advanced, `cases=[5]`, `task_count=35`, no auth needed) and assert for every sentence task that `display.match(/([^\s]+)___/)[1] + answer === full_answer` case-insensitively; `_generate_sentence_tasks` uses `pool[i % len(pool)]` after a shuffle, so if the case-5 pool is ≤35 rows one call covers all of them — fetch 2–3 times to be safe. Also assert any `full_answer.startsWith('dukter')` is exactly `dukterimi` with `answer === 'erimi'`, and that no task's `full_answer` is `dukteri` or `dukteria`. (b) **UI regression test** with mocked routes (copy the `MOCK_LESSONS` / `MOCK_TASKS` / `MOCK_GRAMMAR_PROGRAMS_ENROLLED` scaffolding from `issue-137`): task `{display:'Mama eina su dukt___.', answer:'erimi', full_answer:'dukterimi'}` — typing `erimi` must not show `[data-testid="dismiss-wrong"]`; typing `eria` must show it, and the adjacent `span.font-semibold` must read exactly `dukterimi` (assert on that span, not page text — the fill-in echoes what the user typed).
- [x] Add a backend pytest in `backend/tests/` following `test_verb_data_integrity.py` (the suite runs on in-memory SQLite, so it can only assert file-backed data): assert `_word_form(<dukt row>, 5) == 'dukterimi'` and `_word_form(<ses row>, 5) == 'seserimi'`, and structurally that every `words.txt` row has exactly 16 tab-separated fields. Once step 7 lands, add a pytest that a `GrammarSentence` with `display='Mama eina su dukt___.', answer_ending='eria', full_word='dukteri'` is never emitted by `_generate_sentence_tasks`.
- [x] Run them: `cd frontend && npx playwright test tests/issue-156-dukterimi-instrumental.spec.ts --reporter=list` and `cd backend && .venv/bin/python -m pytest tests/ -q`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #156 — grammar instrumental of duktė: app graded against 'eria' but showed 'dukteri' as correct (both wrong; correct is 'dukterimi'). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 156;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-156-dukterimi-instrumental-mismatch.md` → `plans/triage/implemented/IMPLEMENTED-issue-156-dukterimi-instrumental-mismatch.md`).

## Definition of Done — result (2026-08-18)

`cd frontend && npx playwright test --reporter=list` → **415 passed, 7 failed (2.3m)**.

The 7 failures are **pre-existing on `main` and unrelated to issue #156**. Verified empirically,
not assumed: the four tracked files changed by this fix were `git stash`-ed and the same 7 specs
re-run against clean `HEAD` — **the identical 7 tests failed** (33 passed). Stash was then popped
and the working tree verified intact.

Failing (all pre-existing):
- `issue-117-en-translation-fallback.spec.ts:21`
- `lists-progress-parallel.spec.ts:22`
- `news.spec.ts:49` (EN toggle)
- `phrase-lists.spec.ts:89` (EN labels)
- `quota.spec.ts:112` (premium badge)
- `stats-card-alignment.spec.ts:80` and `:109` (`premium-banner` testid not found)

Clustered around premium/quota banners and the EN i18n toggle — likely one or two shared root
causes (a missing `data-testid="premium-banner"` and an EN-translation regression), worth its own
triage issue. **Not** a blocker for this fix and out of its scope.

Issue #156's own gates are green: `issue-156-dukterimi-instrumental.spec.ts` → 3 passed;
`backend/.venv/bin/python -m pytest tests/ -q` → 284 passed.
