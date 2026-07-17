# Issue #94 — /dashboard/lists/209/study

**Reported:** 2026-05-26 12:31:24
**Status:** open
**Description:** Mokslininkas - ученый, не Mokslinininkas, лишнее ni

## Root cause

Pure data typos in `word` table for list 209 ("Kaip sekasi?"):

- **id 6002**: `lithuanian = 'mokslinininkas'` (extra `ni`) — correct: `mokslininkas`. Also `accented = 'moks*li*ninkas'` puts the stress marker in the wrong place; standard stress for this paradigm falls on `-nin-`.
- **id 6003** (paired feminine): `lithuanian = 'mokslininke'` is missing final `ė`, and `accented = '*moksl*ninke'` is missing both an `i` and the final `ė`. Correct: `mokslininkė` / `moksli*nin*kė`.

No seed file in the repo contains these strings (grep returned no matches). List 209's vocabulary was loaded from `temp_files/Ne_denos_belietuviu_Kalba/02_Kaip_sekasi.md`, which is not present in the working tree — re-running the seed cannot re-introduce the typo. Reads via `backend/routers/words.py` are uncached, so the fix is live immediately on COMMIT.

## Fix plan

1. **Verify current state** via the `sql` skill:
   ```sql
   SELECT id, lithuanian, accented, translation_ru, translation_en
   FROM word
   WHERE id IN (6002, 6003);
   ```
2. **Apply UPDATEs** in one transaction, guarded by current `lithuanian` for idempotency:
   ```sql
   BEGIN;
   UPDATE word
   SET lithuanian = 'mokslininkas',
       accented   = 'moksli*nin*kas'
   WHERE id = 6002 AND lithuanian = 'mokslinininkas';

   UPDATE word
   SET lithuanian = 'mokslininkė',
       accented   = 'moksli*nin*kė'
   WHERE id = 6003 AND lithuanian = 'mokslininke';
   COMMIT;
   ```
   Both should report `UPDATE 1`. Accented form follows the `*…*` single-stress-syllable convention documented in `backend/models.py:82`.
3. **Re-verify** with the SELECT from step 1.

## Tests

1. Write a Playwright test in `frontend/tests/issue-94-mokslininkas-spelling.spec.ts` that loads `/dashboard/lists/209/study` (or queries the words API for list 209) and asserts:
   - The Lithuanian word for "ученый" renders as `mokslininkas` (no triple `ni`).
   - The Lithuanian word for "ученая" renders as `mokslininkė` (with final `ė`).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify in the browser.

## Confirm resolution

Ask the user: "Issue #94 — `mokslininkas` typo (extra `ni`). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 94;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-94-mokslininkas-extra-ni.md`.
