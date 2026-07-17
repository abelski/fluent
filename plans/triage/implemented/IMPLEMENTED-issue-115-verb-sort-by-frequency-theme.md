# Issue #115 — /programs/verbs_365

**Reported:** 2026-06-03 11:53:46
**Status:** open
**Description:** Лучше использовать сортировку глаголов не по алфавиту а по употребимости и каким-то темам. (Better to sort verbs not alphabetically but by usage frequency and themes.)

## Root cause

The `verbs_365` program is seeded by `backend/scripts/seed_verbs_vocabulary.py`, which fetches verbs ordered by `Verb.number`. The `number` field is the book sequence number (1–365), where the textbook arranges verbs alphabetically by Lithuanian infinitive. This produces 37 groups of 10 named "Глаголы 1–10", "Глаголы 11–20", etc. — purely alphabetical grouping.

The `Verb` model has no `freq_rank` or `theme` columns — there is no data to sort by frequency or topic.

## Fix plan

1. **Add `freq_rank` and `theme` columns to the `Verb` model** in `backend/models.py`:
   ```python
   freq_rank: Optional[int] = Field(default=None)  # 1 = most common
   theme: Optional[str] = Field(default=None)       # e.g. "essential", "motion", "communication"
   ```

2. **Create an Alembic migration** in `backend/migrations/versions/` adding nullable `freq_rank INTEGER` and `theme VARCHAR` columns to the `verb` table.

3. **Create `backend/scripts/verb_themes.json`** — a JSON file mapping verb `number` → `{freq_rank, theme}`. Suggested themes:
   - `essential` — ~30 core verbs (būti, turėti, galėti, etc.)
   - `communication` — ~40 verbs (kalbėti, klausti, atsakyti, etc.)
   - `motion` — ~35 verbs (eiti, važiuoti, grįžti, etc.)
   - `daily_life` — ~50 verbs (valgyti, gerti, miegoti, dirbti, etc.)
   - `cognition` — ~30 verbs (manyti, žinoti, prisiminti, etc.)
   - `social` — ~40 verbs (susitikti, padėti, duoti, imti, etc.)
   - `state_change` — ~30 verbs (tapti, keistis, pradėti, baigti, etc.)
   - `other` — remaining verbs

4. **Create `backend/scripts/seed_verb_themes.py`** — reads the JSON and updates `Verb` rows by matching on `number`.

5. **Modify `backend/scripts/seed_verbs_vocabulary.py`** (or create `reseed_verbs_by_theme.py`) to:
   - Group verbs by theme, ordered by `freq_rank` within each theme
   - Create one `WordList` per theme with a meaningful Russian name (e.g. "Основные глаголы", "Общение", "Движение", "Повседневная жизнь")
   - Set `sort_order` to control display sequence
   - Reuse existing `Word` rows (matched by `lithuanian` field) to preserve user progress

6. **No frontend changes needed** — `frontend/app/programs/[key]/page.tsx` already renders stacks generically sorted by `sort_order`.

## Affected files

- `backend/models.py` — add `freq_rank` and `theme` to `Verb`
- `backend/scripts/seed_verbs_vocabulary.py` — modify seeding to use theme-based grouping
- `backend/scripts/verb_themes.json` — new data file with frequency/theme assignments
- `backend/scripts/seed_verb_themes.py` — new script to populate DB
- `backend/migrations/versions/` — new Alembic migration

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #115 — Verb sort by frequency/theme instead of alphabetical. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 115;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
