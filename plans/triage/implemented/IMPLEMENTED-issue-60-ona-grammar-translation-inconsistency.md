# Issue #60 — /dashboard/grammar/

**Reported:** 2026-04-21 11:09:03
**Status:** open
**Description:** Ona - она

## Root cause

Content inconsistency in the `grammar_sentence` table. Lithuanian grammar exercises use "Jonas" and "Ona" as character names (like textbook characters). "Jonas" is consistently translated as the name "Йонас" in all Russian hints. "Ona" however appears inconsistently:

- In 3 sentences (ids 29, 113, 131) the subject "Ona" is translated as "Она" in the Russian hint — this looks like the Russian pronoun "она" (she) rather than the name "Ona"
- In sentence id=104 "Ona neturi knyg___", the Russian hint is "У Оны нет книги." — here "Оны" is the genitive declension of the **name** "Ona"

The user sees "Она" in several exercises and "Оны" in one, and perceives this as an error (either the three pronoun-looking forms or the genitive form appears wrong).

The grammar hint is displayed directly as visible text while the user fills in the blank (`translation_ru` rendered at line ~755 in `frontend/app/dashboard/grammar/page.tsx`), making the inconsistency immediately visible.

All four sentences are linguistically correct in isolation. The problem is inconsistency of presentation: "Ona" as a name should be treated uniformly across all sentences, the same way "Jonas → Йонас" is consistent throughout.

## Fix plan

### Step 1 — Audit all Ona/Jonas grammar sentences
```sql
SELECT id, display, russian, case_index
FROM grammar_sentence
WHERE (display LIKE 'Ona %' OR display LIKE '% Ona %')
  AND archived = false
ORDER BY case_index, id;
```

Current state of all "Ona" sentences:
| id | Lithuanian | Russian hint | Case |
|----|-----------|--------------|------|
| 104 | Ona neturi knyg___. | У Оны нет книги. | 2 (Genitive) |
| 29 | Ona perka spurg___. | Она покупает пончик. | 4 (Accusative) |
| 113 | Ona atėjo su obuol___. | Она пришла с яблоками. | 12 (Instr. plural) |
| 131 | Ona dirba su aktor___. | Она работает с актёром. | 5 (Instrumental) |

### Step 2 — Standardize: treat "Ona" as a name in all Russian translations

In nominative sentences (ids 29, 113, 131), "Она" is already the correct nominative form of both the name and the pronoun, so no SQL change is needed for those three sentences.

For sentence id=104, the existing translation "У Оны нет книги." is actually correct (genitive of the name "Ona"). However, cross-check the full_word:

```sql
SELECT id, display, full_word, russian FROM grammar_sentence WHERE id = 104;
-- full_word = 'knygos' (genitive singular) → 'книги' (singular) is correct
```

The data is linguistically consistent. The perceived inconsistency is that nominative "Она" looks like a pronoun, while genitive "Оны" unmistakably looks like a name.

### Step 3 — No SQL changes needed (data is correct)
The content is correct. The issue is that Russian learners don't know "Ona" is a Lithuanian name. Consider one of:

**Option A (minimal):** No change — accept that nominative "Она" is ambiguous and the genitive "Оны" teaches the declension correctly.

**Option B (clearer UX):** Add a note to the grammar page header explaining that Jonas and Ona are character names used in sentences. This requires a frontend change in `frontend/app/dashboard/grammar/page.tsx`.

**Option C (alternative data fix):** Replace "Она/Оны/etc." with "Она (имя)" style notes only where confusion is likely — but this is heavy-handed.

Recommended: **Option B** — add a single sentence to the grammar page intro: "В упражнениях используются персонажи Йонас и Она."

### Step 4 — Frontend change (if Option B chosen)
In `frontend/app/dashboard/grammar/page.tsx`, locate the lesson intro/header section and add the explanatory note near the lesson title.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the grammar page and verifies the lesson intro is visible.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #60 — grammar exercises use 'Ona' as a character name, causing confusion when Russian shows 'Оны' (name genitive) vs 'Она' (looks like pronoun). Data is correct; recommended fix is to add a note 'В упражнениях используются персонажи Йонас и Она.' to the grammar page. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 60;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
