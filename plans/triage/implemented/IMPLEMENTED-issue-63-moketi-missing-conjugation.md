# Issue #63 — /dashboard/lists/206/study

**Reported:** 2026-05-08 09:19:02
**Status:** open
**Description:**
```
mokėti - mokėti

veiksmažodis - но похоже оно написано с ошибкой

уметь, знать
```

## Root cause

Pure data quality issue — no code changes needed.

Word ID 5668 in list 206 has `lithuanian = "mokėti"` (bare infinitive only) instead of
`"mokėti, moka, mokėjo"` (infinitive + present 3rd person + past 3rd person).

`QuizSession.tsx` lines 631–633 call `parseForms(word.lithuanian)` and split on `,`/`/`.
When only one form exists, `cloveIsCloze = false` and Stage 3 degrades to plain type-it
recall. The user sees "mokėti" at the top of the card and "mokėti" as the only expected
answer, making the entry feel like a duplicate/loop.

Note: "veiksmažodis" (Lithuanian for "verb") in the hint is correctly spelled — the user
was unfamiliar with the Lithuanian grammar term.

All 20 verbs in list 206 are stored as bare infinitives (systemic gap), but the report
targets word 5668.

## Fix plan

1. Update word 5668 in the DB to include conjugation forms:
   ```sql
   UPDATE word
   SET lithuanian = 'mokėti, moka, mokėjo'
   WHERE id = 5668;
   ```
2. (Optional but recommended) Update all verbs in list 206 similarly. The full list with
   verified conjugations (check against list 116/117 reference entries or a Lithuanian
   dictionary):

   | Word ID | Current        | Correct                           |
   |---------|----------------|-----------------------------------|
   | 5668    | mokėti         | mokėti, moka, mokėjo              |
   | 5698    | pailsėti       | pailsėti, pailsi, pailsėjo        |
   | 5662    | mėgti          | mėgti, mėgsta, mėgo               |
   | 5794    | veikti         | veikti, veikia, veikė             |
   | 5656    | klausyti       | klausyti, klauso, klausė          |
   | 5414    | šokti          | šokti, šoka, šoko                 |
   | 5393    | dainuoti       | dainuoti, dainuoja, dainavo       |
   | 5396    | groti          | groti, groja, grojo               |
   | 5800    | žaisti         | žaisti, žaidžia, žaidė            |
   | 5411    | sportuoti      | sportuoti, sportuoja, sportavo    |
   | 5404    | plaukioti      | plaukioti, plaukioja, plaukiojo   |
   | 5390    | bėgioti        | bėgioti, bėgioja, bėgiojo         |
   | 5407    | slidinėti      | slidinėti, slidinėja, slidinėjo   |
   | 5570    | važinėti       | važinėti, važinėja, važinėjo      |
   | 5806    | žiūrėti        | žiūrėti, žiūri, žiūrėjo           |
   | 5554    | keliauti       | keliauti, keliauja, keliavo       |
   | 5563    | skristi        | skristi, skrenda, skrido          |
   | 5621    | grįžti         | grįžti, grįžta, grįžo             |
   | 5399    | grybauti       | grybauti, grybėja, grybauja (verify) |
   | 5418    | žvejoti        | žvejoti, žvejoja, žvejojo         |

   Word 4261 ("eiti pasivaikščioti") is a phrase — leave as-is.

3. Alternatively, use the Admin UI: navigate to `/dashboard/admin` → Lists → list 206,
   click the edit icon on "mokėti", update the Lithuanian field from `"mokėti"` to
   `"mokėti, moka, mokėjo"`, and save.

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #63 — mokėti missing conjugation forms in list 206. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 63;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix
   (e.g. `issue-63-moketi-missing-conjugation.md` → `plans/triage/implemented/IMPLEMENTED-issue-63-moketi-missing-conjugation.md`).
