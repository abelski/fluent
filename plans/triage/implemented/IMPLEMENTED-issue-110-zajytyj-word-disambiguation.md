# Issue #110 — /dashboard/lists/158/study

**Reported:** 2026-06-01 15:01:45
**Status:** open
**Description:** užsiėmęs / BŪDVARDIS / занятый — есть несколько слов которые переводятся как занятый например uzimtas и было бы хорошо их разделять как-то

## Root cause

There are 4 `word` rows in the DB with identical `translation_ru = 'занятый'`:

| id   | lithuanian  | translation_ru |
|------|-------------|----------------|
| 4106 | užimtas     | занятый        |
| 5328 | užimtas     | занятый        |
| 4477 | užsiėmęs    | занятый        |
| 5342 | užsiėmęs    | занятый        |

These two words are linguistically distinct:
- `užimtas` — occupied/taken (of a space, seat, or person's time)
- `užsiėmęs` — busy/engaged (actively doing something)

When both appear in the same study session, the user sees two different Lithuanian words with the same Russian translation and cannot tell them apart on flashcards or in MCQ options.

The frontend `pickDistractors` in `QuizSession.tsx` does filter by `translation_ru` so they won't appear as each other's distractor options — but the core confusion persists on flashcards where both show as "занятый" with no disambiguation.

## Fix plan

1. **Data fix (primary)** — Update `translation_ru` for all 4 affected word rows to add parenthetical disambiguation:
   - `užimtas` (ids 4106, 5328): `занятый (занято место/место занято)` — the occupancy/taken sense
   - `užsiėmęs` (ids 4477, 5342): `занятый (делом, чем-то занят)` — the actively-busy sense

   Run the SQL:
   ```sql
   UPDATE word SET translation_ru = 'занятый (место занято)' WHERE id IN (4106, 5328);
   UPDATE word SET translation_ru = 'занятый (делом)' WHERE id IN (4477, 5342);
   ```

2. **Backend defensive guard (secondary)** — In `backend/routers/words.py`, inside `get_study_words`, after building `session_words`, detect words within the same session that share `translation_ru` and append the Lithuanian word in parentheses as a runtime disambiguator. This prevents recurrence if future data entry creates similar duplicate-translation words:

   ```python
   from collections import Counter
   ru_counts = Counter(w["translation_ru"] for w in session_words if w.get("translation_ru"))
   for w in session_words:
       if w.get("translation_ru") and ru_counts[w["translation_ru"]] > 1:
           w["translation_ru"] = f"{w['translation_ru']} ({w['lithuanian']})"
   ```

3. **Optional frontend guard** — In `frontend/app/dashboard/components/QuizSession.tsx`, update `pickDistractors` to also filter by `translation_en` in addition to `translation_ru`, for parity when English UI is used.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #110 — Multiple words translate to занятый (užimtas / užsiėmęs) with no disambiguation. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 110;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-110-zajytyj-word-disambiguation.md` → `plans/triage/implemented/IMPLEMENTED-issue-110-zajytyj-word-disambiguation.md`).
