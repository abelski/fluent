---
kind: feature
status: approved
iteration: 0
max_iterations: 24
suggested_model: sonnet
suggested_effort: medium
confirmed_model: null
confirmed_effort: null
---

# #48a — English coverage, part 1: UI strings, backend labels, leak guard

## Context

Idea: `plans/ideas/idea_48_full-english-coverage.md`. This is part 1 of 3 (48a UI strings → 48b DB
content → 48c EN SEO). Each part has its own branch and is merged in order. This part touches no
DB schema and no SEO. On its own it fixes the reported leaks on `/dashboard/practice/1`.

In EN mode, users see Russian from four sources in code:

1. **Hardcoded RU in the frontend:** 216 Cyrillic hits in 47 `.tsx` files. Some are fine:
   comments, RU SEO `metadata` in `layout.tsx`, and correct `lang === 'en' ? … : '…'` branches.
   The leaks are concentrated in:
   - `dashboard/programs/new`, `programs/[id]/edit`, `programs/page.tsx`, `programs/custom/[token]`
   - `dashboard/lists/page.tsx`
   - `practice/[id]/page.tsx` («Завершить», «Перейти к тесту», «для сдачи», «Текст»,
     «Пройден/Не пройден», «Разбор ответов», «Следующий тест»)
   - the hand-rolled RU plural at `practice/page.tsx:129`

   On top of that, `app/dashboard/admin/page.tsx` has 18 `'ru-RU'` date locales that render
   Russian month names. The i18n system is `frontend/lib/useT.ts` (`tr`, `plural`, `lang`) over
   `frontend/lib/i18n/{types,ru,en}.ts`. `LandingClient.tsx:100` is the precedent for a locale
   picked by `lang`.
2. **RU labels served by the backend:**
   - `_TENSE_LABELS` (`backend/grammar_service.py:55-62`), plus the verb-lesson titles in
     `backend/data/grammar/verb_lessons.json`. Every title equals its tense label, except
     «Управление глаголов».
   - `tense_hints` in `verb_lessons.json`. Both the `description` and the row labels *and values*
     are Russian («aš (я)», «тип -o», «(I, II)»). They are served as `hint` by `get_verb_lessons()`
     (`grammar_service.py:~455`).
   - `prompt_ru` (`grammar_service.py:~314`), from the last column of `backend/data/grammar/words.txt`
     (72 nouns), via `_word_ru()` (`:283-285`, which reads `word_entry[-1]`), rendered at
     `GrammarTaskRunner.tsx:~405`. Declension tasks are only a fallback, used when a case has no
     sentences (`:371-373`), so keep the effort small.
   - The default custom-program set title `f"Набор {pos + 1}"` (`routers/custom_programs.py:232`),
     which is stored in the DB.
3. **Fixed-vocabulary RU in `word.hint`:** 361 words, with the values «глагол» ×356, «разг.»,
   «ед.ч.», «мн.ч.», «где?» and «plurale tantum — только во мн.ч.». They are rendered at
   `QuizSession.tsx:1134,1160`, `lists/[id]/page.tsx:134` and `dashboard/vocabulary/page.tsx:205`.
   `verb_lookup.py:293` already maps глагол→verb.

**Model:** sonnet/medium. This is a mechanical, well-patterned sweep, and the static guard makes
any leak cheap to find.

## Goals
- With the UI in EN, no hardcoded Russian shows on any page, admin included.
- Dates and numbers follow the UI language.
- Backend-served grammar labels, hints and prompts have EN versions.
- A static guard fails the moment a hardcoded RU string or a `'ru-RU'` literal comes back.

## Non-Goals
- DB content translations (practice, grammar and word-list descriptions): that's 48b.
- EN SEO routes: that's 48c.
- Email and Telegram texts.

## Requirements
1. Every user-visible RU literal in `frontend/app/**`, `frontend/components/**` and
   `frontend/lib/*.ts` moves into `lib/i18n` (added to `types.ts`, with RU and EN values).
   Correctly-branched `lang === 'en' ? … : '…'` lines also move into the dictionary, so there is
   one pattern. Plurals go through `plural()`. Date and number locales follow `lang`
   (`'ru-RU'` / `'en-GB'`).
2. Allowed Cyrillic left in source: comments, `metadata` / `generateMetadata` blocks in
   `layout.tsx` / `page.tsx` (RU SEO, deliberately unchanged), and `lib/i18n/ru.ts`. Anything
   else needs an inline `// i18n-allow` marker with a reason.
3. Backend:
   - One `_TENSE_LABELS_EN` dict keyed by `tense_key` (plus an entry for `case_governance`,
     «Verb government») backs `tense_label_en` and the verb-lesson `title_en`. No rows in
     `verb_lessons.json` are edited.
   - An EN twin `tense_hints_en` in `verb_lessons.json`, covering whole rows (labels and
     values), backs `hint_en`.
   - `words.txt` gets an EN column placed **before** the RU one (or `_word_ru()` gets an explicit
     index). `prompt_en` is served.
   - The frontend keeps grouping lessons by the RU `title` / `tense_key`
     (`grammar/page.tsx:445`) and only *displays* `title_en`.
4. `word.hint`: a frontend map from the 6 known RU hint values to EN, applied at the 4 render
   sites. Unknown values pass through unchanged.
5. The «Набор N» default: the frontend shows the stored title matching `^Набор (\d+)$` as
   `tr.…setN`. The backend default stays as it is, because existing rows already hold it.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. This plan only changes copy; EN strings must fit at 375px. Copy changes touch all 5 top-nav pages, so parity runs here.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation
- [ ] 1. Baseline: on the branch start, run the full Playwright suite (:8000, `DEV=false`, fresh `npm run build`) and save the list of failing specs to `temp_files/screenshots/plan_48a_en-ui-strings/baseline-failures.txt`.
- [ ] 2. `frontend/tests/no-hardcoded-russian.spec.ts` — a static guard, written first so it fails on the current code. It reads every `.ts`/`.tsx` under `app`, `components` and `lib` (skipping `lib/i18n/ru.ts`), strips comments, allows `metadata`/`generateMetadata` blocks and `// i18n-allow` lines, and fails on `[А-Яа-яЁё]` or `'ru-RU'`, listing `file:line`. It runs without a browser page or a server.
- [ ] 3. `frontend/lib/i18n/{types,ru,en}.ts` — add keys for every leak the guard lists, grouped under the existing sections, with plurals as `PluralForms`.
- [ ] 4. Replace the leaks file by file until the guard passes. Start with `practice/[id]`, `practice/page.tsx`, the programs pages, `dashboard/lists`, the phrases pages, `QuizSession`, `PhraseSession`, `WelcomeModal`, `Header`, `pricing`, `LandingClient`, then admin (date locales included).
- [ ] 5. `word.hint` map and «Набор N» display (Requirements 4–5).
- [ ] 6. `backend/grammar_service.py`, `backend/data/grammar/verb_lessons.json`, `backend/data/grammar/words.txt` — `tense_label_en`, `title_en`, `hint_en`, `prompt_en` (Requirement 3). Update the header comment in `words.txt`, and update `backend/tests/test_issue_156_dukterimi_instrumental.py:46-54` for the new field count. Frontend consumers (`GrammarTaskRunner.tsx`, `dashboard/grammar/page.tsx`) pick by `lang`.
- [ ] 7. `backend/tests/test_en_labels.py` — the verb-lesson and task endpoints return non-empty `title_en` / `tense_label_en` / `hint_en` / `prompt_en`, with no Cyrillic in any of them.
- [ ] 8. `frontend/tests/en-smoke.spec.ts` — the EN render smoke, with mocked APIs and `fluent_lang='en'`. It checks that `document.body.innerText` has no Cyrillic on:
  - the practice result page: a failed result, then the review
  - the grammar sentence runner, with the rule card and hint
  - the admin users tab, with dates

  This catches plural and locale wiring that the static guard can't.
- [ ] 9. `frontend/tests/plan48a-screenshots.spec.ts` — writes RU and EN × 1280 and 375 shots into `temp_files/screenshots/plan_48a_en-ui-strings/` for:
  - the practice intro, question, answered state, result (passed and failed), and empty category
  - `programs/new`
  - `dashboard/lists`
  - the grammar runner
  - the admin users tab

  Mock `/api/billing/config` → `{enabled:true}` wherever premium UI shows.

## Validation
- [ ] Guard: `cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts --reporter=list`
- [ ] Smoke: `cd frontend && npx playwright test tests/en-smoke.spec.ts --reporter=list`
- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [ ] Screenshots: `cd frontend && npx playwright test tests/plan48a-screenshots.spec.ts --reporter=list`, then look at every shot and say what it shows *(the looking is manual)*
- [ ] Full suite: `cd frontend && npx playwright test --reporter=list` shows no new failures vs `baseline-failures.txt`

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts tests/en-smoke.spec.ts tests/design-system-parity.spec.ts tests/plan48a-screenshots.spec.ts --reporter=list
```

User-facing checks: **both languages (RU + EN)**, **mobile at 375px**, **screenshots proving each**
in `temp_files/screenshots/plan_48a_en-ui-strings/`. The full suite shows no new failures vs the
baseline.

## Notes
