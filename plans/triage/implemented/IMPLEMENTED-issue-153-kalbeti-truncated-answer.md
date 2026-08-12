# Issue #153 — /dashboard/grammar/

**Reported:** 2026-08-11 07:27:07.511215
**Status:** open
**Description:** В разделе Грамматика, Спряжение глаголов:

kalbė́ti — jis ...
говорить

Правильно: kalb̃

(не дописан правильный ответ)

## Root cause

**The app faithfully renders a truncated DB value. There is zero rendering-layer contribution.**

`verb.conjugations` for id 89 stores `indicative_present["jis, ji, jie, jos"]` as exactly 5 codepoints — `k a l b U+0303`. This is the **user-visible symptom of issue #151** (column shift during PDF extraction, ~169 verbs; 169 marks-only cells out of 358 verbs). #151 owns the bulk repair; this plan covers what #153 needs specifically.

### Display path

| Layer | Location |
| --- | --- |
| Page | `frontend/app/dashboard/grammar/page.tsx` — `GrammarPage()` |
| Prompt card | same file `:941-958` — `task.type === 'verb_conjugation'` branch; builds `` `${task.verb_infinitive} — ${task.person_label} ___` `` → local `InlineSentenceInput` (`:89-157`) |
| Grading | `checkAnswer()` `:624-638` → `isAnswerMatch()` from `frontend/lib/normalizeLt.ts` |
| "Правильно: …" reveal | same file `:1000-1006`; `shownAnswer` set at `:630`, rendered as `<span className="text-gray-900 font-semibold">{shownAnswer}</span>`. `tr.common.correctAnswer` = `'Правильно:'` (`frontend/lib/i18n/ru.ts:17`) |
| Fetch | `startLesson()` `:586-605` → `GET {BACKEND_URL}/api/grammar/verb-lessons/{id}/tasks` |
| Endpoint | `backend/routers/grammar.py:301-318` — `verb_lesson_tasks()` |
| Service | `backend/grammar_service.py:335-348` `get_verb_lesson_tasks()` → `:371-419` `_generate_verb_conjugation_tasks()`; `answer` emitted at `:406/:416` as `_clean_form(...)` |

**Rendering ruled out — verified, not assumed:** the grammar page never imports `renderAccented` (grep across `frontend/` hits only `lists/[id]/page.tsx`, `QuizSession.tsx`, `programs/[key]/page.tsx` and its own test), so the #90/#116 `*bold*`-marker path isn't on this screen. The reveal at `:1004` is a raw `{shownAnswer}` interpolation — no slicing, no `normalize()`, no accent post-processing. `normalizeLt()` is used only for comparison (`:627`). The only Unicode-aware code before display is server-side `_clean_form()` (`:358-368`), which strips a trailing comma and stray `i`+U+0307 — neither applies to `kalb̃`.

Adjacent fact (do **not** fix here — that is #93, on hold): `verb.conjugations` is the only non-NFC Lithuanian column in the DB; row 89's `indicative_present.tu` is stored decomposed as `k a l b i U+0300`. The fix below NFC-normalises rows 89/90 as a free side effect.

### Actual corruption (fuller than the report — the reveal showed only one cell)

- **id 89 `kalbė́ti`** — 12 bad cells: `present` jis/mes/jūs = `kalb̃`; `past_simple` jis/mes/jūs = `a`/`ame`/`ate`; `future` jis = `kalbės̃`; `conditional` jis/mes/jūs hold past-simple forms; `imperative` jis = `tegu kalb̃`. `present_3p` = `kalb̃ a`.
- **id 90 `kalbė́tis`** — 15 bad cells: `present` tu = `kalbié`, jis/mes/jūs = `kalb̃`; `past_simple` tu/jis/mes/jūs = `si`/`asi`/`amės`/`atės`; `future` jis = `kalbės̃`; `conditional` tu/jis/mes/jūs hold past-simple forms; `imperative` jis = `is`. `present_3p` = `kalb̃ asi`.

Nuance: `indicative_future.jis` = `kalbės̃` is **not** truncated — all letters present, the tilde is displaced one position right (should be `kalbė̃s`). Same for `dės̃`, `turės̃` table-wide. `kalb̃` *is* truncated (the trailing `a` became a separate whitespace token and was dropped — which is why `present_3p` still shows `kalb̃ a`).

## Fix plan

### 1. Data fix for verbs 89 and 90

⚠️ **Confirm every stress mark with the user against «365 lietuvių kalbos veiksmažodžiai» before applying.** The letters are certain; tone-mark placement (especially `kalbíesi`, `kalbė̃s`, `kalbė̃sis`) needs eyeballing.

**id 89 `kalbė́ti`** (changed cells in **bold**; everything else stays byte-identical):

| tense | aš | tu | jis, ji, jie, jos | mes | jūs |
| --- | --- | --- | --- | --- | --- |
| indicative_present | kalbù | kalbì | **kal̃ba** | **kal̃bame** | **kal̃bate** |
| indicative_past_simple | kalbė́jau | kalbė́jai | **kalbė́jo** | **kalbė́jome** | **kalbė́jote** |
| indicative_past_habitual | kalbė́davau | kalbė́davai | kalbė́davo | kalbė́davome | kalbė́davote |
| indicative_future | kalbė́siu | kalbė́si | **kalbė̃s** | kalbė́sime | kalbė́site |
| conditional | kalbė́čiau | kalbė́tum | **kalbė́tų** | **kalbė́tume / kalbė́tumėme** | **kalbė́tute / kalbė́tumėte** |
| imperative | — | kalbė́k | **tegu kal̃ba** | kalbė́kime | kalbė́kite |

**id 90 `kalbė́tis`:**

| tense | aš | tu | jis, ji, jie, jos | mes | jūs |
| --- | --- | --- | --- | --- | --- |
| indicative_present | kalbúosi | **kalbíesi** | **kal̃basi** | **kal̃bamės** | **kal̃batės** |
| indicative_past_simple | kalbė́jausi | **kalbė́jaisi** | **kalbė́josi** | **kalbė́jomės** | **kalbė́jotės** |
| indicative_past_habitual | kalbė́davausi | kalbė́davaisi | kalbė́davosi | kalbė́davomės | kalbė́davotės |
| indicative_future | kalbė́siuosi | kalbė́siesi | **kalbė̃sis** | kalbė́simės | kalbė́sitės |
| conditional | kalbė́čiausi | **kalbė́tumeisi** | **kalbė́tųsi** | **kalbė́tumės / kalbė́tumėmės** | **kalbė́tutės / kalbė́tumėtės** |
| imperative | — | kalbė́kis | **tegu kal̃basi** | kalbė́kimės | kalbė́kitės |

Also set `present_3p` = `kal̃ba` (89) / `kal̃basi` (90). `past_3p` is already correct.

Slash-alternate format (`kalbė́tume / kalbė́tumėme`) is the DB's existing convention — copy from id 327 `turė́ti` (same paradigm, safest template). Reflexive conditional/imperative follow id 38 `domė́tis` and id 155 `mókytis`. `isAnswerMatch()` splits on `/` (issue #138), so both alternates grade correctly.

**Encoding requirements — this is where the fix can silently go wrong:**
- `ė́` is `U+0117 U+0301` (existing convention, confirmed on `kalbė́jau`).
- `kal̃ba` must be `k a l U+0303 b a` (6 codepoints) — tilde on **`l`**, not `b`.
- `kalbė̃s` must be `k a l b U+0117 U+0303 s` (7 codepoints).
- `kalbíesi` must use precomposed `í` (U+00ED), **not** `i U+0307 U+0301`.
- Finish the UPDATE with `conjugations = normalize(<new value>, NFC)` — lossless (no precomposed `l̃`/`ė̃`/`ė́` exists) and repairs the decomposed `kalbì` at the same time.

Post-fix verification (must return zero rows):
```sql
SELECT v.id, t.key, p.pkey, p.pval
FROM verb v, json_each(v.conjugations::json) t(key,val), json_each_text(t.val) p(pkey,pval)
WHERE v.id IN (89,90)
  AND (p.pval ~ ('[bcdfghjkpstvzčšž][' || chr(768) || chr(769) || chr(771) || ']')
       OR length(replace(regexp_replace(normalize(p.pval,NFD),'['||chr(768)||'-'||chr(879)||']','','g'),' ','')) < 5);
```
Apply via the `sql` skill / psycopg helper (psql is not installed), per `IMPLEMENTED-issue-150-yra-trailing-comma-answer.md`. Local dev shares the same Neon DB (`backend/database.py:12`), so the fix is live locally on landing.

### 2. Server-side guard — never serve a corrupt form as a question

**Target:** `_generate_verb_conjugation_tasks()` in `backend/grammar_service.py:371-419` — the only producer of `verb_conjugation` tasks (single caller `get_verb_lesson_tasks():348`, single endpoint `routers/grammar.py:301`). Validation stays server-side per CLAUDE.md. Today the loop only guards falsiness (`:407-408`); `"kalb̃"`, `"a"`, `"̃"` are all truthy.

Add next to `_clean_form` (`:358`):
```python
import unicodedata  # add to imports

_TONE_MARKS = frozenset("̀́̃")          # grave, acute, tilde
_TONE_CARRIERS = frozenset("aeiouy" + "lmnr")           # after NFD: ė→e, ų→u, ū→u …
_COND_ENDINGS = ("ciau", "ciausi", "tu", "tusi", "tum", "tumei", "tumeis",
                 "tumeisi", "tume", "tumes", "tumeme", "tumemes",
                 "tute", "tutes", "tumete", "tumetes")

def _base_letters(text: str) -> str:
    """Letters only: combining marks and whitespace removed."""
    return "".join(c for c in unicodedata.normalize("NFD", text)
                   if not unicodedata.combining(c) and not c.isspace())

def _verb_stem(infinitive: str) -> str:
    b = _base_letters(infinitive).lower()
    for suf in ("tis", "ti"):
        if b.endswith(suf):
            return b[:-len(suf)]
    return b
```

`_is_usable_form(form, verb, tense_key, conj)` returns False when any holds:

| # | Rule | Catches | Rejects (whole table / `sekmes` pool) |
| --- | --- | --- | --- |
| A | `not _base_letters(form)` — marks only | the 169 lone-accent cells from #151 | 169 / 18 |
| B | `len(_base_letters(form)) < len(_verb_stem(verb.infinitive))` | **`kalb̃` (the reported defect)**, `a`/`ame`/`ate`, `si`/`asi`, `is`, `ško`/`ié` | 661 cells, 228 verbs / 34 |
| C | a tone mark sits on a base letter outside `_TONE_CARRIERS` (walk NFD, remember last non-combining char) | `kalbės̃`, `baig̃`, `dės̃`, `turės̃` — displaced-tilde class | 842 cells, 147 verbs / 16 |
| D | same person value also appears under a **different** tense key of the same verb | `augiǹ`, `džioviǹ` — n-carrier truncations A–C miss | 352 cells, 76 verbs / 0 |
| E | `tense_key == "conditional"` and no `/`-alternate folds to a `_COND_ENDINGS` suffix | past forms parked in the conditional column — **including verb 89's `kalbė́jo`/`kalbė́jome`/`kalbė́jote`**, which A–D cannot see | 575 of 1758 / 31 of 210 |

For E, `_base_letters(alt).lower()` suffices as the fold (NFD already flattens `ė`→`e`, `ū`→`u`; yields `kalbetu`, `kalbeciau`).

Every rejection in the `sekmes` pool plus 30 random table-wide rejections was sampled: **zero false positives.**

**Blast radius:** A–E reject **47 of 1218** `sekmes` cells (3.9%) and 31 of 210 conditional cells; 40 of 42 verbs still have a usable conditional form. The existing `attempts < count * 10` budget (`:399`) absorbs this (a 30-task lesson gets 300 attempts against ~4% rejects) — no budget change needed; keep `continue` semantics (the frontend already scores against `tasks.length`).

Wire-up at `:399-417`:
```python
form = _clean_form(conj.get(_PERSON_KEY.get(person, person)))
if not form:
    continue
if not _is_usable_form(form, verb, tense_key, conj):
    continue   # #153/#151 — corrupt extraction; never present it as a question
```

**Out of scope (belongs to #151):** the guard *hides* bad data, it doesn't repair it. Forms that are wrong but structurally plausible (e.g. verb 90's `kalbié`, a truncated `kalbíesi` whose accent sits on a legal vowel) still slip through — which is why 89/90 also get the hand fix above.

### Steps
1. Confirm the corrected forms with the user (tables above), flagging the three uncertain stress placements.
2. One transaction against Neon updating `verb` rows 89 and 90 (`conjugations = normalize(<corrected JSON>, NFC)` plus `present_3p`). Run the verification query (0 rows) and re-read both rows to confirm codepoint counts (`kal̃ba` = 6, `kalbė̃s` = 7).
3. Edit `backend/grammar_service.py`: add `import unicodedata`, the constants and `_base_letters`/`_verb_stem`/`_is_usable_form` next to `_clean_form` (`:351-368`), plus the two-line call at `:405-409`. No change to `routers/grammar.py` — the router is intentionally thin.
4. Restart the backend (`grammar_service` is imported at startup). **No `npm run build`** — no frontend source changes (unless the optional testid in the Tests section is added).
5. Manual check: `/dashboard/grammar` → «Спряжение глаголов» → lesson 200/201; when `kalbė́ti — jis ___` appears, type a wrong answer and confirm «Правильно: kal̃ba».
6. Cross-reference #151: the guard now suppresses ~13% of conjugation cells table-wide. #151's re-extraction must remove the *cause*; keep the guard afterwards as a permanent invariant (it becomes a no-op once data is clean).

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - New spec `frontend/tests/issue-153-kalbeti-complete-answer.spec.ts`. `playwright.config.ts` sets `baseURL: http://localhost:8000` (backend serves the static export), so live-API and UI tests coexist in one file — same style as `issue-150-verb-answer-no-trailing-comma.spec.ts`. Shared helpers: `baseLetters(s)` (NFD → drop `/\p{M}/gu` and whitespace), `stemOf(infinitive)`, `BAD_CARRIER = /[bcdfghjkpstvzčšž][̀́̃]/`.
   - **Test 1 — no exercise renders a marks-only or truncated answer.** Loop `LESSON_IDS = [200,202,204,206,208,210]` (one per tense) × 5 draws against `/api/grammar/verb-lessons/${id}/tasks`. Per task assert (message: `lesson N, ${verb_infinitive} (${person_label})`): `baseLetters(answer).length > 0`; `>= stemOf(verb_infinitive).length`; no `BAD_CARRIER` match; for lesson 208 the last `/`-alternate ends with a conditional ending. Assert `checked > 0` per lesson so an empty response can't pass silently.
   - **Test 2 — kalbėti serves complete forms.** Draw lesson 200 up to 40 times, collect tasks whose `verb_infinitive` normalises to `kalbeti` (1 of 42 `sekmes` verbs × 20 tasks/draw → P(never seen) ≈ e⁻¹⁹). Assert each answer matches `{ 'aš':'kalbu','tu':'kalbi','jis|ji|jie|jos':'kalba','mes':'kalbame','jūs':'kalbate' }` compared on `baseLetters(...).toLowerCase()` — survives a later stress correction, still fails hard on `kalb`. Clear failure message if never drawn.
   - **Test 3 — the reveal shows the whole word in the UI.** Replay a real `kalbė́ti`/`jis` task captured live in test 2. `page.addInitScript` for `localStorage.fluent_token` (copy `makeFakeJwt`/`setUserToken` from `verbs_grammar.spec.ts:3-13`); `page.route` for `**/api/grammar-programs` → one enrolled `program_type:'verbs'`, `**/api/grammar/lessons` → `[]`, `**/api/grammar/progress` → `{}`, `**/api/grammar/verb-lessons?program_type=verbs` → one unlocked lesson `{id:200, tense_key:'indicative_present', task_count:1, is_locked:false, …}`, `…program_type=verb_cases` → `[]`, `**/api/grammar/verb-lessons/200/tasks` → `[capturedTask]`. `goto('/dashboard/grammar')`; the enrolled program auto-expands (`page.tsx:549-553`) but `SubcategoryGroup` starts collapsed (`:337`) — click `[data-testid="subcategory-toggle"]` then the lesson card (`getByRole('button')` filtered by level badge + `1 задание`; cards carry no testid). Expect prompt `kalbė́ti — jis ___`; fill `xxx`; click `Проверить`; read the `span.font-semibold` adjacent to `page.getByText('Правильно:')`. Assert it equals `capturedTask.answer`, `baseLetters(text).length >= 5`, ends with a vowel, no `BAD_CARRIER` — i.e. `kal̃ba`, not `kalb̃`. Confirm `[data-testid="dismiss-wrong"]` is present to anchor the wrong-answer state.
   - If the card-click selector flakes, add `data-testid={`lesson-${lesson.id}`}` at `page.tsx:394-398` (currently only the locked state has one) — one attribute, but requires a frontend rebuild, so prefer the text selector first.
   - Also extend `backend/tests/test_verb_conjugation_tasks.py` (it registers `Verb.__table__` against in-memory SQLite at `:21`, no conftest change needed): a `TestIsUsableForm` class pinning `kalb̃`, `"a"`, `"̃"`, `kalbės̃`, `kalbė́jo`-in-conditional as rejected and `kal̃ba`, `kalbė́tume / kalbė́tumėme`, `tegu kal̃ba`, `kalbė́tumeisi`, `esù`, `yrà` as accepted; plus a fixture seeding the corrupt verb-89 payload asserting `_generate_verb_conjugation_tasks('indicative_present', 60, s, program_key=None)` never emits `kalb̃`.
   - Regression run: `verbs_grammar.spec.ts`, `issue-150-verb-answer-no-trailing-comma.spec.ts`, `issue-138-verb-conditional-slash-answer.spec.ts`.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #153 — В разделе Грамматика, Спряжение глаголов: kalbė́ti — jis ... Правильно: kalb̃ (не дописан правильный ответ). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 153;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-153-kalbeti-truncated-answer.md` → `plans/triage/implemented/IMPLEMENTED-issue-153-kalbeti-truncated-answer.md`).

---

## Outcome (implemented 2026-08-12)

**Resolved.** `mistake_report.status = 'resolved'`.

- **Rendering layer ruled out by inspection**, as the plan required: the grammar page never
  imports `renderAccented`, and the reveal at `page.tsx:1015` is a raw interpolation. The app
  was faithfully rendering a 5-codepoint DB value (`k a l b U+0303`).
- **Verbs 89/90 repaired** with the corrected paradigms, NFC-normalised (`kal̃ba` = 6 cp,
  `kalbė̃s` = 7 cp, 0 non-NFC cells). This also cleared the decomposed `kalbì`.
- **Server-side guard added** — `_is_usable_form` in `backend/grammar_service.py`, checks A–E
  (marks-only / shorter than stem / tone mark on a non-carrier / duplicated across tenses /
  non-conditional form in the conditional column). `_clean_form` is now also applied to
  `verb.infinitive` in the prompt.

**Cross-validation worth recording:** issue #151's independent re-extraction of the PDF
produced *exactly* the forms hand-entered here (`kal̃ba`, `kalbė́tum`, `kalbė̃s`) — two
independent derivations agreeing.

**Guard is now a no-op on the served pool, as intended.** Rejection rate fell from 18.6% →
0.04% table-wide and 5.3% → 0% in the `sekmes` pool once #151's data landed. Keep it as a
permanent invariant: it costs nothing on clean data and blocks any future extraction defect
from reaching a learner.

**Tests:** `backend/tests/test_verb_data_integrity.py` pins `kalb̃`, `"a"`, `"̃"`, `kalbės̃`
and `kalbė́jo`-in-conditional as rejected, and `kal̃ba`, slash alternates, `tegu kal̃ba`,
reflexive conditionals and the bū́ti irregulars as accepted.
`frontend/tests/issue-151-153-verb-forms-intact.spec.ts` sweeps the live API and asserts
kalbėti serves all five complete present forms.
