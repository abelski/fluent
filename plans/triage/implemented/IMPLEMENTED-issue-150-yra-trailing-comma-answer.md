# Issue #150 — /dashboard/grammar/

**Reported:** 2026-08-09 09:41:08.118561
**Status:** open
**Description:** yrà, (в правильном ответе лишняя запятая)

## Root cause

Pure bad seed data — no code path appends or joins with commas.

The chain is `PDF → backend/scripts/extract_verbs_pdf.py → temp_files/verbs_extracted.json → backend/scripts/seed_verbs_db.py → verb table`.
`_parse_person_row` (`extract_verbs_pdf.py:56-85`) splits a conjugation row on whitespace and stores each
token verbatim, including punctuation emitted by the PDF text layer. `temp_files/verbs_extracted.json` is
byte-identical to the live rows, so the corruption entered at extraction time and was copied faithfully
into Postgres.

Verified scope in production (`verb`, 358 rows):

| Defect | Rows |
| --- | --- |
| a conjugation **value** ending in a comma | **1** (id/number 24, `bū́ti` — all five `indicative_present` persons) |
| `verb.translation_ru` ending in a comma | **33** |
| `word.translation_ru` ending in a comma (copied by `seed_verbs_vocabulary.py:136` into `verbs_365`) | **33** — the only 33 in the whole `word` table |
| at least one form containing the stray `i` + U+0307 artifact | **250** |

**This is a grading bug, not just a display defect.** `normalizeLt` (`frontend/lib/normalizeLt.ts:5-16`)
decomposes and strips U+0300/0301/0303 but leaves punctuation and U+0307 alone, and `isAnswerMatch` only
splits on `/`:

- `yrà,` → `yra,` vs typed `yra` → **wrong**, always.
- `esi̇,̀` (`e s i` U+0307 `,` U+0300) → `esi̇` vs typed `esi` → **wrong**, and it *stays* wrong if you only
  remove the comma, because the stray U+0307 survives normalization too. A comma-only fix leaves the same
  verb's `tu` form ungradeable.

Affected area:

| Layer | Path |
| --- | --- |
| Page | `frontend/app/dashboard/grammar/page.tsx` — `verb_conjugation` card (`:941`), grading `checkAnswer()` (`:624-638`), reveal (`:1000-1006`) |
| Grading helper | `frontend/lib/normalizeLt.ts` — `isAnswerMatch()` |
| Endpoint | `GET /api/grammar/verb-lessons/{lesson_id}/tasks` → `backend/routers/grammar.py:301-318` |
| Task builder | `backend/grammar_service.py:351-399` `_generate_verb_conjugation_tasks` — emits `answer` (`:396`) and `translation_ru` (`:393`) verbatim from the DB |
| Model | `backend/models.py:565-583` — `Verb.conjugations` is `character varying` holding a JSON string, not `jsonb` |

## Fix plan

### 1. Data fix — SQL against Neon (primary fix)

`psql` is not installed locally; use the psycopg helper (`echo "<SQL>" | python3 <path>`) or the `sql` skill.

**1a. Validate scope first** (expect `1 | 33 | 33 | 250`):

```sql
SELECT
  (SELECT count(*) FROM verb WHERE conjugations LIKE '%,"%')              AS conj_values_with_comma,
  (SELECT count(*) FROM verb WHERE translation_ru ~ ',\s*$')              AS verb_ru_comma,
  (SELECT count(*) FROM word WHERE translation_ru ~ ',\s*$')              AS word_ru_comma,
  (SELECT count(*) FROM verb WHERE position(chr(775) in conjugations) > 0) AS forms_with_dot_artifact;
```

**1b. Strip the trailing comma from conjugation values.** `,"` only occurs when a JSON *value* ends in a
comma — the multi-person key `"jis, ji, jie, jos"` uses `, ` and the inter-entry separator is `", "`, so
neither matches. The character class steps over a trailing combining accent, which handles `esi̇,̀`:

```sql
BEGIN;
UPDATE verb
SET conjugations = regexp_replace(
      conjugations,
      ',([' || chr(768) || '-' || chr(879) || ']*)"',
      '\1"',
      'g'
    )
WHERE conjugations LIKE '%,"%';
```

**1c. Repair the stray `i` + U+0307 in conjugations — same transaction.** Byte-for-byte the transformation
already shipped for `word.lithuanian` in issues #113/#114 (see
`plans/triage/implemented/IMPLEMENTED-issue-114-spaces-in-verb-words.md`). Safe because the column is NFC —
`ė`/`ū`/`ą` are precomposed, so a literal `i`+U+0307 sequence is always the extractor artifact. **Do not**
strip U+0300/0301/0303 here: unlike the vocabulary program, grammar answers intentionally carry stress
marks (`atsakýtume`), and `normalizeLt` already ignores them at compare time.

```sql
UPDATE verb
SET conjugations = replace(conjugations, 'i' || chr(775), 'i')
WHERE position(chr(775) in conjugations) > 0;
```

Dry-run against production confirmed: verb 24 becomes `esù / esì / yrà / ẽsame / ẽsate`, verb 7
`atsakai̇ → atsakai`; both still parse as valid JSON. Without 1c, `esì` renders as `esi̇̀` and still fails grading.

**1d. Trailing comma in `verb.translation_ru` (33 rows) and the mirrored `word.translation_ru` (33 rows).**
The `word` predicate needs no `verbs_365` scoping — those 33 are the only matches table-wide, and
`translation_en` has zero:

```sql
UPDATE verb SET translation_ru = regexp_replace(translation_ru, ',\s*$', '')
WHERE translation_ru ~ ',\s*$';

UPDATE word SET translation_ru = regexp_replace(translation_ru, ',\s*$', '')
WHERE translation_ru ~ ',\s*$';
COMMIT;
```

**1e. Verify — every count must be 0:**

```sql
SELECT
  (SELECT count(*) FROM verb WHERE conjugations LIKE '%,"%')              AS a,
  (SELECT count(*) FROM verb WHERE translation_ru ~ ',\s*$')              AS b,
  (SELECT count(*) FROM word WHERE translation_ru ~ ',\s*$')              AS c,
  (SELECT count(*) FROM verb WHERE position(chr(775) in conjugations) > 0) AS d;
SELECT conjugations::json -> 'indicative_present' FROM verb WHERE number = 24;
```

### 2. Defensive server-side normalization (keep it small)

`temp_files/` is gitignored and still holds the corrupt `verbs_extracted.json`; re-running
`seed_verbs_db.py` would reintroduce every comma. Per the CLAUDE.md rule that validation lives server-side,
sanitize on the way out in `backend/grammar_service.py` (`re` is already imported at line 13):

```python
_TRAILING_COMMA_RE = re.compile(r',(?=[̀-ͯ]*$)')

def _clean_form(text: str) -> str:
    """Strip extractor artifacts from verb data: a trailing comma (including the
    case where it precedes a trailing combining accent, e.g. 'esi̇,̀') and the
    stray combining dot-above after 'i'."""
    return _TRAILING_COMMA_RE.sub('', text).replace('i̇', 'i').strip()
```

Apply to `answer` and `translation_ru` in `_generate_verb_conjugation_tasks` (`:390-397`) and
`_generate_verb_case_tasks` (`:430-437`). The lookahead removes only the *last* comma, so
`"быть, являться,"` → `"быть, являться"` and internal commas are untouched.

This is sufficient on its own — the frontend compares typed input against the server-supplied `answer` and
renders that same string, so one sanitizer fixes both grading and display.

**No frontend change.** Adding punctuation stripping to `isAnswerMatch` was considered and rejected: it
would mask data bugs rather than surface them, `PhraseSession.tsx:63,77` already owns its own
punctuation-stripping `clean()` for a different reason, and skipping it avoids a `npm run build` +
static-export redeploy.

### 3. Do NOT fold in the bare-combining-accent forms — track separately

~169 verbs have a conjugation value that is a lone `"̀"`/`"̃"`. This is **not** a normalization problem —
it is the visible symptom of a **column shift on the `tu` row**. In `extract_verbs_pdf.py`, block-1 columns
map positionally to `[present, past_simple, conditional]` (`:291-298`). When the PDF emits a displaced
accent as its own whitespace-delimited token, that token is consumed as a form and everything after it
shifts one column right. Verb 7 `atsakyti` in production:

```
indicative_past_simple.tu = "̃"          ← bare accent, should be "atsakei"
conditional.tu            = "atsakei̇"   ← the past-simple form, should be "atsakytum"
```

Distribution: 124 verbs on `conditional.tu`, 45 on `indicative_past_simple.tu`. Students are being taught
**wrong forms** in the conditional lesson, and `_generate_verb_conjugation_tasks:387` only skips falsy
forms — `"̃"` is truthy, so bare accents are served as tasks today.

No regex can recover the lost text; this needs a re-extraction pass (a smarter `_parse_person_row` that
discards standalone combining-mark tokens and reattaches them) plus spot verification against the book.
Same for verb 24's tense mix-up (`indicative_past_simple` holding the `būnu/būna` present paradigm,
`conditional` holding `buvau/buvo`), a `būti`-specific extra-column outlier. Folding a 169-row content
rewrite into a one-character punctuation fix would blow up the blast radius and make this issue
unverifiable.

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - New spec `frontend/tests/issue-150-verb-answer-no-trailing-comma.spec.ts`, in the live-API style
     already used by `frontend/tests/verbs_grammar.spec.ts:52-68` (which hits
     `GET http://localhost:8000/api/grammar/verb-lessons/200/tasks` via `request`). Loop lesson ids
     `200, 202, 204, 206, 208, 210` (one per tense) and assert for every task:
     ```ts
     expect(task.answer).not.toMatch(/,/);
     expect(task.translation_ru).not.toMatch(/,\s*$/);
     expect(task.answer).not.toMatch(/i̇/);
     ```
     Task selection is random (`grammar_service.py:381`) and the `sekmes` pool is 42 verbs, so one 20-task
     draw hits `būti`-present with only ~38% probability — repeat each lesson fetch ~5× so the sweep is
     effectively exhaustive. Precedent for a live-data assertion test:
     `frontend/tests/issue-49-flashcard-comma.spec.ts`.
   - Also add the deterministic half as backend pytest: new `backend/tests/test_verb_conjugation_tasks.py`
     (no existing `test_grammar*.py`). Backend tests run against in-memory SQLite (`backend/conftest.py`),
     never touching Neon. Seed a `Verb` row with the exact corrupt payload and call
     `_generate_verb_conjugation_tasks('indicative_present', ..., program_key=None)` directly:
     ```
     "jis, ji, jie, jos": "yrà,"   → answer must be "yrà"    (no comma)
     "tu": "esi̇,̀"           → answer must normalize to "esì" (no comma, no stray U+0307)
     translation_ru = "быть, являться," → task translation_ru must be "быть, являться" (inner comma kept)
     ```
     Note `conftest.py:47` does not import `Verb` in its `create_all` list — the test must import
     `models.Verb` so its table is registered, or create it explicitly.
2. Rebuild the frontend and restart the local server. (No `npm run build` is strictly needed since no
   frontend file changes, but restart the server so it serves the corrected data.)
3. Run the new Playwright test and confirm it passes. Run order: `pytest backend/tests` first, then the new
   spec plus `frontend/tests/verbs_grammar.spec.ts` and
   `frontend/tests/issue-138-verb-conditional-slash-answer.spec.ts` (the slash-alternate grading path
   shares `isAnswerMatch`).
4. Leave the local server running so the user can manually verify the fix in the browser — open
   `/dashboard/grammar`, enrol in «Спряжение глаголов», start lesson 200/201, and confirm a
   `bū́ti — jis ___` prompt now accepts `yra` and reveals `yrà` without the comma.

## Confirm resolution

Ask the user: "Issue #150 — yrà, (в правильном ответе лишняя запятая). Mark as resolved?"

Only if the user confirms:

1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 150;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix
   (`issue-150-yra-trailing-comma-answer.md` →
   `plans/triage/implemented/IMPLEMENTED-issue-150-yra-trailing-comma-answer.md`).
