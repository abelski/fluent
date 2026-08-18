# Grammar-sentence data integrity (issue #156)

## The invariant

For every row in the `grammar_sentence` table (the fill-in-the-blank sentence exercises used by
`/dashboard/grammar`), the following must hold, case-insensitively:

```
stem(display) + answer_ending == full_word
```

where `stem(display)` is the single word immediately before the `___` blank (e.g. `display =
"Mama eina su dukt___."` → stem `"dukt"`).

**Why it matters:** `_generate_sentence_tasks()` (`backend/grammar_service.py`) emits two separate
fields to the frontend — `answer = row.answer_ending` and `full_answer = row.full_word`. The
frontend *grades* the student's typed input against `task.answer` (`answer_ending`), but
*displays* `task.full_answer` (`full_word`) as "Правильный ответ" when the student gets it wrong
(`GrammarTaskRunner.tsx`). There is no server-side grading endpoint — grading happens entirely
client-side against the ending, while the "correct answer" shown is a completely independent
column. If an admin edits one field and not the other (or either has a typo/corrupted character),
the two fall out of sync: the student can type the linguistically correct word and still get
marked wrong, or vice versa. Issue #156 was exactly this — row 204 graded `"eria"` but displayed
`"dukteri"` (dukt + eria = dukteria ≠ dukteri; both were also linguistically wrong — the real
instrumental singular of *duktė* is *dukterimi*).

**Multi-word exception:** cases 17–19 (ordinal-number sentences, e.g. "dvidešimt pirm___ autobusu"
→ "dvidešimt pirmu") intentionally store a longer, non-inflecting numeral prefix in `full_word`
that `stem(display)`'s single-word regex can't see, even though only the last word actually
inflects and only its ending is graded. The invariant check therefore accepts `full_word` either
being *exactly* `stem+answer_ending`, or ending with a whole extra word plus `stem+answer_ending`
(a `" " + stem+answer_ending` suffix) — never a bare/partial substring, so it still rejects
truncated or corrupted stems. Implemented as `_sentence_invariant_holds()` in
`backend/grammar_service.py`, next to `_extract_stem`.

## Where it's enforced

- **Read time (filter, not repair):** `_generate_sentence_tasks()` drops any row that fails the
  invariant before it can be shown to a student — mirrors the existing verb corrupt-form guard
  (`_is_usable_form`, issues #151/#153). It must never *derive* `full_answer` from the stem instead
  — that would happily display a bad value like `"dukteria"` and hide the underlying data bug.
- **Write time (400):** `backend/routers/admin.py` — `create_grammar_sentence` (POST
  `/grammar/sentences`) and `update_grammar_sentence` (PATCH `/grammar/sentences/{id}`) reject the
  write with a 400 if the invariant doesn't hold, so new admin typos can't reintroduce the bug.

## Data ownership: DB vs. `words.txt`

- `grammar_sentence` (cases 1–14, the sentence exercises) has **no seed file**. `render.yaml`'s
  `scripts/seed.py` only seeds `Word`/`WordList`/`WordListItem`; `backend/main.py` startup only
  runs `create_all` (schema, not data); `backend/scripts/seed_numbers_grammar.py` is scoped to
  number cases 15–20 and run manually. **The production database is authoritative** for
  `grammar_sentence` rows — fix bad data with a guarded `UPDATE` against production, not a
  migration or seed-file edit. Sentences are edited live via `/dashboard/admin/grammar`.
- `backend/data/grammar/words.txt` (the noun-declension table used by `_generate_declension_tasks`
  and `_FORM_TO_NOMINATIVE`) is **repo-authoritative** — it ships with the code and is never
  re-derived from the DB, so fixes belong in the file itself, in a normal commit.
- A bug can therefore require *both* a DB fix (the specific bad sentence row) and a `words.txt` fix
  (the underlying declension table entry it was copied from), as it did for issue #156
  (seserimi/dukterimi, case_index 5, field 6 of the `ses`/`dukt` rows).

## Gotcha: no `psql` on this machine

There is no `psql` binary available locally. To run ad-hoc SQL against the (Neon-hosted) production
database: parse `DATABASE_URL` fresh out of `backend/.env` (never hard-code it — it can rotate) and
connect with `psycopg` (v3) from `backend/.venv/bin/python`, e.g.:

```python
import psycopg
db_url = None
with open("backend/.env") as f:
    for line in f:
        if line.strip().startswith("DATABASE_URL"):
            db_url = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
            break
conn = psycopg.connect(db_url)
```

Since this touches production data directly, prefer one guarded `UPDATE ... WHERE id = … AND
<column> = <expected current value>` per row over broad statements, and re-select the row
afterward to confirm the change landed as intended.
