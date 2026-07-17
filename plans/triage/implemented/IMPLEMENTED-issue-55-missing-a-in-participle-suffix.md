# Issue #55 — /dashboard/articles/dalyviai-rūšys-ir-linksniavimas/

**Reported:** 2026-04-15 20:08:59
**Status:** open
**Description:** Particle Types: Suffix / -antis/-anti (пропущена А) — in the participle types summary table, the suffix for present active participle is listed as "-ntis / -nti" instead of "-antis / -anti" (missing the letter 'A')

## Root cause
Confirmed in DB. The article `dalyviai-rūšys-ir-linksniavimas` (id=10) contains a summary table with this row:
```
| **Настоящее активное** | Наст. вр. 3 л. | -ntis / -nti | dirb-**antis** / dirb-**anti** |
```
The suffix column shows `-ntis / -nti` but should be `-antis / -anti`. The example column correctly shows `antis/anti`, making the inconsistency visible. The correct suffix for the present active participle in Lithuanian is `-antis / -anti`.

## Fix plan
1. Run SQL to fix the article content:
```sql
UPDATE article
SET body_ru = REPLACE(body_ru, '| -ntis / -nti |', '| -antis / -anti |'),
    body_en = REPLACE(body_en, '| -ntis / -nti |', '| -antis / -anti |'),
    updated_at = NOW()
WHERE slug = 'dalyviai-rūšys-ir-linksniavimas';
```
2. Verify the update by querying the article.
3. Reload the article page and confirm the suffix now shows "-antis / -anti".

Note: The split `dirb-antis` in the examples shows that the stem is `dirb-` (from infinitive `dirbti` minus `-ti`) and the suffix is `-antis`. This is consistent with the updated table.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the dalyviai article and checks that the suffix "-antis / -anti" appears in the page (and "-ntis / -nti" in the suffix column no longer appears without the 'a').
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #55 — Fixed missing 'A' in participle suffix: '-ntis / -nti' → '-antis / -anti'. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 55;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
