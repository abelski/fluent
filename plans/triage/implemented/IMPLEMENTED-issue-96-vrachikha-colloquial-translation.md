# Issue #96 — /dashboard/lists/209/study

**Reported:** 2026-05-26 12:36:18
**Status:** open
**Description:** нет такого слова - врачиха, просто укажите доктор (ж.р), вы же не переводихи и програмихи, сайты верстатихи, языки нам помогать учихи

## Root cause

Pure data problem. Word id 6011 in list 209 ("Kaip sekasi?") has `translation_ru = 'врачиха'`. The Russian word is a colloquial/pejorative `-иха` formation. The Lithuanian `gydytoja` is the standard neutral feminine of `gydytojas` and deserves a neutral Russian gloss.

The masculine sibling (id 5468, `gydytojas → врач`) is already in the same list, so the feminine row needs a gendered marker rather than bare `врач` (which would duplicate the masculine entry and collide as a distractor per the logic established in issue #59). Following the precedent in `IMPLEMENTED-issue-41-draugas-masculine-only-translation.md` and `IMPLEMENTED-issue-42-padavejas-masculine-only-translation.md`, and the user's own suggestion, the replacement is `врач (ж.р.)`.

No code change is needed — the study page renders `translation_ru` verbatim. No seed file contains `врачиха` (grep verified). `backend/seed_ne_dienos.py` only seeds the masculine `gydytojas → врач`.

## Fix plan

1. **Verify current state** via the `sql` skill:
   ```sql
   SELECT id, lithuanian, accented, translation_ru, translation_en, hint
   FROM word
   WHERE id = 6011;
   ```
2. **Apply UPDATE** with idempotency guard:
   ```sql
   UPDATE word
   SET translation_ru = 'врач (ж.р.)',
       hint = 'daiktavardis'
   WHERE id = 6011
     AND lithuanian = 'gydytoja'
     AND translation_ru = 'врачиха';
   ```
3. **Verify after**:
   ```sql
   SELECT id, lithuanian, translation_ru, translation_en, hint
   FROM word WHERE id IN (5468, 6011);
   ```
   Expected: 5468 `gydytojas` / `врач`; 6011 `gydytoja` / `врач (ж.р.)`.
4. **Distractor-collision check** (per issue #59 logic): `врач` ≠ `врач (ж.р.)`, so both rows can co-exist in list 209 without collision.
   ```sql
   SELECT id, lithuanian, translation_ru
   FROM word
   WHERE archived = false AND translation_ru = 'врач (ж.р.)';
   ```

Out-of-scope finding (note to user, do **not** include in this fix): a broader scan of the DB for the same `-иха` pattern surfaced only one other case — id 6009 `фермерша` — but that row is already covered by issue #95 (which deals with its missing-letter problem). No other `-иха` instances in the DB.

## Tests

1. Write a Playwright test in `frontend/tests/issue-96-vrachikha-colloquial.spec.ts` that loads `/dashboard/lists/209/study`, walks until `gydytoja` is the prompt, and asserts the rendered Russian translation is `врач (ж.р.)` and that `врачиха` does not appear anywhere on the page.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify in the browser.

## Confirm resolution

Ask the user: "Issue #96 — `gydytoja` translated as colloquial `врачиха`, updated to `врач (ж.р.)`. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 96;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-96-vrachikha-colloquial-translation.md`.
