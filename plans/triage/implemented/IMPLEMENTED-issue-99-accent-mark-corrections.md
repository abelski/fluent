# Issue #99 — /

**Reported:** 2026-05-26 20:07
**Status:** open
**Description:** Ошибки в ударениях в разделе "Слова":
- gira (girà)
- padangos (pãdangos)
- užduotis (užduotìs)
- kovas (kóvas)
- trumpalaikė (trumpalaĩkė)

## Root cause

The `accented` field in the `word` table contains wrong stress positions for these words. The rendering logic in `QuizSession.tsx` (`renderAccented()`) is correct — this is purely a data error. The `*syllable*` notation marks the stressed syllable; the following DB values are wrong:

| id | word | Current (wrong) | Correct |
|---|---|---|---|
| 3358 | gira | `*gir*a` | `gir*a*` |
| 4148, 7218 | padangos | `pada*ngos*` / null | `*pa*dangos` |
| 4561, 5369 | užduotis | null / `*užd*uotis` | `užduot*is*` |
| 5124, 5127 | kovas | `ko*vas*` | `*ko*vas` |
| 6800 | trumpalaikė nuoma | `trum*pa*laikė *nuo*ma` | `trumpala*ikė* *nuo*ma` |

## Fix plan

1. Run the following SQL against the production Neon DB:

```sql
BEGIN;

-- gira: stress on final syllable "a"
UPDATE word SET accented = 'gir*a*' WHERE id = 3358;

-- padangos: stress on first syllable "pa"
UPDATE word SET accented = '*pa*dangos' WHERE id IN (4148, 7218);

-- užduotis: stress on final syllable "is"
UPDATE word SET accented = 'užduot*is*' WHERE id IN (4561, 5369);

-- kovas: stress on first syllable "ko"
UPDATE word SET accented = '*ko*vas' WHERE id IN (5124, 5127);

-- trumpalaikė nuoma: fix trumpalaikė stress to "ikė"
UPDATE word SET accented = 'trumpala*ikė* *nuo*ma' WHERE id = 6800;

COMMIT;
```

2. Verify in admin panel (`/dashboard/admin` → Words) that each word shows the updated `accented` value.

## Tests
1. Write a Playwright test in `frontend/tests/issue-99-accent-fixes.spec.ts` that mocks the study API to return each affected word with the corrected `accented` value, visits the study route, and asserts the correct syllable is bolded:
   - `gira`: `<strong>a</strong>` visible, not `<strong>gir</strong>`
   - `padangos`: `<strong>pa</strong>` visible, not `<strong>ngos</strong>`
   - `užduotis`: `<strong>is</strong>` visible, not `<strong>užd</strong>`
   - `kovas`: `<strong>ko</strong>` visible, not `<strong>vas</strong>`
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #99 — accent mark corrections for gira, padangos, užduotis, kovas, trumpalaikė. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 99;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `IMPLEMENTED-issue-99-accent-mark-corrections.md`).
