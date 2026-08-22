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

## `grammar_case_rule` is DB-authoritative too (issue #158)

The rule cards shown above each grammar exercise live in the `grammar_case_rule` table, and for
**cases 1–14 that table is the only source** — exactly like `grammar_sentence`:

- there is no seed file for them; `backend/scripts/seed_numbers_grammar.py` writes `GrammarCaseRule`
  rows but is scoped to the **numbers program, cases 15–20**, and is run manually;
- `api/data/grammar/rules.py` (`CASE_RULES`) is **dead code** from the pre-refactor `api/` app — both
  `render.yaml` and the root `main.py` boot `backend/main.py`, and that copy has no `transform`
  field at all. Do not edit it and do not treat it as a seed to keep in lockstep;
- migrations are schema-only.

So a wrong rule card is fixed with a guarded `UPDATE` against production, same as a wrong sentence.
`GET /api/grammar/lessons` does no caching, so the change is live immediately with no deploy.

### Invariant: every gradeable ending must be derivable from its rule card

The exercise shows a bare stem (`profesor___`) and grades the **stem-relative ending** the learner
types. The rule cards, however, were originally written in terms of **nominative** endings for
declensions I–III only (`-as→-u`, `-is/-ys→-iu`, `-ė→-e`). For IV-declension (`sūnus`,
`profesorius`) and V-declension (`sesuo`, `duktė`, `vanduo`) nouns that is not merely an omission —
the card *actively mispredicts* the answer: `-is/-ys→-iu` implies `profesoriu` where the graded
answer is `profesoriumi`, and `-ė→-e` implies `dukte` where it is `dukterimi`. The learner is told
one thing and marked wrong for doing it.

Hence the invariant:

> Every `answer_ending` reachable in a case's live sentences must be derivable from that case's rule
> card — i.e. it must appear somewhere in `transform || endings_sg || endings_pl`.

Enforced by `backend/scripts/audit_case_rule_coverage.py` (read-only) and by the live-data half of
`frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts`.

### Guarded vs. deferred cases

The invariant holds today for the cases that have actually been reported and fixed. Issue #158
fixed **case 5** (Įnagininkas); issue #159 fixed **case 3** (Naudininkas/Dative) and **case 7**
(Šauksmininkas/Vocative). The sibling audit found the identical I–III-only gap in **cases 2, 4, 6,
8, 9 and 13** too, but rewriting six more cases of user-facing grammar explanations is a far larger
editorial change than any single report asked for, so those remain deliberately deferred to a
follow-up.

Both the audit script and the spec therefore carry a `GUARDED_CASES` set (`{3, 5, 7}`) and a
matching `DEFERRED_CASES` set. Uncovered endings in deferred cases are *reported as known debt* but
do not fail the run — otherwise the guard would be permanently red and would stop catching new
regressions. **Keep the two lists in sync, and move a case from deferred to guarded in the same
change that fixes its rule card.** That is the executable half of the follow-up.

Known debt at the time of writing: 10 uncovered endings across the 6 deferred cases (`profesoriaus`,
`aktoriaus`, `dukterį` ×2, `vandenį`, `seserį`, `bažnyčioje`, `bažnyčios`, `pilyse`, `stotyse`,
`bažnyčiose`).

**Case 7 was a coupled pair, not a lone row (fixed by issue #159).** Sentence 198 (`Ačiū, dukt___!`
→ `dukte`) was linguistically wrong — `words.txt` gives the vocative of *duktė* as `dukterie`. Rule
12 said `-ė→-e`, which predicted exactly `dukte`, so card and row agreed by coincidence. Fixing the
row alone would have made the card mispredict the graded answer — i.e. recreated the #158 bug
inside case 7. Row 198 (now `erie`/`dukterie`) and rule 12 (now stating the IV/V mappings, e.g.
`sūnau`, `profesoriau`, `dukterie`) were moved together in the same change.

Two caveats when using the audit:

- **It is a floor, not a ceiling.** The check is a substring test, so very short endings (`-e`,
  `-au`, `-ui`, `-ių`) match incidentally inside longer words in `transform` and can hide a real
  gap. Cases 3 and 7 (fixed by #159) and case 9 (still deferred) each reported "0 uncovered" while
  still being wrong by inspection. Ground truth for what an ending *should* be is
  `backend/data/grammar/words.txt`, not this script.
- **One allowlisted row**: sentence id 203, `Jonas neša krep___.` → `šį`. Its display truncates the
  stem *inside* the cluster `krepš`, so the expected answer isn't expressible as an ending mapping
  at all. That is a separate defect (issue #135 / #52 territory), not a rule-card gap.

A corollary worth remembering: fixing a rule card can *require* fixing sentence rows in the same
pass. Correcting the instrumental card to say `sesuo→seserimi` while row 126 still graded `seseria`
would have made the contradiction worse, not better — so both move together.
