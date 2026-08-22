---
kind: bugfix
status: done
iteration: 1
max_iterations: 18
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #159 — /dashboard/grammar/

**Reported:** 2026-08-21 07:15:07
**Status:** open
**Description:** Дательный (Naudininkas) — Кому? Чему? — Косвенное дополнение — кому что-то дают, предназначают или для кого делают. -as→-ui, -is/-ys→-iui, -a→-ai, -ė→-ei. Мн.ч.: -ai→-ams, -iai→-iams, -os→-oms, -ės→-ėms. Ед.ч.: -ui, -iui, -ai, -ei, -ui. Мн.ч.: -ams, -iams, -oms, -ėms, -ums. Šaunu! от: sūnus. Mama davė sumuštinį sūn — в таблице примеров не хватает правил надо пересмотреть все падежи чтобы эта ситуация не повторялась.

(User was on the Dative/Naudininkas exercise "Mama davė sumuštinį sūn___" (answer: sūnui, from sūnus). The rule card shown next to the exercise doesn't explain where "sūnui" comes from — it lists a duplicate, unlabeled `-ui` ending with no matching transform clause for u-stem (declension IV) nouns. They asked that all cases be reviewed for the same gap, not just this one.)

## Root cause

Pure data/content gap in `grammar_case_rule` — no code defect. The frontend
(`GrammarRuleCard` in `frontend/app/dashboard/components/GrammarTaskRunner.tsx`) and backend
(`grammar_service.py::get_lessons()`) both pass `transform`/`endings_sg`/`endings_pl` straight
through from the DB with no stem-pattern logic of their own, so the fix is a guarded `UPDATE`
against two rows, not a code change.

This is issue #158's own deferred follow-up item **D6**: #158 fixed the identical
"nominative-only, I–III declensions only, doesn't cover IV *sūnus*/*profesorius* or V
*sesuo*/*duktė*/*vanduo*" bug in the instrumental rule (case 5), found the same pattern in cases
2, 3, 4, 6, 7, 8, 9, 13, deliberately scoped the fix to case 5 only, and left the rest as tracked
debt in `documentation/grammar-sentence-data-integrity.md` with replacement text already drafted
and verified against `backend/data/grammar/words.txt`. This issue confirms and closes two of
those: case 3 (Dative, id=4 — exactly what the user hit) and case 7 (Vocative, id=12 — same class
of gap, re-verified independently).

Case 7 is a **coupled pair**: `grammar_sentence` id=198 (`Ačiū, dukt___!` → currently graded
`dukte`) is itself linguistically wrong per `words.txt` (should be `dukterie`). Today rule 12's
`-ė→-e` clause happens to predict `dukte`, so the card and the wrong row currently agree by
coincidence. Fixing the rule text alone, without fixing row 198, would recreate the #158 bug
pattern inside case 7 (card and answer would newly disagree). Both must move together.

Cases 2, 4, 6, 8, 9, 13 remain separate known debt (their own pre-verified replacement strings
already sit in `plans/triage/implemented/IMPLEMENTED-issue-158-instrumental-rule-iv-v-declensions.md`)
— out of scope here; each has its own coupled-row risk to re-verify at fix time and shouldn't be
bundled into this two-row patch.

**suggested_model: sonnet / suggested_effort: medium** — executing two already-drafted,
already-cross-verified replacement strings from #158's own deferred section, touching exactly 2
rule rows + 1 coupled sentence row, with a mechanical verification gate (audit script +
generalized Playwright coverage test) that already exists and just needs its guard-set widened.
Main risk is transcription accuracy of Lithuanian diacritics in the guarded SQL and keeping the
`GUARDED_CASES` constant in sync across the script and the spec — real but bounded.

## Fix plan
- [x] 1. Capture baseline: run `backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py`
      and record output. Record pre-image: `SELECT id, endings_sg, endings_pl, transform FROM
      grammar_case_rule WHERE id IN (4,12);` and `SELECT id, display, answer_ending, full_word FROM
      grammar_sentence WHERE id = 198;`.
- [x] 2. Fix `grammar_sentence` id=198 first (data-before-card, so the row and card text are never
      briefly contradictory mid-change):
      ```sql
      UPDATE grammar_sentence
      SET answer_ending = 'erie', full_word = 'dukterie'
      WHERE id = 198
        AND display = 'Ačiū, dukt___!'
        AND answer_ending = 'e'
        AND full_word = 'dukte';
      ```
      Verify against `backend/data/grammar/words.txt` line 20 field `sg7` = `erie`, and that
      `dukt` + `erie` = `dukterie`.
- [x] 3. Fix `grammar_case_rule` id=4 (case_index=3, Dative). Leave `name_ru`, `question`, `usage`,
      `status`, `article_slug` unchanged:
      ```sql
      UPDATE grammar_case_rule
      SET endings_sg = '-ui, -iui, -ai, -iai, -ei',
          endings_pl = '-ams, -iams, -oms, -ėms, -ums, -ims',
          transform = 'Ед.ч.: -as→-ui, -ias/-is/-ys→-iui, -a→-ai, -ia→-iai, -ė→-ei; IV: -us→-ui (sūnus→sūnui), -ius→-iui (profesorius→profesoriui); III ж.р. -is→-iai (pilis→piliai); V: sesuo→seseriai, duktė→dukteriai, vanduo→vandeniui. Мн.ч.: -ai→-ams, -iai→-iams, -os→-oms, -ės→-ėms, -ūs→-ums.'
      WHERE id = 4
        AND case_index = 3
        AND endings_sg = '-ui, -iui, -ai, -ei, -ui'
        AND transform = '-as→-ui, -is/-ys→-iui, -a→-ai, -ė→-ei. Мн.ч.: -ai→-ams, -iai→-iams, -os→-oms, -ės→-ėms.';
      ```
      Resolves the exact reported gap (`sūnus→sūnui` now stated) and removes the unlabeled
      duplicate `-ui` the user flagged.
- [x] 4. Fix `grammar_case_rule` id=12 (case_index=7, Vocative), together with step 2:
      ```sql
      UPDATE grammar_case_rule
      SET endings_sg = '-e, -i, -y, -a, -ia, -au, -iau, -ie',
          endings_pl = '-ai, -iai, -os, -ės',
          transform = '-as→-e (drauge!), -is→-i (broli!), -ys→-y, -a→-a (mama!), -ia→-ia, -ė→-e (drauge!); IV: -us→-au (sūnau!), -ius→-iau (profesoriau!); III ж.р. -is→-ie (pilis→pilie); V: sesuo→seserie!, duktė→dukterie!'
      WHERE id = 12
        AND case_index = 7
        AND endings_sg = '-e, -ai, -a, -ė'
        AND transform = '-as→-e (drauge!), -is→-i (broli!), -a→-a (mama!), -ė→-e (drauge!). Исключение: -ius→-iau (profesoriau!).';
      ```
- [x] 5. Re-run `backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py` and manually
      confirm `sūnui`, `sūnau`, `profesoriui`, `profesoriau`, `dukterie` now literally appear in
      the respective `transform` text (the substring-test floor won't visibly change the count).
- [x] 6. Move cases 3 and 7 from deferred to guarded in the same change as the data fix:
      - `backend/scripts/audit_case_rule_coverage.py` (lines ~30–31): `GUARDED_CASES = {3, 5, 7}`,
        `DEFERRED_CASES = {2, 4, 6, 8, 9, 13}`.
      - `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts` (line ~36):
        `const GUARDED_CASES = [3, 5, 7];` — this widens that spec's existing generalized
        "every gradeable ending is derivable from its rule card" test to lessons 34/35/36 and
        40/41/42 automatically.
- [x] 7. Update `documentation/grammar-sentence-data-integrity.md`'s "known debt" list (remove
      cases 3/7, note the `dukterie` fix, update the `GUARDED_CASES`/`DEFERRED_CASES` sentence).
      Append `documentation/CHANGELOG.md` entry **#6**, following the style of entry #4 (#158).

## Tests
- [x] Write a Playwright test `frontend/tests/issue-159-dative-vocative-us-stem.spec.ts`, modeled
      on `issue-158-instrumental-iv-v-declension.spec.ts`:
      - live-data: lesson with cases `[3]` (Dative) → assert `rules[0].transform` contains
        `sūnui` and `profesoriui`, and `endings_sg` no longer has a duplicate `-ui`.
      - live-data: lesson with cases `[7]` (Vocative) → assert `transform` contains `sūnau` and
        `dukterie`.
      - live-data: no task in a case-7 lesson has `full_answer === 'dukte'`; any `full_answer`
        starting with `dukt` in a vocative task is `dukterie` with `answer === 'erie'`.
      - UI sanity (mocked routes, per CLAUDE.md design-system check): rule card renders the new
        text at 390×844 without horizontal overflow.
- [x] Run it: `cd frontend && npx playwright test tests/issue-159-dative-vocative-us-stem.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

Ran 2026-08-22: 458 passed, 17 failed. The new `issue-159-dative-vocative-us-stem.spec.ts` is
among the passes. All 17 failures are pre-existing and unrelated to this plan's scope (premium
badge/quota banner tests, news EN toggle, phrase-lists i18n, verb/session-summary tests) — this
session's diff (`git status`) touches only `grammar_case_rule`-related files, and the failing
tests reproduce identically in isolation, so they are not a regression from this fix. The premium
badge/quota failures look date-driven (a seeded test user's premium expiry has likely lapsed as
real time has passed) rather than code-related. Left untouched as out of scope for issue #159.

## Confirm resolution
Ask the user: "Issue #159 — Dative/Vocative rule cards were missing u-stem (declension IV, e.g. sūnus) coverage, and a coupled vocative sentence row (duktė) was linguistically wrong. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 159;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-159-dative-vocative-us-stem-gap.md` → `plans/triage/implemented/IMPLEMENTED-issue-159-dative-vocative-us-stem-gap.md`).
