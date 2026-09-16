---
kind: feature
status: hold
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# Plan #33 — TAKAS B1 vocabulary program

## Context

The app already ships four textbook-derived vocabulary programs: `sekmes` (A1),
`lithuanian_daily_language` (A1-A2), `_2` (B1-B2), `_3` (C1), plus `verbs_365`, `konstitucija`,
`regitra`. Each one is pure data — a `SubcategoryMeta` row plus one `WordList` per chapter plus
`Word`/`WordListItem` rows. No frontend or API code is program-specific; `/dashboard/lists` and
`/programs/<key>` render whatever the DB holds, and `SubcategoryMeta.name_ru`/`name_en` supply both
languages. Reference implementation: `backend/seed_ne_dienos_3.py` (596 lines, inline `LESSONS`
list of `(lithuanian, russian, english)` tuples, dedupes against existing `Word` rows, writes the
program as `status='draft'`).

**TAKAS** — *Lietuvių kalba kitakalbiams, B1 lygis*, Čubajevaitė / Ruzaitė / Lemanaitė, VDU +
Versus aureus, Kaunas 2014, ISBN 978-609-467-016-9, free online at
`ebooks.vdu.lt/einfo/1957/`. PDF is already on disk: `temp_files/books/TAKas.pdf`, 261 pages.
It fills the real B1 gap between `lithuanian_daily_language` (A1-A2) and `_2` (B1-B2).

The book has **no per-lesson glossary** — there is no word list to lift. Vocabulary has to be
pulled out of the lesson texts and curated. That is the whole risk of this plan: past triage
issues (#121 `rezervuoti`, #134 `keistis`, #152 `bendradarbis`, #154 `baigti`) were all bad
translations shipped into `word` rows. So the plan has a **hard human review gate**: the curated
lists land as markdown in `temp_files/takas/` and nothing touches the database until the user has
read them.

`suggested_model: opus` / `suggested_effort: high` — the extraction script and seed script are
mechanical, but ~450 hand-translated B1 words into two languages is exactly where this repo has
shipped bugs before.

### Book structure (verified against the PDF)

`pdf_index = printed_page - 1`.

| # | Theme | Title | Printed | PDF idx |
|---|-------|-------|---------|---------|
| 1 | DRAUGYSTĖ | Pasakyk, kas tavo draugas, ir aš pasakysiu, kas tu | 9–26 | 8–25 |
| 2 | DRABUŽIAI, APSIPIRKIMAS | Pagal rūbus sutinka, pagal protą palydi | 27–46 | 26–45 |
| 3 | MAISTAS | Vien meile sotus nebūsi | 47–70 | 46–69 |
| 4 | BENDRAVIMAS | Kaip šauksi, taip atsilieps | 71–94 | 70–93 |
| 5 | KELIONĖS | Visur gerai, namie geriausia | 95–119 | 94–118 |
| 6 | LAISVALAIKIS | Mūsų dienos kaip šventė | 120–143 | 119–142 |
| 7 | NAMAI | Mano namai – mano tvirtovė | 144–162 | 143–161 |
| 8 | ŠVENTĖS | Viskas gerai, kas gerai baigiasi | 163–175 | 162–174 |

Answers section is pdf idx 175–223, grammar appendix idx ~224–260 — both **excluded**.

## Goals

- A new `takas` vocabulary program, B1, 8 chapters (one per *žingsnis*), ~50–60 words each
  (~450 words total), titles and descriptions in both RU and EN.
- Vocabulary actually drawn from the book's lesson texts, not invented from the chapter theme.
- The 8 curated lists are reviewable as plain markdown **before** anything is written to the DB.
- Seeded as `status='draft'`, so the user flips it to published from the admin panel.

## Non-Goals

- The grammar appendix (pdf idx ~224–260). Separate feature if wanted.
- Reading articles from the lesson texts — copyrighted, mostly reprints of other authors.
- The book's audio files.
- Any schema change, API change, or frontend component change. This is data only.
- Phrases, grammar sentences, practice tests.

## Requirements

1. `backend/scripts/extract_takas_vocab.py` — read-only extraction, writes candidates to
   `temp_files/takas/`. Never touches the DB.
2. Candidate tokens are normalised: NFC, lowercased, combining stress marks stripped via the
   existing `verb_lookup._strip_accent_marks()` (`backend/verb_lookup.py:71`). No stress marks may
   reach a `Word.lithuanian` value — see issues #116, #124, #131.
3. Curated lists live in `temp_files/takas/lesson_<N>.md` as a `| lietuviškai | по-русски |
   english |` table, dictionary forms only (nominative singular for nouns, infinitive for verbs).
4. **Review gate**: after the md files exist, stop and report. No DB write, no seed script run,
   until the user approves.
5. `backend/seed_takas.py` mirrors `seed_ne_dienos_3.py` exactly: guard on existing
   `SubcategoryMeta`, dedupe `Word` on `lithuanian`, `status='draft'`, `cefr_level='B1'`,
   `difficulty='medium'`, `article_url` pointing at the free VDU e-book page.
6. Program keys/labels:
   - `key='takas'`
   - `name_ru='Флешкарты для тех, кто изучает литовский язык по учебнику TAKAS (B1)'`
   - `name_en='Flashcards for learners of Lithuanian using the textbook TAKAS (B1)'`
   - `sort_order` = between `lithuanian_daily_language` (2) and `_2` (3) — use the
     `/api/admin/subcategories/reorder` endpoint or set it explicitly; do not rely on `max+1`,
     which would bury it after `regitra`.
7. No word may be added whose accent-folded `lithuanian` already exists in `word` (4392 rows
   today) — reuse the existing row instead, as `seed_ne_dienos_3.py` already does.

### Standing constraints

- All validation must be server-side (never frontend-only).
- Design system: **N/A for markup** — this plan adds no UI. But the new program card and
  `/programs/takas` must be screenshotted and must look identical to the existing program cards;
  if they don't, that's a bug in this plan's data, not a licence to restyle.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [ ] 1. `backend/scripts/extract_takas_vocab.py` — new script. `pdfplumber` (already in
      `backend/.venv`, see `backend/scripts/extract_verbs_pdf.py`). Per lesson: concatenate its
      page range, tokenise on Lithuanian letters, fold via
      `verb_lookup._strip_accent_marks()`, lowercase, drop tokens < 4 chars, drop a small
      stoplist of exercise boilerplate (`užduotis`, `perskaitykite`, `parašykite`, `pasakykite`,
      `tekstas`, `žingsnis`, `takas`, …), count frequency. Writes
      `temp_files/takas/<N>_candidates.md`: rank, token, count, and a flag for tokens whose
      folded form already matches a `word.lithuanian` row (soft signal only — DB read is
      read-only).
- [ ] 2. Run it. Sanity-check: 8 files, each with a few hundred candidates, no stress marks,
      no page-header junk (`TAKAS`, `žingsnis`, page numbers).
- [ ] 3. Curate. For each lesson, read the candidate file **and the lesson's PDF pages**, pick
      ~50–60 words that the lesson actually teaches, convert each to dictionary form, and write
      `temp_files/takas/lesson_<N>.md` with the RU and EN translations. Rules: no stress marks,
      no duplicates within a lesson, both translations non-empty, prefer the sense the book uses.
- [ ] 4. **STOP — review gate.** Report the 8 files and the word counts to the user. Do not
      proceed to step 5 until the user approves the content.
- [ ] 5. `backend/seed_takas.py` — new script, copy the shape of `backend/seed_ne_dienos_3.py`.
      `PROGRAM_KEY='takas'`, inline `LESSONS` list built from the approved md files (inline, not
      reading `temp_files/`, which is gitignored — same as the other three book seeds so the
      data is committed and reproducible). Explicit `sort_order`, `status='draft'`.
- [ ] 6. `backend/tests/test_takas_program.py` — new. Imports `LESSONS` from `seed_takas` and
      asserts, without touching the DB: 8 lessons; every lesson has ≥ 40 entries; every tuple has
      3 non-empty fields; no `lithuanian` contains a combining mark (reuse
      `verb_lookup._strip_accent_marks` — folded must equal original); no duplicate `lithuanian`
      within a lesson; titles and `title_en` both set.
- [ ] 7. `frontend/tests/takas-program.spec.ts` — new. Mocks `/api/words/subcategory-meta` and
      the lists endpoint (copy `frontend/tests/issue-115-verbs-thematic-grouping.spec.ts`),
      visits `/programs/takas`, asserts the 8 chapter titles render, and asserts the EN locale
      shows `title_en` not the Lithuanian title.
- [ ] 8. Run `backend/seed_takas.py` against the production DB (it self-guards on re-run).
- [ ] 9. Screenshots into `temp_files/screenshots/plan_33_takas-b1-vocabulary/` — see Validation.
- [ ] 10. `documentation/CHANGELOG.md` — append entry `| 33 | 2026-09-16 | …`.

## Validation

- [ ] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_takas_program.py -q`
- [ ] Full backend suite still green: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Playwright autotest added and passing: `frontend/tests/takas-program.spec.ts`
- [ ] Design-system parity unaffected: `npx playwright test tests/design-system-parity.spec.ts`
- [ ] Data check against the live DB after seeding: `takas` has exactly 8 non-archived
      `word_list` rows, each with ≥ 40 `word_list_item` rows, and
      `select count(*) from word where lithuanian ~ '[̀-ͯ]'` returns 0.
- [ ] Program is invisible to normal users while `status='draft'` — confirm `/dashboard/lists`
      does not show it before the flip.
- [ ] Manual smoke: flip to `testing`/`published` in `/dashboard/admin`, open `/programs/takas`,
      start a study session on lesson 1, answer one card.
- [ ] News post written and published via `/news-writer`.

### Screenshots (required, in `temp_files/screenshots/plan_33_takas-b1-vocabulary/`)

Driven by Playwright against the local server with the API mocked. Mock `/api/billing/config` to
`{"enabled": true}` — it returns `false` locally without a Stripe key, so an unmocked shot would
show a state production users never see (CLAUDE.md).

- [ ] `/dashboard/lists` with the program card — RU, desktop 1280px
- [ ] `/dashboard/lists` with the program card — EN, desktop 1280px
- [ ] `/dashboard/lists` with the program card — RU, 375px
- [ ] `/dashboard/lists` with the program card — EN, 375px
- [ ] `/programs/takas` chapter grid — RU + EN, desktop and 375px
- [ ] One study card from lesson 1 — RU + EN, 375px
- [ ] Look at every shot and state what it shows before declaring done.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```

Plus, for this user-facing change, all three explicit checks above:
**RU + EN**, **mobile at 375px**, and **screenshots proving each**, stored in
`temp_files/screenshots/plan_33_takas-b1-vocabulary/`.
