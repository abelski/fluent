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

Issue #158 fixed **case 5** (Įnagininkas); issue #159 fixed **case 3** (Naudininkas/Dative) and
**case 7** (Šauksmininkas/Vocative). The sibling audit found the identical I–III-only gap in
**cases 2, 4, 6, 8, 9 and 13** too, and those were deferred as a larger editorial change than any
single report asked for. **Plan #9 closed them**: every noun case 2–13 was rewritten in one pass,
so `GUARDED_CASES` is now `set(range(2, 14))` and `DEFERRED_CASES` is empty (cases 1 and 14 have no
lesson, hence no sentences — see that plan's Non-Goals).

Both the audit script and the live-data spec carry the `GUARDED_CASES` set, plus a matching
`DEFERRED_CASES` set that is kept — empty — as the mechanism for future debt: uncovered endings in
a deferred case are *reported as known debt* but do not fail the run, so the guard can never go
permanently red and stop catching new regressions. **Keep the two lists in sync, and move a case
back to guarded in the same change that fixes its rule card.**

The rewrite that closed the gap is also what makes it stay closed: each card now maps from the
**dictionary form** (`-as→-o (agurkas→agurko)`), covers every declension class present in that
case's own live pool (I/II plus the `III ж.р. -is`, `IV -us/-ius` and `V -uo` classes the original
cards omitted), and — where the only possible example word *is* a graded answer (`sesuo`/`duktė`
are the entire V feminine class) — states the mapping as `sesuo/duktė→-erį`, naming the source but
not the answer. That form satisfies invariant 1 (the ending is derivable) without breaking
invariant 2 (the answer word is never printed).

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

### Second invariant: rule-card examples must not equal an answer (found during #159)

Separate from ending-coverage above: a rule card's illustrative examples (the words in
parentheses, e.g. `sūnus→sūnui`) must not be words that are themselves the graded answer to one
of that *same case's* exercise sentences. `grammar_service.py::get_lessons()` bundles one rule
card with every sentence for that case, and shows it statically for the whole lesson — so if the
card's example word matches an exercise word, the student can read the answer straight off the
card instead of applying the pattern, defeating the exercise.

This was caught only after #159 shipped, from user feedback right after the fix: the first draft
of the case 3/7 fix reused `sūnus`, `profesorius`, and `duktė` as examples — all three are also
graded answers in those same two lessons, and `duktė→dukterie` was the exact answer to sentence
198, the row the fix itself had just corrected. Fixed by swapping to words present in
`words.txt` but absent from either lesson's exercise pool (`turgus`, `vaisius`, `vanduo`, `namas`,
`maišelis`, `knyga`, `gatvė` — cross-checked with a script comparing each case's rule-card tokens
against `grammar_sentence.full_word` for that case).

**Debt table — all resolved by plan #9** (the same cross-check found the leak in 9 further cases
after #159 shipped; each was fixed by re-picking that card's examples from words absent from its
own pool):

| Case | Name | Leaking example word(s) | Status |
| --- | --- | --- | --- |
| 2 | Родительный (Kilmininkas) | `brolio` | fixed (plan #9) |
| 5 | Творительный (Įnagininkas) | `sūnumi`, `profesoriumi`, `seserimi`, `dukterimi` | fixed (plan #9) |
| 6 | Местный (Vietininkas) | `name`, `kambaryje`, `muziejuje`, `gatvėje` | fixed (plan #9) |
| 8 | Именительный мн.ч. | `broliai`, `knygos`, `muziejai` | fixed (plan #9) |
| 9 | Родительный мн.ч. | `namų`, `brolių`, `knygų` | fixed (plan #9) |
| 10 | Дательный мн.ч. | `broliams`, `sūnums` | fixed (plan #9) |
| 11 | Винительный мн.ч. | `brolius`, `knygas`, `sūnus` | fixed (plan #9) |
| 12 | Творительный мн.ч. | `broliais`, `knygomis`, `sūnumis` | fixed (plan #9) |
| 13 | Местный мн.ч. | `namuose`, `gatvėse` | fixed (plan #9) |

Note case 5 is #158's own fix — the ending-coverage invariant above was satisfied, but this
second invariant wasn't checked at the time. `knyga`, `namas`, and `gatvė` are otherwise-safe
placeholder nouns used correctly elsewhere in the rule set (e.g. `name`/`gatvė` are the swap-in
examples used for case 7 above) — they only leaked in the specific cases listed, where that case's
own exercise pool happens to include them.

#### `audit_rule_card_examples.py` — the executable check (added by plan #9)

`backend/scripts/audit_rule_card_examples.py` is the read-only sibling of
`audit_case_rule_coverage.py` and closes the gap that this invariant had *no* committed check for
(it was verified ad hoc twice, and drifted back both times). It tokenizes each card's
`transform || endings_sg || endings_pl` into letter runs and fails if any token equals, case
-insensitively, a live `full_word` of the same `case_index`. Same DB-connection recipe as its
sibling (`DATABASE_URL` from `backend/.env`, `psycopg`), same exit convention: `1` if a **guarded**
case leaks.

Two case sets, for the same reason the coverage audit has two:

- `GUARDED_CASES = range(2, 14)` — the noun cases. Their rule is a *productive* suffix mapping, so
  an example noun can always be drawn from the open class of nouns the lesson does not grade.
  A leak here is a real defect.
- `PARADIGM_CASES = range(15, 21)` — the numbers program. Cardinals (15, 16) and collective
  numerals (20) are a **closed class with no productive suffix**: a card that refuses to name
  `keturios`/`dveji` cannot teach them at all, and the exercise hands the learner the digit and
  the gender (`(4, f.)`) precisely because it is a form-recall drill. Ordinals (17–19) *are*
  productive, but every ordinal the card could cite is also a graded answer somewhere in the same
  38-sentence pool. These overlaps are printed as accepted, not gated. **Do not "fix" a paradigm
  case by deleting the form list from its card** — that removes the only place the learner can
  read the paradigm and makes the lesson unusable at `basic` level.

The audit only reads the three ending/transform columns, matching the invariant's own wording;
`usage` (which for the numeral cases legitimately carries the full masculine/feminine list) is out
of its scope by design, not as a hiding place.

### Third invariant: rule-card example nouns must be real-world plausible for the case's meaning (found via #162)

Separate from the two invariants above: a rule card's illustrative example noun must make sense
in the real world for what the case actually *means*, not just be grammatically well-formed.
Vietininkas (locative, cases 6 and 13) answers "where is X located" — the example noun has to be
something a person/thing can plausibly be "in" or "at". A kinship term for a person doesn't work
as a location: "in a brother" (`brolyje`) / "in brothers" (`broliuose`) is grammatically correct
Lithuanian but nonsensical as an answer to "where", unlike the other examples in the same
`transform` string (`namuose`, `knygose`, `gatvėse` — houses, books, streets, all genuine "where"
answers).

Issue #162 reported exactly this for case 13's example (`broliuose`). A full audit of all
`grammar_case_rule.transform` rows (case_index 1–20) found exactly two offending rows, both
locative, both using `brolis` ("brother") as the example noun: case 6 (id 10, singular,
`brolis→brolyje`) and case 13 (id 9, plural, `broliuose`, the reported row). No other case_index
has an analogous real-world-plausibility problem — the many other cases where `brolis`/`broliai`
appear (genitive "of a brother", dative "to a brother", instrumental "with brothers", etc.) are
all real-world-plausible for what those cases mean; `brolis` was only ever wrong as a *locative*
example.

Fixed by swapping both rows to `maišelis` ("bag/package") — already used elsewhere in this same
rule set (case 7's vocative example) — for which "located inside a bag" (`maišelyje`/
`maišeliuose`) is a genuine "where" answer. Verified via a live DB query that `maišelyje`/
`maišeliuose` are not currently graded `full_word` answers in case 6 or case 13's live sentence
pools, so the fix does not reintroduce the second invariant's leak (above).

This was already a known concern for the *auto-generated* declension exercises:
`_PLACE_STEMS` and `_LOCATION_CASES = frozenset([6, 13])` (`backend/grammar_service.py`, lines
107–129) restrict the locative sentence pool to genuine place/institution nouns "so every prompt
makes semantic sense as a location", and `brol` was deliberately never included in that set. The
hand-written rule-card `transform` text for those same two cases had simply never been held to
the same standard — this invariant closes that gap for the hand-authored side of the data too.

**Plan #9 extended the same sense-check past the locative.** Re-picking every card's examples for
invariant 2 forced a second look at meaning, and the rule generalizes: the example must be
plausible *for what that case means*, not merely well-formed. A dative example should be a
plausible recipient, which is why #159's `turgus→turgui` / `vaisius→vaisiui` ("to the market",
"to the fruit") became `muziejus→muziejui` / `direktorius→direktoriui` — both still IV-declension,
both still absent from case 3's pool, but now something you can actually give a thing to. Cases
6/13 keep genuine places throughout (`miestas`, `kelias`, `maišelis`, `knyga`, `giria`, `kavinė`,
`šalis`, `dangus`, `vanduo`); no kinship term is used as a locative example anywhere.

Sentence-level sense-checking is part of the same standard. Rows fixed in that pass: `tėveliais`
glossed as "с папами" (the plural of *tėvelis* means *parents*), `Vaikai mokosi bažnyčiose`
("children study in churches" → `Žmonės meldžiasi bažnyčiose`), `Jis gyvena name` glossed as
"он живёт дома", `Stalui yra keturios kojos` (dative-of-possession, not idiomatic Lithuanian),
`Aštuonios sesers` (not a nominative plural — *seserys* is), and `turi aštuonis pusbrolių`
(cardinals 1–9 *agree*; they do not govern the genitive plural, so the noun must be `pusbrolius`).

## Gotcha: Cyrillic look-alike letters hide inside Lithuanian text (plan #9)

13 case-17 rows spelled `troleibusu` with a **Cyrillic `у` (U+0443)** instead of Latin `u`, and so
did their literals in `backend/scripts/seed_numbers_grammar.py` — which is where the corruption
came from. It renders identically in every font we use, so no amount of reading the admin UI or
the diff finds it; the sentence is simply not the Lithuanian word any more. This content is
authored by copy-paste between Russian explanations and Lithuanian examples, so the class of bug
recurs. Detect it, don't eyeball it:

```python
import unicodedata
cyr = [c for c in text if "CYRILLIC" in unicodedata.name(c, "")]
```

Run that over `display`/`full_word`/`answer_ending` (all pure-Lithuanian columns) after any bulk
content edit. The reverse case — Latin look-alikes inside the Russian `russian`/`usage` columns —
is the same check with `"LATIN"` and a Cyrillic-majority string.

## Rule-card ↔ linked-article contradictions (requirement carried over from #158)

`grammar_case_rule.article_slug` points cases 2–13 at the `daiktavardžiai-linksniavimas` article,
whose declension tables are rendered as the "long form" of the same rules. A card rewrite has to
re-read that article: issue #158 already had to fix one cell there, and plan #9 found another —
the masculine `-is` locative singular was tabled as `paukšč-iuje`, but that class takes `-yje`
(`brolyje`, `paukštyje`, per `words.txt`), which is exactly what the case-6 card now states. Fixed
in both `body_ru` and `body_en` (the two bodies carry the same table twice — always patch both).

Note the article numbers the declensions differently from the rule cards (its "3-е склонение" is
`-is` of both genders, following its litsheets source). The cards avoid the clash by labelling
only the classes both agree on (`III ж.р.`, `IV`, `V`) and writing the I/II classes as bare
endings — the format the vocative card established. Keep that convention.

## The verb program's `tense_hints` had the same coverage gap (plan #9)

`backend/data/grammar/verb_lessons.json`'s `tense_hints` is the Verb Conjugation program's rule
card — repo-committed code, not DB (the one structural difference from cases 1–20). It carried
the same defect invariant 1 describes: the present-tense table listed `aš -u/-iu` and `tu -i`,
which are the I and II conjugations only, so for a III-conjugation verb (`skaityti → skaitau,
skaitai`) the card mispredicted the graded answer. Rows are now grouped by conjugation, keyed by
the 3rd-person form (`I -a/-ia`, `II -i`, `III -o`) so the learner can tell which column applies.

The second gap was reflexives: ~12% of the `verb` table is `-tis` verbs (`aunuosi`, `ilsiesi`,
`aukimės`), whose endings differ in every person, and no tense's table mentioned them. Each of the
six tenses now ends with a `возвратные (-tis)` row. Both gaps were found by aggregating the real
`Verb.conjugations` endings out of the DB rather than by reasoning from a grammar book — worth
repeating before editing these hints, since the served answers come from that same table.

## Issue #52 ("placeholder shows 3 underscores, answer is shorter") is stale — do not "fix" it

Filed 2026-04-15 against a UI that no longer exists. The `display` column has always stored
exactly `___` (3 literal underscores) regardless of `answer_ending` length, and #52's own fix plan
proposed sizing it to `len(answer_ending)` server-side — reasonable *at the time*, when `___` was
rendered as literal placeholder text.

**That is no longer how the sentence task renders.** `InlineSentenceInput`
(`frontend/app/dashboard/components/GrammarTaskRunner.tsx:104`) does
`const [before, after] = display.split('___')` and drops an actual `<input type="text">` in
between — no `placeholder` prop is even passed at the `type === 'sentence'` call site (line
~429), and the input's width auto-grows from what the student *types* (a hidden mirror `<span>`
measures `value`, `frontend/app/dashboard/components/GrammarTaskRunner.tsx:104-113`), not from
`display`. The literal `___` is now purely an internal split marker the student never sees — the
undercount/overcount complaint #52 describes cannot reproduce against current code, on any case,
regardless of `answer_ending` length. This looks to have been an accidental side effect of an
unrelated input-rendering rewrite sometime after April 2026, not a deliberate fix.

**Do not implement #52's original plan** (resize `display`'s `___` run to
`'_' * len(answer_ending)` in `_generate_sentence_tasks`). Doing so would not fix anything
visible — and would actively break rendering: `InlineSentenceInput`'s `split('___')` hardcodes
exactly 3 characters, so any other length makes the split fail to find the marker, `after` comes
back `undefined`, and the sentence loses everything past the blank. If #52 is reopened, verify
first against current `GrammarTaskRunner.tsx` before touching `grammar_service.py` — the correct
resolution is almost certainly "close as already resolved by unrelated work," not a code change.

## Practice-level full-word answers are derived, not a new invariant (plan #8)

At `practice` level, `_generate_sentence_tasks()` requires the student to type the whole inflected
word instead of just the case ending: the stem is stripped out of `display` (so the blank stands
for the whole word, e.g. `"Laima mato brol___."` → `"Laima mato ___."`) and the served `"answer"`
becomes `stem + answer_ending` (`"brolį"`) instead of `answer_ending` alone (`"į"`). `basic` and
`advanced` levels are untouched — they still pre-print the stem and grade the ending only.

This is a pure **derivation** at request time from the same three columns the existing
`stem(display) + answer_ending == full_word` invariant (issue #156, top of this doc) already
guards — it does not introduce a new invariant or a new DB column. Both `_extract_stem` (used to
read the stem for `base_lt` resolution and the multi-word exception, see below) and the
practice-level strip now share one compiled regex, `_STEM_BLANK_RE = re.compile(r'(\w+)___')`, so
capture and strip can never target a different span of `display` from each other.

**Cases 17–19 grade against `stem+answer_ending`, not `full_word`.** The multi-word exception
described above (a non-inflecting numeral prefix like `"dvidešimt"` stored in `full_word` but
outside the single-word `stem(display)` capture) matters here too: at practice level the served
`"answer"` is still `stem + answer_ending` (e.g. `"pirmu"`), never `row.full_word`
(`"dvidešimt pirmu"`). The numeral prefix was never part of the captured stem, so the practice-level
strip (`_STEM_BLANK_RE.sub('___', display, count=1)`) never touches it either — it stays visible in
`display` as ordinary sentence text before the blank (`"Važiuoju dvidešimt ___ autobusu."`).
Grading against the longer `full_word` would wrongly force the student to retype text they never
had to touch (and never saw removed). Covered by
`backend/tests/test_grammar_practice_full_word.py`.

The `base_lt` dictionary-form hint (`"от: brolis"`) is unconditional on level today and stays that
way at practice level too — the exercise is testing inflection (turn a known word into the right
case form), not vocabulary recall from bare sentence context. No frontend, DB, or admin changes
were needed: `InlineSentenceInput` and `checkAnswer()` in `GrammarTaskRunner.tsx` were already
fully generic over the served `display`/`answer` string content and length (proven by
`declension`/`verb_conjugation` task types, which already require full words at every level).

**Gotcha — practice-level `answer` breaks any spec that expects `task.answer` to equal a rule
card's ending list.** `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts` and
`frontend/tests/issue-159-dative-vocative-us-stem.spec.ts` both run a live-data audit — "every
gradeable ending in a guarded case is derivable from that lesson's rule card" — by fetching real
`/api/grammar/lessons/{id}/tasks` and checking `task.answer` against the rule card's
`transform`/`endings_sg`/`endings_pl` text. Once practice-level `task.answer` became the whole word
(`"dukterie"`) instead of just the ending (`"erie"`), that check broke for guarded case-7/case-3/
case-5 practice lessons — not because the underlying ending changed, but because a whole word
doesn't appear verbatim inside a rule card written in terms of endings. Both specs now exclude
`level === 'practice'` from that specific audit (`lesson.level !== 'practice'` in the lesson
filter) — the same rows are still covered by the check at `basic`/`advanced`, where `task.answer`
is still ending-only. **This class of spec (a live audit filtered only by `cases`/case set, not by
level) is easy to miss from a plan's own curated regression list** — plan #8's own
`## Definition of Done` only listed `issue-159-...spec.ts`, not `issue-158-...spec.ts`, even though
both do the same kind of check over overlapping guarded cases. A full `npx playwright test` run
(not just a curated file list) is the reliable way to catch a sibling spec like this.

## `_STEM_TO_NOMINATIVE` needed the same collision guard as `_FORM_TO_NOMINATIVE` (issue #161)

**The bug had two independent layers, both traced back to the same root cause: `draugas`
(masculine) and `draugė` (feminine) share the vocative form "drauge".** The vocative transform
rule (`-as→-e`, `-ė→-e`) makes this a genuine Lithuanian homograph — there is no way to tell the
two genders apart from the inflected form alone.

- **Layer 1 — content.** `grammar_sentence` rows 192 (masculine, "Labas, draug___!" / "Привет,
  друг!") and 202 (feminine, "Sveiki, draug___!" / "Привет, подруга!") used the identical blank
  and answer with nothing in `display` to disambiguate which gender the sentence means — unlike
  the existing precedent at rows 416/417 ("Kiek ___ metų? (draugas)" / "(draugė)"), which already
  solves the identical dative ambiguity with a parenthetical noun hint. Fixed the same way: `display`
  now reads `"Labas, draug___! (draugas)"` / `"Sveiki, draug___! (draugė)"`.
- **Layer 2 — code.** `_generate_sentence_tasks()` computes the `base_lt` "от: …" dictionary-form
  hint as `_FORM_TO_NOMINATIVE.get(row.full_word) or _STEM_TO_NOMINATIVE.get(stem)`.
  `_FORM_TO_NOMINATIVE["drauge"]` was already correctly `None` — that exact collision was handled
  once before, for issue #25. But the fallback, `_STEM_TO_NOMINATIVE`, was still a plain
  last-write-wins `{stem: stem+nominative_ending}` dict comprehension built once from
  `words.txt` in file order. "draug" is the only stem that appears twice in `words.txt`
  (`draugas` then `draugė`), so `_STEM_TO_NOMINATIVE["draug"]` always resolved to `"draugė"`
  regardless of which row (192 or 202) was actually being served — row 192 (masculine) incorrectly
  showed the hint "от: draugė". Fixing `display` alone (Layer 1) would **not** have fixed this,
  since `base_lt` is computed independently of `display`, only from `full_word`/stem.

**The fix:** `_STEM_TO_NOMINATIVE` is now built with the same collision-aware loop
`_FORM_TO_NOMINATIVE` already used — first duplicate stem seen wins, but a *second* stem that
maps to a *different* nominative flips the value to `None` (ambiguous) instead of silently
overwriting it. Since `.get(stem)` returning `None` is falsy, `base_lt` correctly falls through to
`None` for "draug" (hiding the hint entirely) rather than guessing a gender. This mirrors exactly
how `_FORM_TO_NOMINATIVE` already handled full-word collisions for issue #25 — `_STEM_TO_NOMINATIVE`
had simply never been given the same treatment.

**"draug" is the only duplicated stem in `words.txt` today** — confirmed by grouping all rows by
`w[0]` (the stem column). No other noun currently needs this guard, but the fix is general: any
future stem collision added to `words.txt` will now correctly resolve to a hidden hint instead of
a silently wrong one.

**Do not "fix" this by editing `words.txt`.** The collision is not a data-quality bug in
`words.txt` — `draugas` and `draugė` are two genuinely different, correctly-spelled words that
happen to share a stem and, in one specific case (vocative), an identical inflected form. The
correct fix is exactly what both dicts now do: hide the ambiguous hint rather than guess, the same
policy already established for `_FORM_TO_NOMINATIVE` by issue #25.

Regression coverage: `backend/tests/test_grammar_practice_full_word.py` (a sentinel pair of rows
sharing `full_word="drauge"` with opposite genders asserts `base_lt is None` for both) and
`frontend/tests/issue-161-drauge-vocative-base-form.spec.ts` (the "от: draugė" hint line must not
render for the masculine row, and `display` must carry the disambiguating suffix).
