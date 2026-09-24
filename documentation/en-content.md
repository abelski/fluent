# EN twins for admin-authored content (#48b)

Admin-authored content was Russian-only, so EN mode showed Russian. #48b gives every piece of
user-visible content an English twin.

## Column convention

- The EN twin is a nullable column next to the RU one: `description_en`, `question_en`,
  `name_en`, `usage_en`, `transform_en`, `endings_sg_en`, `endings_pl_en`, `translation_en`, and
  `grammar_sentence.english` (named after `russian`).
- NULL means "not translated". The API serves both fields, and the frontend shows
  `(lang === 'en' && en) || ru`, so a missing translation falls back to RU instead of showing an
  empty slot.
- Admin writes (`routers/admin.py`, `routers/practice.py`) set an EN field **only when it is in
  `body.model_fields_set`**. They strip it, and an empty string becomes NULL. Some PATCHes
  overwrite every field (sentence, program, rule), and the sentence-level toggle in the admin UI
  PATCHes without `english`. Without this rule, a toggle would silently wipe the translation.
  The word-list meta PATCH had exactly this bug for `title_en`, and it is fixed the same way.
- There is no admin editor for rule EN fields, verb translations or word-list descriptions. They
  come from the sources below, or from the backend PATCH where one exists.

## Where the English lives

| Content | Source of truth | Match key |
|---|---|---|
| Constitution test descriptions | `data/constitution/program_data.json` (`description_en`) | category 1 + `sort_order` |
| Grammar programs 1–2 | `_SEED_PROGRAMS` in `routers/grammar.py` | `title` |
| Grammar programs 3–4 | `PROGRAMS` in `scripts/seed_verbs_grammar.py` | `title` |
| Number rules (cases 15–20) | `CASE_RULES` in `scripts/seed_numbers_grammar.py` | `case_index` |
| Number sentences (cases 15–20) | `SENTENCES` in `scripts/seed_numbers_grammar.py` (6th tuple element) | `(case_index, display, russian)` |
| Verb translations | `scripts/verb_translations_en.py`, plus `data/en_content/verbs.json` for homographs | infinitive with stress marks stripped (+ `translation_ru` for homographs) |
| Case rules 2–13 (DB-only) | `data/en_content/grammar_case_rules.json` | `case_index` |
| Sentences for cases 2–13 (DB-only) | `data/en_content/grammar_sentences.json` | `(case_index, display, russian)` |
| Word-list titles/descriptions (DB-only) | `data/en_content/word_lists.json` | `(subcategory, title)` |
| Practice category description | `data/en_content/practice_categories.json` | `id` (only 2 stable rows) |

`scripts/apply_en_content.py` reads every source above and fills **only empty** EN fields. It
parses the seed files with `ast` and never imports or runs them. A key that matches no row stops
the whole run before any write. The run is idempotent: a second run fills 0 fields.

- `--dry-run` (the default) writes `temp_files/screenshots/plan_48b_en-db-content/review.html`.
  This is a review table (LT source | RU | proposed EN) with automatic pre-check flags: EN is
  empty, EN contains Cyrillic, a bracket qualifier was lost, or the EN/RU length ratio is outside
  0.5–2.0.
- `--apply` writes to the DB. It also renames practice category 2 from `name_en = 'Skaitymas'` (a
  Lithuanian word) to `Reading`. The rename only happens while the old value is still there.

**Re-run `apply_en_content.py` after any re-seed.** Seeds that support `--reset` (e.g.
`seed_numbers_grammar.py --reset`, `seed_constitution_program.py --reset`) delete rows and insert
them again. The seed files now write EN themselves, but DB-only rows and older seeds rely on the
apply script.

## Why natural keys, never ids

`--reset` seeds re-insert rows, so ids change, and an id-keyed translation file would silently
attach English to the wrong row. Natural keys either match the same content or fail loudly.
`practice_category` is the exception: it has two hand-made rows that are never re-seeded.

Duplicate keys are expected. Some sentences share `(case_index, display, russian)`; every matching
row gets the same EN, archived duplicates included. `reñgti` exists twice in `verb` («готовить»
and «одевать, раздевать»), so `verbs.json` splits it by `translation_ru`. The script refuses any
other infinitive that matches more than one row until it is split the same way.

## Why the translations are committed files

Translations are content, and they need review. Committing them means they can be diffed and
reviewed (`review.html`), and a DB reset or re-seed can't lose them. No translation API runs at
deploy or request time: we have no key budget for it, and machine output would bypass the review
gate. The grammar rule texts are adapted for English speakers rather than translated word for
word: «Кого? Что?» → "whom? what? (direct object)", м.р./ж.р. → m./f. The Lithuanian examples
and endings are kept byte-for-byte.

## Deliberately not translated

- `practice_question.question_ru`: all 509 rows have `question_lt`, which is shown in both
  languages.
- `verb.case_governance[].sentences[].ru`: only served by `verb_cases` programs, which
  `_ensure_seed` forces to `is_public=False`. Translate it if that program is ever made public.
- `verb.prefix_forms[].example_ru`: no endpoint serves it.
- Legacy `constitution_question` rows.

## Seed-script notes

- `scripts/seed_skaitymas_new.py` is the live seed for category 2: its test titles match
  production exactly. `scripts/seed_skaitymas.py` has a pre-existing syntax error (an unescaped
  `—` inside a string on line ~24) and cannot run. All three Skaitymas seeds (including
  `scripts/test_seed.py`) now look up the category by `name_en IN ('Reading', 'Skaitymas')`, so
  a re-run after the rename doesn't create a duplicate category.
