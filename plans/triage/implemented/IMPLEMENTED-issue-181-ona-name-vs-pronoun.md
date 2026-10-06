---
kind: bugfix
status: done
iteration: 1
max_iterations: 16
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #181 — /dashboard/grammar/

**Reported:** 2026-10-05 11:49:05
**Status:** open
**Description:** Ona ? Arbo ji

## Root cause
The user reads "Ona" as a mistake for the pronoun "ji" (she). "Ona" is a recurring character name
(like "Jonas"), but in the Russian hints it becomes "Она …", which reads as the Russian pronoun
"она" (she). Same complaint as #60 (on hold, `plans/triage/hold/issue-60-ona-grammar-translation-inconsistency.md`).

The #60 fix added `grammar.charactersNote` only to the overview card
(`frontend/app/dashboard/components/GrammarOverview.tsx:151`). The hint the user sees during an
exercise is rendered in `frontend/app/dashboard/components/GrammarTaskRunner.tsx:463` and comes from
`grammar_sentence.russian` via `_generate_sentence_tasks` (`backend/grammar_service.py:386`) for
every level. So people doing exercises never see the note.

**Decision (user, 2026-10-05): rename the character Ona → Rūta.** "Рута" has no pronoun twin in
Russian, so the ambiguity goes away at the source. We rejected marking the name with
"Она (имя) …": it treats the symptom and leaves an awkward hint. Rūta is a common Lithuanian name,
and in these sentences it is only used in the nominative, so the gap endings (`answer_ending`,
`full_word`) don't change.

Affected rows (prod, verified 2026-10-05; a whole-DB scan of content text columns found Ona only
in these 4 rows, in `display` and `english`):

| id | display (now → new) | russian (now → new) | english (now → new) |
|----|---------------------|---------------------|---------------------|
| 104 | Ona neturi knyg___. → Rūta neturi knyg___. | У Оны нет книги. → У Руты нет книги. | Ona doesn't have a book. → Rūta doesn't have a book. |
| 29 | Ona perka spurg___. → Rūta perka spurg___. | Она покупает пончик. → Рута покупает пончик. | Ona is buying a donut. → Rūta is buying a donut. |
| 113 | Ona atėjo su obuol___. → Rūta atėjo su obuol___. | Она пришла с яблоками. → Рута пришла с яблоками. | Ona came with apples. → Rūta came with apples. |
| 131 | Ona dirba su aktor___. → Rūta dirba su aktor___. | Она работает с актёром. → Рута работает с актёром. | Ona works with an actor. → Rūta works with an actor. |

Ids stay the same, so user progress keyed by sentence id is unaffected. Grammar sentences have no
TTS audio (`audio_clip` is per word), so nothing needs re-synthesizing.

Suggested haiku/low: string edits in DB + seed JSON + 2 i18n lines, one guard test, one spec
scenario; no code paths change.

## Spec impact
`specs/grammar.md` — **New** scenario:

```gherkin
Scenario: recurring characters have names that can't be read as pronouns
  Given the grammar exercises use recurring characters Jonas and Rūta
  When a sentence task about Rūta is shown in RU mode (e.g. "Rūta perka spurg___.")
  Then its Russian hint names her "Рута" (e.g. "Рута покупает пончик.")
  And no grammar_sentence uses the name "Ona", whose Russian form "Она" reads as the pronoun "she"
  And the grammar overview note names the characters "Йонас и Рута" (RU) / "Jonas and Rūta" (EN)
```

## Fix plan
- [x] 1. In `backend/data/en_content/grammar_sentences.json`, change `display`, `russian` and `english` for the 4 rows above (lines ~112, ~322, ~436, ~1090). Required: `backend/scripts/apply_en_content.py` matches rows by (case_index, display, russian) and aborts the whole run on a key that matches nothing, so JSON and DB must change together.
- [x] 2. In `frontend/lib/i18n/ru.ts:220` and `frontend/lib/i18n/en.ts:220`, change `charactersNote` to "В упражнениях используются персонажи Йонас и Рута." / "Exercises use two recurring characters, Jonas and Rūta."
- [x] 3. Add a guard test in `backend/tests/test_en_content.py`: load the JSON and fail if any `display` or `english` contains the word "Ona", or any `russian` contains "Ону"/"Оны" or starts with "Она ". Run `cd backend && .venv/bin/python -m pytest tests/test_en_content.py -q`.
- [x] 4. Add the scenario above to `specs/grammar.md`.
- [x] 5. (applied 2026-10-05, user-approved, 4/4 rows, 0 leftovers) Prepare the prod data change (do NOT run without user approval — prod write). Preferred: admin PATCH `/api/admin/grammar/sentences/{id}` (`backend/routers/admin.py:1114`, invalidates the `grammar_sentence` cache tag). Fallback SQL (the cache picks it up after `DEFAULT_TTL = 600` s or a restart):
  ```sql
  UPDATE grammar_sentence SET display='Rūta neturi knyg___.', russian='У Руты нет книги.', english='Rūta doesn''t have a book.' WHERE id=104 AND display='Ona neturi knyg___.';
  UPDATE grammar_sentence SET display='Rūta perka spurg___.', russian='Рута покупает пончик.', english='Rūta is buying a donut.' WHERE id=29 AND display='Ona perka spurg___.';
  UPDATE grammar_sentence SET display='Rūta atėjo su obuol___.', russian='Рута пришла с яблоками.', english='Rūta came with apples.' WHERE id=113 AND display='Ona atėjo su obuol___.';
  UPDATE grammar_sentence SET display='Rūta dirba su aktor___.', russian='Рута работает с актёром.', english='Rūta works with an actor.' WHERE id=131 AND display='Ona dirba su aktor___.';
  -- verify, expect 0 rows:
  SELECT id FROM grammar_sentence WHERE display ~ '\mOna\M' OR english ~ '\mOna\M' OR russian ~ '^Она ';
  ```
- [x] 6. No component changes; `charactersNote` stays on the overview.

## Tests
- [x] Write a Playwright test `frontend/tests/issue-181-ruta-character.spec.ts` (mock pattern from `grammar-draugo-base-form.spec.ts`: route `**/api/grammar-programs`, `**/api/grammar/lessons`, `**/api/grammar/lessons/1/tasks` returning one `sentence` task, display "Rūta perka spurg___.", `translation_ru` "Рута покупает пончик."). Assert the hint text in RU, and the overview note text in RU ("Йонас и Рута") and EN ("Jonas and Rūта"). Screenshots of the exercise and overview, RU + EN, at 1280px and 375px into `temp_files/screenshots/issue-181-ruta-character/`.
- [x] Run it: `cd frontend && npx playwright test tests/issue-181-ruta-character.spec.ts --reporter=list`

## Review
- [x] Code review passed (round 2)
- note: guard only catches a leading bare "Она " in russian; acceptable for this fix.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

- RU + EN both checked (screenshots).
- Mobile 375px checked (screenshots).
- Screenshots in `temp_files/screenshots/issue-181-ruta-character/`, looked at and described.

## Confirm resolution
Ask the user: "Issue #181 — Ona ? Arbo ji. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 181;` and report success.
   Also offer to resolve #60 (same root cause): `UPDATE mistake_report SET status = 'resolved' WHERE id = 60;` and move
   `plans/triage/hold/issue-60-ona-grammar-translation-inconsistency.md` → `plans/triage/implemented/IMPLEMENTED-issue-60-ona-grammar-translation-inconsistency.md`.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-181-ona-name-vs-pronoun.md` → `plans/triage/implemented/IMPLEMENTED-issue-181-ona-name-vs-pronoun.md`).
