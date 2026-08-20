---
kind: bugfix
status: done
iteration: 1
max_iterations: 18
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Issue #158 — /dashboard/grammar/

**Reported:** 2026-08-20 13:52:40
**Status:** open
**Description:** Базовое упражнение на творительный падеж. Сопроводительный текст (правила):

> Творительный (Įnagininkas)
> Кем? Чем? С кем?
> Инструмент или совместность. После предлога su (с кем/чем).
>
> -as→-u, -is/-ys→-iu, -a→-a (без изменений), -ė→-e. Мн.ч.: -ai→-ais, -iai→-iais, -os→-omis, -ės→-ėmis.
>
> Ед.ч.: -u, -iu, -a, -e
> Мн.ч.: -ais, -iais, -omis, -ėmis, -umis

При этом в заданиях есть варианты с неописанными здесь IV и V склонениями, что сильно затрудняет обучение — нет перед глазами нужных правил.

## Root cause

`grammar_case_rule.transform` is written in terms of the **nominative endings of declensions I–III only**, while the exercise shows a bare stem (`profesor___`, `sūn___`, `dukt___`) and grades the **stem-relative ending** the user types (`isAnswerMatch(typed, answer_ending)` — `frontend/lib/normalizeLt.ts:18`). For 4th-declension (`-us`/`-ius`) and 5th-declension (`sesuo`, `duktė`, `vanduo`) nouns the mapping is not merely absent, it is **actively wrong**:

- `-is/-ys→-iu` predicts `profesoriu` — real answer is `profesoriumi` (ids 124, 131)
- `-ė→-e` predicts `dukte` — real answer is `dukterimi` (id 204)
- `-us→-umi` (`sūnumi`, id 132) is not stated at all

Six of the 16 live case-5 sentences cannot be derived from the card. Row 8's own `endings_pl` already carries `-umis` while `endings_sg` lacks `-umi` — that is the internal tell.

**Secondary defect, same family: `grammar_sentence` id=126 is itself wrong.** `Mama eina su ses___` stores `answer_ending='eria'` / `full_word='seseria'`; standard Lithuanian is **`seserimi`**, and the repo's authoritative table `backend/data/grammar/words.txt` line 19 already says `ses …ᵗᵃᵇ erimi`. Issue #156 corrected `words.txt` for both `ses` and `dukt` and DB row 204 (*duktė*) but **missed DB row 126 (*sesuo*)** — it passes `_sentence_invariant_holds` (`ses`+`eria`=`seseria`), so #156's filter never caught it. Must be fixed in this pass, otherwise the corrected rule text ("sesuo→seserimi") directly contradicts the graded answer, which is worse than today.

**Scope — this is not a one-off.** A sibling audit found the same I–III-only gap in 8 more rule rows:

| case | rule id | live endings the card cannot produce | verdict |
| --- | --- | --- | --- |
| 5 Įnag. sg | **8** | `iumi` (124, 131), `umi` (132), `erimi` (204), `eria`→`erimi` (126) | **reported — fix** |
| 4 Galin. sg | **2** | `erį` (24 duktė, 37 sesuo), `enį` (26 vanduo) | same bug, fix |
| 13 Viet. pl | **9** | `yse` (144 pilis, 145 stotis), `iose` (146 bažnyčia) | fix |
| 2 Kilm. sg | **6** | `iaus` (101, 103 `-ius`) | fix |
| 6 Viet. sg | **10** | `ioje` (163 bažnyčia) | fix |
| 8 Vard. pl | **11** | `ios` (182); plus the garbled `-us→-ūs (muziejai→muziejai …)` clause #137 deferred | fix |
| 7 Šauksm. sg | **12** | `-us→-au` (197 sūnau) unstated; row 198 `dukt___`→`dukte` contradicts `words.txt` (`erie`) | fix rule + row 198 |
| 3 Naud. sg | **4** | `-us→-ui`, `-ius→-iui` unstated; `endings_sg` lists `-ui` twice | fix (low risk) |
| 9 Kilm. pl | **5** | advertises only `-ų` while 7 rows need `-ių` | fix (low risk) |
| 10, 11, 12 | 3, 1, 7 | none | leave alone |

**No seed/migration lockstep needed — verified.** `scripts/seed.py` touches only `Word`/`WordList`/`WordListItem`; `routers/grammar.py::_ensure_seed` seeds only `GrammarProgram`; `backend/scripts/seed_numbers_grammar.py` writes `GrammarCaseRule` but is scoped to **case_index 15–20** and run manually; migrations are schema-only. The one in-repo copy of this text, `api/data/grammar/rules.py` (`CASE_RULES[5]`), belongs to the **dead pre-refactor `api/` app** (both `render.yaml` and root `main.py` boot `backend/main.py`; it has no `transform` field). Issue #156 already established `api/` as dead code — **leave it untouched**. `grammar_case_rule` is DB-authoritative; the fix is guarded SQL `UPDATE`s, not a repo edit. `GET /api/grammar/lessons` has no caching, so updates are live immediately with no deploy.

**suggested_model / suggested_effort reason:** `opus` / `high` — not a single-row content patch: it rewrites user-facing Lithuanian grammar rules across 9 `grammar_case_rule` rows plus 2 mis-declined production sentence rows, where a wrong string silently teaches every learner an error and no test can validate the linguistics for you.

## Fix plan

> **Scope narrowed by the user (2026-08-20).** The reported defect is case 5. The sibling audit
> found the same gap in 8 more cases, but rewriting nine cases of user-facing grammar explanations
> is a much larger editorial change than the report asked for, so items 4–9 were moved to
> **## Deferred (follow-up)** below and are *not* applied in this pass. This pass applies
> statements [1] (sentence 126), [6] (rule 8) and [12] (article) only.


DB access per repo precedent: no `psql` on this machine — parse `DATABASE_URL` from `backend/.env` and use inline `psycopg` v3 via `backend/.venv/bin/python`. Every statement id- **and** value-guarded so it is idempotent.

- [x] 1. **Baseline audit (read-only, record output in this file).** For every non-archived `grammar_sentence` with `case_index` 1–14, check whether `answer_ending` appears as a substring of that case's `transform || endings_sg || endings_pl`. Expected before-state: the "live endings" column above. Keep the script — step 10 re-runs it as the gate.

      **Script:** `backend/scripts/audit_case_rule_coverage.py` (read-only, exits 1 on any uncovered ending outside the allowlist). Recorded before-state:

      ```
      Checked 201 live sentences across 12 rule rows (cases 1-14).
      case  2 Kilmininkas       id  101 'iaus'  Ten nėra profesor___.      [profesoriaus]
                                id  103 'iaus'  Ten nėra aktor___.         [aktoriaus]
      case  4 Galininkas        id   24 'erį'   Tėvas myli dukt___.        [dukterį]
                                id   26 'enį'   Aš geriu vand___.          [vandenį]
                                id   37 'erį'   Aš turiu ses___.           [seserį]
      case  5 Įnagininkas       id  124 'iumi'  Petras dirba su profesor___. [profesoriumi]
                                id  126 'eria'  Mama eina su ses___.       [seseria]
                                id  131 'iumi'  Ona dirba su aktor___.     [aktoriumi]
                                id  204 'erimi' Mama eina su dukt___.      [dukterimi]
      case  6 Vietininkas       id  163 'ioje'  Mama dirba bažnyč___.      [bažnyčioje]
      case  8 Vardininkas Dgs.  id  182 'ios'   Tos bažnyč___ yra senos.   [bažnyčios]
      case 13 Vietininkas Dgs.  id  144 'yse'   Jie gyvena pil___.         [pilyse]
                                id  145 'yse'   Mama laukia stot___.       [stotyse]
                                id  146 'iose'  Vaikai mokosi bažnyč___.   [bažnyčiose]
      allowlisted: id 203 (case 4) 'šį' -- Jonas neša krep___.
      TOTAL UNCOVERED: 14  (allowlisted: 1)
      ```

      Matches the plan's predicted before-state exactly. **Known limitation of the substring
      test:** very short endings (`-e`, `-au`, `-ui`, `-ių`) match incidentally inside longer
      words in `transform`, so cases 3, 7, 9 report 0 uncovered even though the plan found real
      gaps there by inspection. The audit is a floor, not a ceiling — items 9's rule fixes for
      ids 12, 4, 5 stand on the linguistic evidence in `words.txt`, not on this script's output.
- [x] 2. **Fix the wrong data row first** (so rule text and graded answer agree): `UPDATE grammar_sentence SET answer_ending='erimi', full_word='seserimi' WHERE id=126 AND display='Mama eina su ses___.' AND answer_ending='eria' AND full_word='seseria';` → 1 row. Verify `ses`+`erimi`=`seserimi` and that `_sentence_invariant_holds` still passes.
- [x] 3. **Case 5 — the reported row (`grammar_case_rule` id=8).** Leave `name_ru`, `question`, `usage`, `status`, `article_slug` unchanged; set:
      - `endings_sg` = `-u, -iu, -a, -ia, -e, -umi, -iumi, -imi`
      - `endings_pl` = `-ais, -iais, -omis, -ėmis, -umis, -imis`
      - `transform` = `Ед.ч.: -as→-u, -ias/-is/-ys→-iu, -a→-a, -ia→-ia, -ė→-e; IV: -us→-umi (sūnus→sūnumi), -ius→-iumi (profesorius→profesoriumi); III ж.р. -is→-imi (pilis→pilimi); V: sesuo→seserimi, duktė→dukterimi, vanduo→vandeniu. Мн.ч.: -ai→-ais, -iai→-iais, -os→-omis, -ės→-ėmis, -ūs→-umis.`
- [x] 4. **Re-run the step-1 audit. Gate: zero uncovered endings for the GUARDED cases — `{5}` under the narrowed scope** (`backend/scripts/audit_case_rule_coverage.py` exits 0). Uncovered endings in the 8 deferred cases are reported as known debt and do not fail the gate; keep `GUARDED_CASES` there in sync with the same constant in `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts`. One documented allowlist entry stands: id 203 `Jonas neša krep___.` → `šį` (case 4) — that row's display truncates the stem *inside* `krepš` (issue #135 / #52 territory), so it is not expressible as an ending mapping at all.
- [x] 5. **Article contradiction (fix or file follow-up — do not silently skip).** Article `daiktavardžiai-linksniavimas` has `| Творительный | šun-imi | akmen-imi | ruden-imi |` in both `body_ru` and `body_en`; `akmen-imi`/`ruden-imi` should be `akmen-iu`/`ruden-iu` (`šun-imi` is correct). Step 3's text now says `vanduo→vandeniu` and would visibly contradict it. Either apply a literal-guarded `UPDATE article SET body_ru = replace(...)` or file a follow-up issue.
- [x] 6. **Layout check (required — CLAUDE.md).** The card lives inside `max-w-lg` in `GrammarRuleCard` (`frontend/app/dashboard/components/GrammarTaskRunner.tsx` ~155–216) and at `basic` level is always expanded above the input. The transform grows from 101 → ~270 chars (~5 lines desktop, ~8 lines at 360px). Screenshot lesson 28 at 390×844 and confirm the answer input is still reachable. Fallback if the card dominates the viewport: drop the trailing `Мн.ч.: …` clause from the *singular* cases (2, 3, 4, 5) — it duplicates cases 9/10/11/12's own rules and saves ~80 chars each. No component/token changes expected; if any markup does change, update `documentation/design system/Component Library (as-built).html` and run `frontend/tests/design-system-parity.spec.ts`.
- [x] 7. **Docs (CLAUDE.md requirement).** Append to `documentation/grammar-sentence-data-integrity.md`: `grammar_case_rule` is DB-authoritative for cases 1–14 exactly like `grammar_sentence` (no seed file; `api/data/grammar/rules.py` is dead code; `seed_numbers_grammar.py` covers 15–20 only), plus the new invariant *"every `answer_ending` reachable in a case's live sentences must be derivable from that case's rule card, because the learner types the stem-relative ending, not the nominative-based one."* Add entry **#4** to `documentation/CHANGELOG.md` (last is #3).

## Deferred (follow-up)

Not applied in this pass — see the scope note above. Each carries the exact replacement string that
was drafted and verified against `backend/data/grammar/words.txt`, so the follow-up is mechanical.
When one is applied, move its case from `DEFERRED_CASES` to `GUARDED_CASES` in **both**
`backend/scripts/audit_case_rule_coverage.py` and
`frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts` in the same change.

**Case 7 is a coupled pair:** sentence 198 (`dukte`) is linguistically wrong, but rule 12's `-ė→-e`
predicts exactly `dukte`, so card and row currently agree. Fixing the row alone would recreate the
#158 bug inside case 7. Rule 12 and row 198 move together, or not at all.

- **D1.** **Case 4 (id=2).** `endings_sg` = `-ą, -ią, -į, -ų, -ių`; `transform` = `Ед.ч.: -as→-ą, -ias→-ią, -is/-ys→-į, -a→-ą, -ia→-ią, -ė→-ę; IV: -us→-ų (sūnus→sūnų), -ius→-ių (vaisius→vaisių); III ж.р. -is→-į (žuvis→žuvį); V: sesuo→seserį, duktė→dukterį, vanduo→vandenį. Мн.ч.: -ai→-us, -iai→-ius, -os→-as, -ės→-es.`
- **D2.** **Case 13 (id=9).** `endings_pl` = `-uose, -iuose, -ose, -iose, -ėse, -yse`; `transform` = `-ai→-uose (namuose), -iai→-iuose (broliuose), -os→-ose, -ios→-iose (bažnyčiose), -ės→-ėse; IV: -ūs→-uose (turgūs→turguose); III ж.р. -ys→-yse (pilys→pilyse, stotys→stotyse); V: seserys→seseryse.`
- **D3.** **Case 2 (id=6).** `endings_sg` = `-o, -io, -os, -ės, -aus, -iaus, -ies`; `endings_pl` = `-ų, -ių`; `transform` = `Ед.ч.: -as→-o, -ias/-is/-ys→-io, -a→-os, -ia→-ios, -ė→-ės; IV: -us→-aus (sūnus→sūnaus), -ius→-iaus (profesorius→profesoriaus); III ж.р. -is→-ies (stotis→stoties); V: sesuo→sesers, duktė→dukters, vanduo→vandens. Мн.ч.: -ų / -ių (brolių, svečių).`
- **D4.** **Case 6 (id=10).** `endings_sg` = `-e, -yje, -oje, -ioje, -ėje, -uje, -iuje`; `endings_pl` = `-uose, -iuose, -ose, -iose, -ėse, -yse`; `transform` = `Ед.ч.: -as→-e (namas→name), -ias/-is/-ys→-yje (brolis→brolyje), -a→-oje, -ia→-ioje (bažnyčia→bažnyčioje), -ė→-ėje; IV: -us→-uje (muziejus→muziejuje), -ius→-iuje; III ж.р. -is→-yje (stotis→stotyje); V: sesuo→seseryje, duktė→dukteryje, vanduo→vandenyje.`
- **D5.** **Case 8 (id=11)** — also closes the clause issue #137 deferred. `endings_pl` = `-ai, -iai, -os, -ios, -ės, -ūs, -ys`; `transform` = `-as→-ai (namai), -ias/-is/-ys→-iai (broliai, svečiai), -a→-os, -ia→-ios (bažnyčios), -ė→-ės; IV: -us→-ūs (sūnūs, turgūs), но muziejus→muziejai; -ius→-iai (profesoriai); III ж.р. -is→-ys (pilys); V: sesuo→seserys, duktė→dukterys.`
- **D6.** **Cases 7, 3, 9 (lower risk, same pass).**
      - id=12 (case 7): `endings_sg` = `-e, -i, -y, -a, -ia, -au, -iau, -ie`; `transform` = `-as→-e (drauge!), -is→-i (broli!), -ys→-y, -a→-a (mama!), -ia→-ia, -ė→-e (drauge!); IV: -us→-au (sūnau!), -ius→-iau (profesoriau!); V: sesuo→seserie!, duktė→dukterie!` **and** the matching data fix `UPDATE grammar_sentence SET answer_ending='erie', full_word='dukterie' WHERE id=198 AND display='Ačiū, dukt___!' AND answer_ending='e' AND full_word='dukte';` (same evidence as step 2: `words.txt` line 20 field 8 = `erie`). Required if the rule text changes, else they contradict.
      - id=4 (case 3): `endings_sg` = `-ui, -iui, -ai, -iai, -ei` (drops the duplicate `-ui`); `endings_pl` = `-ams, -iams, -oms, -ėms, -ums, -ims`; `transform` = `Ед.ч.: -as→-ui, -ias/-is/-ys→-iui, -a→-ai, -ia→-iai, -ė→-ei; IV: -us→-ui (sūnus→sūnui), -ius→-iui (profesorius→profesoriui); III ж.р. -is→-iai (pilis→piliai); V: sesuo→seseriai, duktė→dukteriai, vanduo→vandeniui. Мн.ч.: -ai→-ams, -iai→-iams, -os→-oms, -ės→-ėms, -ūs→-ums.`
      - id=5 (case 9): `endings_pl` = `-ų, -ių`; `transform` = `Твёрдая основа → -ų (namų, knygų, sūnų); мягкая (-ias/-is/-ys/-ia/-ė/-ius) → -ių (brolių, svečių, bažnyčių, braškių, profesorių). V: seserų, dukterų, vandenų.`

## Tests

- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
      New `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts`, modeled on `frontend/tests/issue-156-dukterimi-instrumental.spec.ts` (which already mixes a live-data fetch with mocked-route UI assertions):
      - **live-data:** `fetch('/api/grammar/lessons')` → lesson 28 (`basic`, cases `[5]`) → assert `rules[0].transform` contains `umi`, `iumi`, `seserimi`, `dukterimi` and `endings_sg` contains `-umi`; then `fetch('/api/grammar/lessons/28/tasks')` 3× and assert every `task.answer` occurs in `transform + endings_sg + endings_pl` (case-insensitive) — the generalized guard for this bug class.
      - **live-data:** no task has `full_answer === 'seseria'`; any `full_answer.startsWith('seser')` is exactly `seserimi` with `answer === 'erimi'`.
      - **UI (mocked routes):** rule card renders the new transform string; typing `iumi` on `Petras dirba su profesor___.` shows no `[data-testid="dismiss-wrong"]`.
      - Optionally extend the same live-data coverage assertion across cases 2–13 with the single `id 203 / 'šį'` allowlist.
- [x] Run it: `cd frontend && npx playwright test tests/issue-158-instrumental-iv-v-declension.spec.ts --reporter=list`

**Known baseline:** issue #156 recorded 7 pre-existing unrelated failures (`issue-117`, `lists-progress-parallel`, `news`, `phrase-lists`, `quota`, `stats-card-alignment` ×2) — compare against that baseline, don't chase them. No existing test asserts live rule text (all mock it), so nothing should break.

## Critical files

- `backend/grammar_service.py` — `get_lessons()` (the only consumer of the rule fields), `_generate_sentence_tasks` / `_sentence_invariant_holds`
- `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — `GrammarRuleCard`: layout constraint check, mocked-UI test target
- `backend/data/grammar/words.txt` — authoritative declension table; ground truth for `seserimi`/`dukterie` and every proposed ending
- `frontend/tests/issue-156-dukterimi-instrumental.spec.ts` — test pattern to copy
- `documentation/grammar-sentence-data-integrity.md`, `documentation/CHANGELOG.md`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution

Ask the user: "Issue #158 — Творительный падеж: сопроводительный текст правил описывает только I–III склонения, а в заданиях встречаются IV и V. Mark as resolved?"

Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 158;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-158-instrumental-rule-iv-v-declensions.md` → `plans/triage/implemented/IMPLEMENTED-issue-158-instrumental-rule-iv-v-declensions.md`).
