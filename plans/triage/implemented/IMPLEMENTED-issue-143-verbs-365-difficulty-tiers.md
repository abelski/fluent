# Issue #143 — /programs/verbs_365/

**Reported:** 2026-07-16 14:36:43
**Status:** open
**Description:** в этой программе инфинитивы нужно выделить в сложность 1 сложность 2 будущее и прошлое время и все остальные формы в сложность 3

## Final direction (superseded the original form-based reading)
On 2026-07-17 the product owner provided an explicit verb→complexity mapping
instead of tiering by tense forms: Группа 1 (166 core verbs), Группа 2
(118 extended verbs), Группа 3 (72 reflexive/rare verbs) — all 356 distinct
verbs of the verbs_365 program.

## Root cause
All 356 verbs_365 `Word` rows were seeded at `star=1`, so the existing
★/★★/★★★ difficulty machinery (`Word.star`, `GET /api/lists/{id}/study?star_level=N`,
the star selector on /dashboard/lists) had no effect for this program.

## Fix (implemented)
1. `backend/scripts/set_verbs365_stars.py` (new, idempotent, `--dry-run`
   supported) — contains the three verb groups verbatim, strips stress marks
   (keeping real Lithuanian diacritics ąčęėįšųūž) before matching against
   `word.lithuanian`, and sets `Word.star` to the group number for every word
   linked to a `verbs_365` word list.
2. Ran against production: 356/356 matched, 0 unmatched in either direction;
   final distribution 166 ★ / 118 ★★ / 72 ★★★.
3. No backend/frontend code changes — the star_level filter and selector are
   pre-existing and picked up the data automatically.

## Verification (done)
- Dry-run and live run both reported exact 166/118/72 split, zero mismatches.
- API check on list 295 «Общение» (mix of 15★/16★★/5★★★): `star_level=1`
  sessions contain only ★ verbs; `star_level=2` adds ★★; `star_level=3` serves
  all groups.

## Confirm resolution
Ask the user: "Issue #143 — verbs_365 verbs split into difficulty tiers ★166/★★118/★★★72 per your groups. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 143;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-143-verbs-365-difficulty-tiers.md` → `plans/triage/implemented/IMPLEMENTED-issue-143-verbs-365-difficulty-tiers.md`).
