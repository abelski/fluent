---
kind: feature
status: done
iteration: 2
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Grammar content quality pass (cases, numbers, verb tenses) + remove quota banner

## Context

The user likes how the Vocative (Šauksmininkas) rule card explains its pattern —
`documentation/design system`-quality UX aside, its *content* is a good model: it states the
suffix-by-declension mapping (`-as→-e (namas→name!)`, `-is→-i (maišelis→maišeli!)`, ...), lists
singular/plural endings compactly, and its example words (`namas`, `maišelis`, `knyga`, `gatvė`,
...) never overlap with the words actually graded in that case's exercises. The user asked to
review every case in the app against that bar and propose/apply changes so each rule card is
well-explained, has enough examples, never reuses exercise words in its explanation, and both the
card and the exercise sentences are logically sound (no "in a brother" (`broliuose`)-style
nonsense).

Investigation (this session, see chat + `documentation/grammar-sentence-data-integrity.md`) found
this is **not a hypothetical concern** — it is exactly the shape of debt already tracked and
partially fixed over issues #158/#159/#162:

- **Invariant 1 (ending coverage):** every gradeable `answer_ending` must be derivable from its
  case's rule card. Guarded (fixed) for cases `{3, 5, 7}`; still broken (rule card mispredicts the
  answer, not just omits it) for cases `{2, 4, 6, 8, 9, 13}`. Enforced by
  `backend/scripts/audit_case_rule_coverage.py`.
- **Invariant 2 (no example/answer overlap):** a rule card's illustrative words must not be a
  graded answer in that same case's exercise pool (otherwise the student reads the answer off the
  card). Fixed only for cases 3 and 7; **still leaking in cases 2, 5, 6, 8, 9, 10, 11, 12, 13** (see
  the table in the doc). No committed script checks this yet — it was checked ad hoc.
- **Invariant 3 (real-world plausibility):** a locative example must be something you can
  plausibly be "in/at" — issue #162's `brolis`→`broliuose` bug. Audited and fixed for cases 6/13
  only; the other cases were never audited for this class of problem.

Content lives directly in production Postgres (Neon) — `GrammarCaseRule` and `GrammarSentence`
(`backend/models.py:176-205`), no seed file, no deploy step; edited today via
`/dashboard/admin/grammar` (`backend/routers/admin.py:945-1293`) or guarded SQL. The three public
grammar programs (`grammar_program` table) share this same content model for **Cases**
(case_index 2–13) and **Numbers** (case_index 15–20, plus a repo-committed
`backend/scripts/seed_numbers_grammar.py` that must stay in sync). **Verb Conjugation** is
structurally different: its "rule card" is the `tense_hints` block in the repo-committed
`backend/data/grammar/verb_lessons.json` (code, not DB), and its exercise sentences are
auto-generated at request time from real verb data (`Verb.conjugations`,
`grammar_service.py:529-581`), so there is no hand-authored-sentence nonsense-example risk there —
only the hint text itself needs a clarity pass.

Separately, the user asked to remove a "trial banner." Nothing named "trial" exists in the repo;
the closest match is `QuotaBanner` (`frontend/app/dashboard/components/QuotaBanner.tsx`, "Sessions
today: N/limit" + "Get Premium" CTA), rendered only on `/dashboard/lists`
(`frontend/app/dashboard/lists/page.tsx:273`) and `/dashboard/phrases`
(`frontend/app/dashboard/phrases/page.tsx:301`) — never on any grammar page. User confirmed: remove
it app-wide (both render sites).

**Model/effort rationale:** this is real Lithuanian-grammar content authoring (suffix patterns,
declension classes, realistic example nouns/sentences) applied under three strict, already-proven
invariants, across ~20 rule cards, writing directly to production with no staging step and a
`400`-on-violation guard for one invariant already live. That combination of linguistic judgment +
multi-file consistency (rule card ↔ live sentences ↔ audit scripts ↔ seed script ↔ any linked
grammar `Article`) + production blast radius calls for the stronger model/effort tier.

## Goals

- Every rule card for the 12 noun cases (case_index 2–13) and 6 number topics (case_index 15–20)
  is rewritten to the vocative-card quality bar: correct, complete suffix/declension breakdown
  (closing Invariant 1 for cases 2, 4, 6, 8, 9, 13), example words that are realistic and never
  equal to a graded answer in that case's own exercise pool (closing Invariant 2 for cases 2, 5, 6,
  8, 9, 10, 11, 12, 13), and example nouns that make real-world sense for what the case means
  (Invariant 3, audited beyond the already-fixed cases 6/13).
- Each case's live exercise sentences are audited against the same three invariants; any sentence
  that fails one (nonsense meaning, example collision, broken stem+ending=full_word) is corrected
  via the admin content model, not just the card.
- The 6 verb-tense `tense_hints` entries in `backend/data/grammar/verb_lessons.json` are rewritten
  for clarity/completeness to the same bar (person/ending breakdown, plain description of when the
  tense is used).
- A committed, reusable script closes the gap Invariant 2 currently has no automated check for.
- `audit_case_rule_coverage.py`'s `GUARDED_CASES`/`DEFERRED_CASES` are updated so every case fixed
  in this pass moves from deferred to guarded (per the convention already established in the doc).
- `QuotaBanner` no longer renders on `/dashboard/lists` or `/dashboard/phrases`; the component is
  deleted if that leaves it fully unused.
- `documentation/grammar-sentence-data-integrity.md` reflects the new state (debt tables updated,
  new script documented) and `documentation/CHANGELOG.md` gets entry `#9`.

## Non-Goals

- Adding the two missing lessons (case_index 1 — Vardininkas Vns., the bare dictionary form with
  no transform to drill; case_index 14 — Šauksmininkas Dgs., vocative plural, never authored).
  Creating a new lesson is a `lessons.json` structural change, not a content-quality rewrite of an
  existing one.
- The hidden `verb_cases` program (governance) — user scoped this pass to the 3 public programs.
- Changing quota/premium business logic, the daily-limit enforcement itself, or the
  `sessions_today`/`limitReached` gating already used elsewhere on the Lists/Phrases pages (e.g.
  disabling the "start session" button) — only the visible banner box is removed.
- Rewriting `words.txt`, `_generate_declension_tasks`, or `_generate_verb_conjugation_tasks` —
  these already have their own guards (`_PLACE_STEMS`, `_is_usable_form`) and are out of scope.
- Wholesale regeneration of all ~635 hand-authored sentences from scratch. Every case's sentence
  pool gets audited; only sentences that actually fail one of the three invariants (or read as
  clearly illogical) get rewritten. Sentences that are already fine stay as-is.
- New grammar programs beyond the existing 3 public ones.

## Requirements

1. For each in-scope case_index (2–13, 15–20): rewrite `GrammarCaseRule.transform` (and
   `endings_sg`/`endings_pl`/`usage`/`question`/`name_ru` as needed) so every declension class
   actually present among that case's live sentences is covered, using the vocative card's format
   (`suffix→suffix (word→word!)`, grouped by declension, semicolon-separated).
2. Every example word used in a rewritten card must be verified absent from that case's own live
   `grammar_sentence.full_word` pool (query before choosing, not after).
3. Every example word/noun must be real-world plausible for what the case means (a locative example
   must be a place/thing you can be "in/at"; a dative example should be a plausible recipient;
   etc.) — sense-check each one, don't just satisfy grammar.
4. Any exercise sentence that fails invariant 1–3 above, or reads as a nonsense pairing regardless
   of grammatical validity (the "mother sells brother" class of problem), must be corrected via the
   same admin content model (guarded SQL `UPDATE`/`INSERT` per
   `documentation/grammar-sentence-data-integrity.md`'s "Gotcha: no psql" section, or the admin API)
   — never by editing a seed file that isn't authoritative for that table.
5. `stem(display) + answer_ending == full_word` must continue to hold for every touched sentence
   (already enforced server-side by `_sentence_invariant_holds` / the admin `400` guard — do not
   bypass it).
6. `backend/scripts/seed_numbers_grammar.py`'s `CASE_RULES`/sentence literals must be updated to
   match whatever ships to production for case_index 15–20, so a future re-seed doesn't reintroduce
   the old text (this script is the one exception to "DB is sole authority" — see doc line 46-59).
7. If a `GrammarCaseRule.article_slug` points at a grammar `Article`, check that article's content
   for cells that would contradict the new rule text (as issue #158 had to fix
   `daiktavardžiai-linksniavimas`) and correct it in the same change if so.
8. New script `backend/scripts/audit_rule_card_examples.py` (read-only, modeled on
   `audit_case_rule_coverage.py`'s DB-connection pattern): for each case_index in `{2..13, 15..20}`,
   tokenize `transform || endings_sg || endings_pl`, and fail if any token exactly matches (case
   -insensitively) a live (`archived IS NOT TRUE`) `full_word` for that same case_index. Exit 1 on
   any match.
9. `backend/scripts/audit_case_rule_coverage.py`: move every case fixed in this pass from
   `DEFERRED_CASES` to `GUARDED_CASES`.
10. `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts` (and/or
    `issue-159-dative-vocative-us-stem.spec.ts`, whichever holds the shared `GUARDED_CASES`-style
    set for the live-data spec check) widened to match.
11. Remove `<QuotaBanner quota={quota} />` from `frontend/app/dashboard/lists/page.tsx:273` and
    `frontend/app/dashboard/phrases/page.tsx:301`. Grep the repo for `QuotaBanner`/`QuotaInfo`
    imports afterward; delete `frontend/app/dashboard/components/QuotaBanner.tsx` only if nothing
    imports it anymore. Leave `quota` state, the `/api/me/quota` fetch, and `limitReached`/
    `eligible` derived values in place — they still gate other UI on both pages.

### Standing constraints
- All validation must be server-side (never frontend-only) — already true here: the `400` guard on
  `stem+ending==full_word` lives in `backend/routers/admin.py`, not the admin frontend.
- This plan touches styling only incidentally (removing a banner element). Read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` before touching `lists/page.tsx`/`phrases/page.tsx` layout, and
  run `frontend/tests/design-system-parity.spec.ts` after, since both pages are in the shared
  top-nav shell (`NAV_PAGES`). No new component/token is introduced.
- Add autotest coverage for the new/changed behavior and run the relevant suite(s) as part of
  Validation (see below — a new banner-removal spec, plus widening the existing live-data invariant
  specs).

## Implementation

- [x] 1. `backend/scripts/audit_rule_card_examples.py` — new read-only script implementing
      Invariant 2's check (requirement 8), modeled on `audit_case_rule_coverage.py`.
- [x] 2. Case 2 (Kilmininkas Vns. / Genitive singular) — rewrite `grammar_case_rule` row (fixes the
      `brolio` leak) and audit/fix its live sentences; update seed/article only if applicable.
- [x] 3. Case 3 (Naudininkas Vns. / Dative singular) — already invariant-1-guarded; re-review for
      invariant 2/3 and sentence-level nonsense; rewrite if anything is short of the bar.
- [x] 4. Case 4 (Galininkas Vns. / Accusative singular) — rewrite rule card + audit sentences.
- [x] 5. Case 5 (Įnagininkas Vns. / Instrumental singular) — rewrite rule card (fixes the
      `sūnumi`/`profesoriumi`/`seserimi`/`dukterimi` leak) + audit sentences.
- [x] 6. Case 6 (Vietininkas Vns. / Locative singular) — rewrite rule card (fixes the
      `name`/`kambaryje`/`muziejuje`/`gatvėje` leak; re-verify the existing `maišelis` swap from
      issue #162 still holds) + audit sentences for plausibility.
- [x] 7. Case 7 (Šauksmininkas Vns. / Vocative singular) — this is the reference-quality card; light
      review pass only (confirm it still meets the bar; leave as-is unless an issue is found).
- [x] 8. Case 8 (Vardininkas Dgs. / Nominative plural) — rewrite rule card (fixes the
      `broliai`/`knygos`/`muziejai` leak) + audit sentences.
- [x] 9. Case 9 (Kilmininkas Dgs. / Genitive plural) — rewrite rule card (fixes the
      `namų`/`brolių`/`knygų` leak; note this case is also invariant-1-deferred) + audit sentences.
- [x] 10. Case 10 (Naudininkas Dgs. / Dative plural) — rewrite rule card (fixes the
       `broliams`/`sūnums` leak) + audit sentences.
- [x] 11. Case 11 (Galininkas Dgs. / Accusative plural) — rewrite rule card (fixes the
       `brolius`/`knygas`/`sūnus` leak) + audit sentences.
- [x] 12. Case 12 (Įnagininkas Dgs. / Instrumental plural) — rewrite rule card (fixes the
       `broliais`/`knygomis`/`sūnumis` leak) + audit sentences.
- [x] 13. Case 13 (Vietininkas Dgs. / Locative plural) — rewrite rule card (fixes the
       `namuose`/`gatvėse` leak; re-verify the issue #162 `maišeliuose` swap still holds) + audit
       sentences for plausibility.
- [x] 14. Numbers case 15 (Skaičiai: Vardininkas / cardinal "how many") — rewrite rule card + audit
       sentences; update `backend/scripts/seed_numbers_grammar.py`.
- [x] 15. Numbers case 16 (Skaičiai: Galininkas / "I have") — same treatment.
- [x] 16. Numbers case 17 (Ordinal Įnagininkas / "which bus") — same treatment.
- [x] 17. Numbers case 18 (Ordinal Vietininkas / floor, room) — same treatment.
- [x] 18. Numbers case 19 (Time-telling Galininkas) — same treatment.
- [x] 19. Numbers case 20 (Collective numerals / age) — same treatment.
- [x] 20. `backend/data/grammar/verb_lessons.json` — rewrite all 6 `tense_hints` entries
       (`indicative_present`, `indicative_past_simple`, `indicative_past_habitual`,
       `indicative_future`, `conditional`, `imperative`) for clarity/completeness. Code-only change,
       no DB write.
- [x] 21. `backend/scripts/audit_case_rule_coverage.py` — widen `GUARDED_CASES` to include every
       case fixed above (2, 4, 6, 8, 9, 13 at minimum), shrink `DEFERRED_CASES` correspondingly.
       Widen the matching set in the live-data frontend spec(s) (requirement 10).
- [x] 22. Remove `QuotaBanner` app-wide (requirement 11): both render sites, delete the component
       file if orphaned.
- [x] 23. `documentation/grammar-sentence-data-integrity.md` — update the Invariant-2 debt table
       (mark resolved cases) and document the new `audit_rule_card_examples.py` script next to
       `audit_case_rule_coverage.py`'s existing writeup.
- [x] 24. `documentation/CHANGELOG.md` — append entry `#9` summarizing this pass.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q`
- [x] `backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py` (from repo root — the
      script's own documented invocation; the earlier `cd backend && .venv/bin/python
      backend/scripts/...` form pointed at a non-existent `backend/backend/`) — must exit 0
      with the widened `GUARDED_CASES` covering all cases fixed in this pass.
- [x] `backend/.venv/bin/python backend/scripts/audit_rule_card_examples.py` (from repo root, same
      correction) — must exit 0 (no example/answer overlap) across case_index 2–13 and 15–20.
- [x] Playwright: widened `frontend/tests/issue-158-instrumental-iv-v-declension.spec.ts` /
      `issue-159-dative-vocative-us-stem.spec.ts` pass with the larger guarded-case set.
- [x] New Playwright spec asserting `[data-testid="quota-banner"]` is absent on `/dashboard/lists`
      and `/dashboard/phrases`.
- [x] `frontend/tests/design-system-parity.spec.ts` passes (Lists/Phrases are shared-shell pages).
- [x] Full suite: `cd frontend && npx playwright test --reporter=list` (not just the curated list
      above — the doc's own history shows a curated list has missed a sibling spec before).
      Status: **492 passed / 0 failed** (exit 0), plus `cd frontend && npx tsc --noEmit` exit 0.
      Getting there took two rounds. Round 1 (484 passed / 7 failed) fixed the three failures this
      plan actually caused — `quota.spec.ts` "shows session counter for basic user" + "shows limit
      reached banner when sessions exhausted" (deleted: they assert the banner plan #9 removed;
      absence is now covered by `quota-banner-removed.spec.ts`) and `continue-session.spec.ts`
      "charges exactly one daily session…" (now reads `sessions_today` from `/api/me/quota`
      instead of off the removed banner). Round 2 fixed the 7 pre-existing failures, all stale
      specs left behind by the redesign rather than by this plan:
      `stats-card-alignment.spec.ts` ×2 and `quota.spec.ts` "premium badge shown with expiry
      date" — the redesign moved the premium indicator into the shared header, so
      `components/Header.tsx` now carries `data-testid="premium-badge"` (testid only; no markup
      or style change) and those specs assert it instead of the removed `premium-banner` /
      `'✦ Premium'`; `stats-card-alignment.spec.ts`'s "free-tier quota banner matches words page
      styling" was deleted (that banner is gone app-wide — parity is now an absence check in
      `quota-banner-removed.spec.ts`). `news.spec.ts` "global EN toggle" now clicks
      `getByTestId('lang-toggle')` rather than a `RU / EN` role-name regex, since
      `design-system-parity.spec.ts` requires the toggle stay a slash-free segmented pill.
      `phrase-lists.spec.ts` "English UI shows English labels" asserts the star-level badge
      (`list-star-badge`) + localized `"1 / 3 learned"` progress text instead of the removed
      `Easy` difficulty badge. `issue-117-…`'s list-detail test was **not** a missing-data
      problem: the RU/EN toggle calls `window.location.reload()`, so the spec's fixed 300 ms wait
      raced the reload and read a blank page. It now presets `fluent_lang` via `addInitScript`
      (the pattern in `list-title-localization.spec.ts`). It was also vacuous — every row in the
      live `word` table has both translations, so live data can never reach the
      `translation_en || translation_ru` branch — so it is split into a mocked test that really
      exercises the fallback plus a live-data smoke test that EN renders no empty cells.
      `lists-progress-parallel.spec.ts` now does a relative `page.goto('/dashboard/lists/')`
      against the configured `baseURL` instead of hardcoding `http://localhost:3000`; the backend
      serves that path with no redirect, so the stale "redirect drops the path" comment it cited
      no longer applies and no `next dev` is needed.
- [ ] Manual smoke: log in locally, open `/dashboard/grammar/programs`, start at least one lesson
      per program (Cases, Numbers, Verb Conjugation) at `basic` level, confirm the rule card text
      renders, reads clearly, and none of its example words are the graded answer shown on a wrong
      guess.
- [ ] News post written and published via `/news-writer`.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py   # from repo root
backend/.venv/bin/python backend/scripts/audit_rule_card_examples.py   # from repo root
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
