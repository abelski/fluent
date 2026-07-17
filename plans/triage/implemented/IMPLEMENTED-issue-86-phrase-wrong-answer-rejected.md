# Issue #86 — /dashboard/phrases/12/study

**Reported:** 2026-05-19 20:29:35
**Status:** open
**Description:** "Вы написали: Reika navaziuoti devinuolikta troleibus_y. Правильно: Važiuok devynioliktu troleibusу. Это непонятно как получилось? То что я ввожу вполне валидно"
(User typed a valid alternative phrase but it was rejected; the app showed only the stored answer as correct.)

## Root cause

Two bugs in `PhraseSession.tsx`'s `normalizeLt` function compound to make answer checking overly strict:

1. **Missing `ų` → `u` mapping** — `ų` is the only Lithuanian special char not handled (QuizSession.tsx has it correctly).
2. **Destructive `uo` → `u` collapse** — `važiuok` becomes `vaziuk`, `važiuoti` becomes `vaziuti`, destroying structural information before Levenshtein comparison. This makes comparing alternative phrases even harder.

Additionally, **no alternative accepted answers** are supported. The phrase (id=399, program=12): `"Važiuok devynioliktu troleibusу."` (imperative) has no room for the user's valid alternative `"Reikia važiuoti devynioliktu troleibusу."` (modal + infinitive). Even with a fixed normalization, these differ by 9+ edit-distance characters — above the fuzzy threshold.

## Fix plan

1. **`frontend/app/dashboard/components/PhraseSession.tsx` (lines 37–43)** — fix `normalizeLt`:
   - Remove `.replace(/uo/g, 'u')` (destructive diphthong collapse)
   - Add `.replace(/ų/g, 'u')` (missing mapping)
   - Result matches QuizSession.tsx normalization exactly

2. **`backend/models.py`** — add `alt_texts: Optional[str] = None` to `Phrase` model (pipe-separated alternative accepted answers)

3. **DB migration** — `ALTER TABLE phrase ADD COLUMN alt_texts TEXT;`

4. **`backend/routers/phrases.py`** — expose `alt_texts` in study/review session responses; add to admin CRUD Pydantic models and handlers

5. **`frontend/app/dashboard/components/PhraseSession.tsx`** — update `checkPhrase()` to split `phrase.alt_texts` on `|` and accept any matching alternative

6. **Admin UI** — add optional "Alternative answers (pipe-separated)" text input to phrase editor

7. **Data fix** — set `alt_texts = "Reikia važiuoti devynioliktu troleibusу."` for phrase id=399

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #86 — phrase answer rejected despite valid alternative. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 86;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
