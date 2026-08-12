# Issue #151 — /dashboard/grammar/

**Reported:** 2026-08-10 11:48:24.937453
**Status:** open
**Description:** ~169 глаголов отдают неверные формы: сдвиг колонки при извлечении из PDF. У 'tu' одинокий комбинирующий акцент, соседняя колонка содержит форму другого времени. Пример: atsakyti — conditional.tu = 'atsakei' вместо 'atsakytum'. 124 в conditional.tu, 45 в past_simple.tu. Также verb 24 (buti), verb 303 (taisyti — основы утеряны). Регуляркой не чинится: нужен повторный разбор PDF (_parse_person_row) и сверка с учебником. Найдено при разборе #150. Пользователи учат неверные формы в уроках 208/209/224

## Root cause

Pipeline: `PDF → backend/scripts/extract_verbs_pdf.py → temp_files/verbs_extracted.json → backend/scripts/seed_verbs_db.py → verb table`.
Source PDF is still on disk: `temp_files/books/2015_365_lietuvių_kalbos_veiksmažodžiai_rusų_kalba.pdf` (gitignored).

`_parse_person_row` (`backend/scripts/extract_verbs_pdf.py:56-85`) does `line.split()` on `page.extract_text(x_tolerance=2, y_tolerance=2)` output (`:386`), then `_build_conjugations` (`:276-313`) maps token **position** to tense (`forms[0]→present, forms[1]→past_simple, forms[2]→conditional`). Any spurious token shifts every later column right.

**Two distinct failure modes, confirmed at the glyph level:**

1. **Zero-width combining marks split off as their own token.** Lithuanian stressed `i` renders as `i` + U+0307 + stress mark, all zero-width, positioned by absolute x. pdfplumber inserts a space whenever `x0 - prev_x1 > x_tolerance`; the 2.44 pt offset before U+0303 exceeds `x_tolerance=2`. Verb 7's `tu` row extracts as `'tu atsakai̇ ̃ atsakei̇ ̃ atsakýtum'` → `['atsakai̇','̃','atsakei̇','̃','atsakýtum']` → present=`atsakai̇`, past_simple=`̃`, conditional=`atsakei̇`. Exactly the reported defect. **169 cells** table-wide.

2. **A real U+0020 in the content stream lands between base letter and mark**, splitting the word (~71 verbs): `'jis, ji, jie, jos kabi̇ǹ a kabi̇ǹ o kabi̇ǹ tų'` → present=`kabi̇ǹ`, past_simple=`a`. This is the `kalbė́ti`/`taisýti` symptom and it also corrupts `infinitive`, `present_3p`, `past_3p` via `_parse_header` (`:40-53`) — DB holds `kalbė́ti / "kalb̃ a"`, `taisýti / "tai̇s̃ o"`, `augi̇ǹ ti`.

Verified DB scope (358 rows): 169 lone-mark forms; `infinitive` contains a space in **71** rows, `present_3p` in **75**, `past_3p` in **69**.

**No text is lost in the PDF — only mis-segmented.** Regex cannot fix it (reporter is right), but a geometry-based re-read can.

### Serving path

| Layer | Path |
| --- | --- |
| Page | `frontend/app/dashboard/grammar/page.tsx` — `verb_conjugation` card `:941-963`, grading `:627` |
| Grading | `frontend/lib/normalizeLt.ts` — `isAnswerMatch` strips U+0300/0301/0303, splits on `/` |
| Endpoint | `GET /api/grammar/verb-lessons/{id}/tasks` → `backend/routers/grammar.py:301-318` |
| Builder | `backend/grammar_service.py:371-419` `_generate_verb_conjugation_tasks` — sanitises `answer` via `_clean_form` (`:358-368`) but passes `verb.infinitive` **raw** (`:411`) |
| Lesson map | `backend/data/grammar/verb_lessons.json` |

Lessons **208/209/224** = `conditional`. The reporter missed that **202/203/221** = `indicative_past_simple` are hit by the same 45 shifted rows, and the stem-loss class also corrupts present, habitual, future and imperative.

Served pool is the 42 verbs tagged `sekmes` (`:372`). **18 of those 42** have a broken `conditional.tu` or `past_simple.tu` — `gyvénti`/`kèpti`/`gáuti` conditional.tu = `"̃"`, `darýti` = `"darei"`, `ieškóti` past_simple.tu = `"škai"`. Roughly 4 in 10 conditional-`tu` prompts are wrong today. `:407` only skips falsy forms, and `"̃"` is truthy.

## Fix plan

**Strategy: re-parse the PDF with a geometry-based column reader; use Lithuanian morphology as the *validator*, not the generator.**

Prototyped and run over all 365 pages read-only: **351/358 verbs parse into exactly 10 person rows, 0 lone-mark cells, 0 stray intra-cell spaces.** 2 256 of 10 530 slots (21%) change at letter level; sampled diffs are all corrections.

| verb | field | now | after |
| --- | --- | --- | --- |
| 7 `atsakýti` | `past_simple.tu` / `conditional.tu` | `"̃"` / `"atsakei"` | `atsakeĩ` / `atsakýtum` |
| 24 `bū́ti` | `past_simple` | `būnu/būni/būna/…` | `buvaũ/buvaĩ/bùvo/bùvome/bùvote` |
| 303 `taisýti` | `past_simple` | `"̃"/"o"/"ome"/"ote"` | `taisiaũ/taiseĩ/taĩsė/taĩsėme/taĩsėte` |
| 89 `kalbė́ti` | `present` jis/mes/jūs | `kalb̃` ×3 | `kal̃ba/kal̃bame/kal̃bate` |

*Rejected alternatives:* algorithmic regeneration from principal parts is attractive (Lithuanian is regular given the three principal parts) but those parts come from the **same broken tokenizer** (71/75/69 of 358 corrupt), can't produce the book's alternates (`bū́tume / bū́tumėme`) or irregulars, and would silently invent forms disagreeing with the textbook.

1. **Repair the venv.** `pdfplumber` currently fails to import in `backend/.venv`: `cryptography` 43.0.3 installed only `.pyi` stubs under `cryptography/hazmat/bindings/_rust/`, and `pdfminer/pdfdocument.py:13-14` imports it unconditionally. Run `backend/.venv/bin/pip install --force-reinstall cryptography`.

2. **Rewrite the extractor's row reader** in `backend/scripts/extract_verbs_pdf.py`:
   - Replace `page.extract_text(...)` + `line.split()` (`:386`, `:56-85`) with a char-level reader. Add `_page_rows(page) -> list[list[str]]`; have `parse_verb_page` consume cells, not a whitespace-split line.
   - Mark attachment: treat any char with `x1-x0 <= 0.01` or `unicodedata.combining(text)` as a mark; attach to the nearest *letter* cluster by x (skipping `' '`, `','`, `'/'` as targets). Fixes 169/169 lone marks and the `esi̇,̀` → `esì,` case.
   - Column boundaries **per page** from vertical whitespace corridors: project letter bboxes of the 10 person rows onto x, merge, cut at gaps ≥ 8 pt. (Hard-coded boundaries produce garbage on long-verb pages like `atostogáuti`.) Fall back to nominal `[95, 210, 315]` when <3 gaps found.
   - Assign clusters to columns by x0, then `unicodedata.normalize('NFC', …)`.
   - Run `_parse_header` (`:40-53`) on the reconstructed line so `infinitive`/`present_3p`/`past_3p` get fixed too.
   - Add `_normalize_form` post-pass: collapse `\s*/\s*` → `' / '`; dotted-i repair `re.sub(r'i̇([̀́̃])', r'i\1', s)` plus displaced variant `re.sub(r'i̇(\w)([̀́̃])', r'i\2\1', s)`.
   - Handle `jis, ji, jie, jos` bleeding into column 1 on narrow pages: reassemble `cell0 + cell1`, strip the literal prefix. Without this verb 303 comes out `'stai̇̇s̃o'`.

3. **Re-extract and diff — do not seed yet.** Copy the current `temp_files/verbs_extracted.json` aside first (it is the pre-#150 artifact and the best baseline). Run `validate_verbs.py --source json` and produce a per-verb diff report.

4. **Apply to production.** `verb.number` is a stable key (1–358 contiguous, matches printed book numbers; page index = `34 + json_index`, *not* `33 + number`). `seed_verbs_db.py`'s update branch (`:63-74`) keys on `number` and does not touch `programs`/`freq_rank`/`theme`:
   ```
   backend/.venv/bin/python backend/scripts/seed_verbs_db.py     # NOT --reset
   ```
   ⚠️ **`--reset` would delete and reinsert, wiping `programs`/`freq_rank`/`theme` set by `seed_verb_programs.py`, `reseed_verbs_by_theme.py`, `seed_verb_themes.py`, and orphaning `word` rows.** Snapshot `SELECT id, number, conjugations FROM verb` first; run in a transaction.

5. **Do NOT re-run downstream seeders.** `seed_verbs_vocabulary.py:135` copies `verb.infinitive` into `word.lithuanian`; those rows were already cleaned by #113/#114. Re-running risks resurrecting `UserWordProgress` mismatches. Leave the `word` table alone.

6. **Server-side hardening** in `backend/grammar_service.py`:
   - Extend `_clean_form` (`:358-368`) to drop marks-only forms; have `_generate_verb_conjugation_tasks` skip them (`:406-409` currently only skips falsy). A bare `"̃"` must never be served again, whatever the data says. *(Overlaps issue #153 step 3 — coordinate so the guard is written once.)*
   - Apply `_clean_form` to `verb.infinitive` at `:411` — today `augi̇ǹ ti` renders verbatim in the prompt.

7. **New validator** `backend/scripts/validate_verbs.py`, runnable against JSON or live DB (`--source json|db`), exit non-zero on hard failure.
   **Hard (must be 0):** (1) marks-only forms — `all(unicodedata.category(c)=='Mn' for c in form)`, currently 169; (2) intra-form whitespace other than ` / `, `, ` or the `tegu ` prefix — also on `infinitive`/`present_3p`/`past_3p`, currently 71/75/69; (3) cross-tense duplication — `conditional[p] == past_simple[p]` (the exact shift signature) and `past_simple[p] == present[p]` for non-`būti` verbs; (4) shape — 6 tense keys, 5 persons each, imperative 4 (no `aš`); (5) 10 person rows per page on re-parse, 3 580 total.
   **Soft (review list, don't gate):** (6) stem check — ≥3-char shared prefix with infinitive stem, after stripping stress; known false positives are prefixed verbs, ablaut (`áugti`→`áuk`), suppletives; (7) ending check — conditional `-čiau/-tum/-tų/-tume(-tumėme)/-tute(-tumėte)`, future `-siu/-si/-s/-sime/-site`, habitual `-davau/…` (these three tenses are 100% regular off the stem); (8) diacritic sanity — no residual `i` + U+0307 + non-mark + stress.

**Known limitation to accept:** mark *placement* stays approximate on mixed diphthongs (`pir̃kdavote` → `pirk̃tdavote`, `gul̃davotės` → `guld̃avotės`). Display-only — `normalizeLt.ts:9` strips U+0300/0301/0303 before comparing, so grading is unaffected. Handle via the validator's review list, don't block the fix.

**Needs the user's linguistic judgement:**
1. 7 corridor-detection failures — verbs **5, 31, 202, 203, 325, 326, 327** — hand-verify each page against the book (detect columns per 5-row block rather than per page for these).
2. `bū́ti` (24) and `eĩti` (48) are suppletive; the book prints two present paradigms (`esù, būnù` / `yrà, bū̃na`) in one cell. `isAnswerMatch` splits on `/`, **not** `,`, so `"esù, būnù"` is ungradeable today either way — product decision needed.
3. Mark placement on mixed diphthongs (worth a pass since #116 bolds stress marks).
4. Sign-off on ~2 256 changed forms. Suggest reviewing the 42-verb `sekmes` pool by hand first (that's what students see), shipping that, then the long tail.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - `frontend/tests/issue-151-verb-column-shift.spec.ts`, live-API style, same shape as `issue-150-verb-answer-no-trailing-comma.spec.ts`. Loop lessons `200,202,204,206,208,210` × 5 draws (pool is 42 verbs; one 20-task draw is not exhaustive). Assert `expect(task.answer).not.toMatch(/^[̀-ͯ]+$/)`, `expect(task.answer).not.toMatch(/\s(?!\/)/)`, `expect(task.answer.length).toBeGreaterThan(1)`.
   - Also add `backend/tests/test_verb_data_integrity.py` — hard checks (1)–(4) over a seeded fixture, plus a `"̃"`-only form asserting `_generate_verb_conjugation_tasks` skips it. `backend/conftest.py` doesn't register `Verb`; follow `test_verb_conjugation_tasks.py:21` (`Verb.__table__.create(_db.engine, checkfirst=True)`).
   - Regression run: `pytest backend/tests`, then `verbs_grammar.spec.ts`, `issue-138-verb-conditional-slash-answer.spec.ts`, `issue-150-*.spec.ts`, `issue-116-verbs-no-stress-marks.spec.ts`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #151 — ~169 глаголов отдают неверные формы: сдвиг колонки при извлечении из PDF. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 151;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-151-verb-conjugation-column-shift.md` → `plans/triage/implemented/IMPLEMENTED-issue-151-verb-conjugation-column-shift.md`).

---

## Outcome (implemented 2026-08-12)

**Resolved.** `mistake_report.status = 'resolved'`.

Root cause confirmed at glyph level, as planned. Implementation notes where reality differed
from the plan:

- **Mark anchoring rule.** Neither "the box containing the mark" nor "the last box ending
  before it" works for both widths — the mark sits ~1pt *inside* a wide `ė` but ~0.03pt
  *past* a narrow `i`. The invariant that holds everywhere: the anchor **starts at least
  ~1pt before the mark**. See `_mark_position` in `backend/scripts/extract_verbs_pdf.py`.
- **Line grouping.** Person labels sit ~0.8pt above their forms; modular `round(top/tol)`
  bucketing split rows at boundaries. Replaced with agglomerative clustering (`_group_lines`).
- **Column corridors.** Fixed thresholds fail on long-verb pages (`atostogáuti`). Take the
  three widest gaps after merging spans across all ten rows instead — the " / " gap in one
  row is filled by the others, so it is never mistaken for a corridor. All 7 predicted
  failure pages (5, 31, 202, 203, 325, 326, 327) now parse correctly; no hand-verification
  was needed.
- **Book errata, not extraction errors.** #118 `lankýti` and #213 `rašýti` are wrong *in the
  source PDF* (the page prints `mes rãšėme rãšėme`). Recorded in an `ERRATA` table rather
  than silently corrected.
- **Impersonal verbs.** 8 verbs (`lýti`, `reikė́ti`, `prasidė́ti`, `baĩgtis`, …) are
  third-person only by nature; the validator's shape check was relaxed for them.
- **The 7 zero-row pages** are continuation pages spilling prefix examples from the previous
  verb — not verb entries. 358 verb pages = 358 DB rows.

**Results:** 2 200 letter-level corrections across 284 verbs; infinitives containing a space
71 → 0; `validate_verbs.py` hard failures 433 → 0. Seeded via the update path — `programs`,
`freq_rank`, `theme` and all row ids verified unchanged against a pre-seed snapshot.

**Regression found and fixed during the work.** Restoring the faithful bū́ti cell
(`"esù, būnù"`; production had a truncated `esù,`) broke grading, because `isAnswerMatch`
split alternates only on `/`. It now splits on `,` too (`frontend/lib/normalizeLt.ts`), and
`issue-150-verb-answer-no-trailing-comma.spec.ts` was narrowed from "no comma at all" to
"no *trailing* comma" — the trailing comma was the actual #150 defect.

**Left open — needs a linguistic decision.** Verb #104 `kláusti`: the book prints its present
and future identically (`kláusiu`/`kláusi` in both). The extraction is faithful; the source is
inconsistent. 4 cells, outside the served `sekmes` pool, and suppressed by the guard, so no
user sees them. Add to `ERRATA` if the intended present is `klausiù`/`klausì`.

**Environment fix required:** `pdfplumber` could not import — `cryptography` had installed only
`.pyi` stubs. `backend/.venv/bin/pip install --force-reinstall cryptography`.

**Tests:** `backend/tests/test_verb_data_integrity.py` (45 cases),
`frontend/tests/issue-151-153-verb-forms-intact.spec.ts`,
`frontend/tests/issue-151-buti-comma-alternates.spec.ts`. Backend suite 237 passed.
