---
kind: bugfix
status: done
iteration: 2
max_iterations: 22
suggested_model: sonnet
suggested_effort: high
confirmed_model: sonnet
confirmed_effort: high
---

# Issue #157 — /

**Reported:** 2026-08-18 10:48:11.890482
**Status:** open
**Description:** помоему есть баг с награждением еженедельных лидеров. в понедельник произошло награждение но неделя уже закончилась и подсчет произошел по обнуленным данным в самом деле

## Root cause

The weekly reward cron fires Monday 10:00 UTC (`backend/scheduler.py:244`) but picks winners with
`WHERE DATE_TRUNC('week', uwp.last_seen) = DATE_TRUNC('week', NOW())` (`backend/scheduler.py:133`).
PostgreSQL truncates weeks to **Monday 00:00**, so at run time `NOW()` is already inside the
*newly started* week — the "weekly top 5" is computed from ~10 hours of Monday-morning activity
instead of the 7 days that just ended. That is exactly the reporter's "counting was done on
zeroed-out data".

Secondary defects found in the same path:

- **Dedup window is a rolling 6 days, not week-anchored** (`scheduler.py:142-146`,
  `routers/admin.py:458-468`). A manual mid-week generate silently suppresses the next scheduled
  run (false positive); a run delayed 8+ days double-rewards the same week (false negative).
- **The manual admin path is a full copy** of the query + dedup + message loop
  (`routers/admin.py:424-490`), so it carries the identical wrong-week bug and can drift again.
- **The admin top-5 preview** (`routers/admin.py:359-407`) previews the *current* week and uses a
  *different* scoring formula than the generator sitting next to it.
- **Reward ranking ≠ displayed leaderboard.** Rewards score only `user_word_progress`
  (known=3/learning=1); the user-facing widget (`routers/words.py:1004-1060`) scores words +
  phrases + grammar + practice exams. The people shown as leaders and the people who get Premium
  can differ — an independent source of "leader reward is buggy" reports.
- **Latent type coupling:** `uwp.last_seen` is naive `TIMESTAMP` (UTC) compared against
  `timestamptz` `NOW()`; correctness silently depends on the DB session `TimeZone`.

Design decision: the user-facing leaderboard (`routers/words.py:1016-1019`) is **correct as-is** and
must keep showing the week in progress — the copy promises "points earned this week (Mon–Sun)"
(`frontend/lib/i18n/en.ts:476`). Only the *reward* path should target the previous completed week.
These are genuinely different requirements and must not be unified.

`suggested_model: sonnet` / `suggested_effort: high` — backend-only and mechanical once the week
helper exists, but it touches Premium-granting logic across three duplicated call sites plus email
copy and new tests, so it needs care rather than raw reasoning power.

## Fix plan
- [x] 1. Add a pure `previous_week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]` helper in `backend/scheduler.py` (near `_utcnow`, ~line 26) returning `[Mon 00:00, next Mon 00:00)` of the last **fully completed** week, UTC-naive. Keep it a pure function of `now` (injectable) so it is testable under the SQLite harness; no DB access.
- [x] 2. In `_generate_weekly_reward_messages` (`scheduler.py:122-140`) replace line 133 with `WHERE uwp.last_seen >= :week_start AND uwp.last_seen < :week_end`, binding the values from step 1. Verify `grep -n "DATE_TRUNC" backend/scheduler.py` returns nothing.
- [x] 3. Anchor the dedup window to the rewarded week (`scheduler.py:142-146`): replace `created_at >= week_start - timedelta(days=6)` with `created_at >= week_end` (the Monday 00:00 that closed the rewarded week). Drop the stale `# Approximate:` comment and update the docstring at `scheduler.py:117-121` to say "last completed week".
- [x] 4. De-duplicate the manual path: rename `_generate_weekly_reward_messages` → `generate_weekly_reward_messages` and make `POST /api/admin/leaderboard-rewards/generate` (`routers/admin.py:424-490`) drop its copied query/dedup/loop and call it, returning `{"ok": True, "created": len(new_ids)}`. Import lazily (precedent: `admin.py:354`). Accept the deliberate side effect that the manual path now also skips non-consent users — `send_prepared_message` rejects them with 403 anyway (`admin.py:296-298`). Update the docstring at `admin.py:429-433`.
- [x] 5. Make the admin preview show the week that will actually be rewarded: in `get_leaderboard_top5` (`admin.py:359-407`) swap the four `DATE_TRUNC('week', …)` predicates (`:380, :387, :394, :400`) for the same bound parameters, and return `week_start`/`week_end` in the response. Update the UI copy in `frontend/app/dashboard/admin/page.tsx:2241-2242`, `:2257`, `:2259`, and the toggle description at `:3597` to say *прошлой* недели with the date range.
- [x] 6. Align the reward scoring formula with the displayed leaderboard: extract the 4-source scoring SQL from `routers/words.py:1021-1055` into one shared builder taking optional `(start, end)` bounds, and use it from `/api/leaderboard` (current week / all-time), `/api/admin/leaderboard-top5` (previous week) and the reward generator (previous week). Do this **after** steps 1–5 are green — it changes *who* wins, not just *when*.
- [x] 7. Fix the email copy for last-week wording in `backend/email_templates.py` — `:50` ("на этой неделе"), `:62` ("this week"), `:76` (subject), `:80`, `:88` (subject), `:91`. Otherwise a correct fix ships an email that contradicts itself on Monday morning.
- [x] 8. Leave the user-facing leaderboard semantics untouched (`words.py:1016-1019` stays current-week) beyond the step 6 refactor; no i18n change needed there.
- [x] 9. Hardening: add `misfire_grace_time=3600, coalesce=True` to the cron job at `scheduler.py:244` — with previous-week anchoring a late run now yields the same correct result, so recovering a missed run is finally safe.

## Data repair note (read-only investigation, do NOT modify data here)

2026-08-17 was a Monday, so that 10:00 UTC run almost certainly granted Premium against ~10 hours of
data. Investigate with SELECTs only (via the `/sql` skill): (a) `prepared_message` rows of type
`reward`/`notice` with `created_at >= '2026-08-10'`; (b) the correct winners for
`last_seen >= '2026-08-10 00:00' AND < '2026-08-17 00:00'` vs. the buggy set
(`>= '2026-08-17 00:00' AND < '2026-08-17 10:00'`); (c) `"user"` rows with `premium_until` between
2026-08-23 and 2026-08-26 (note: for existing premium users the grant *extends* `premium_until`,
`scheduler.py:216-221`, so cross-check against `sent_at`). **Recommendation:** do not revoke anything
— clawing back a gifted week is worse UX than the bug. Instead make good on the users who should have
won week 2026-08-10…16 via the existing superadmin endpoint `POST /api/admin/users/{id}/premium`
(`admin.py:765-790`) plus the admin Rewards tab. After step 3 the week-anchored dedup will not block
that make-good, since those messages belong to a different rewarded week. Never raw UPDATE/INSERT.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue. Primary coverage belongs in backend pytest — add `backend/tests/test_issue_157_weekly_reward_window.py` covering: (1) `previous_week_bounds(datetime(2026,8,17,10,0)) == (2026-08-10 00:00, 2026-08-17 00:00)` plus Sunday 23:59, mid-week Wednesday, and Monday 00:00:00 exactly; (2) an integration test of `generate_weekly_reward_messages` seeding previous-week leaders plus a decoy with a huge score whose `last_seen` is Monday 09:00 of the *run* week, patching `_utcnow` to Monday 10:00 — the decoy must be absent (this test fails with exactly the reported symptom before the fix; step 2's parameter binding is what unblocks it on SQLite, see the skip in `backend/tests/test_scheduler.py` / `backend/conftest.py:27-31`); (3) dedup: a `reward` created Wednesday of the *previous* week must NOT suppress, one created Monday 00:30 of the run week MUST suppress; (4) endpoint parity — `POST /api/admin/leaderboard-rewards/generate` as superadmin yields the same recipients as the helper (pattern: `backend/tests/test_superadmin.py`); existing `test_scheduler.py` send/consent/premium tests stay green. Then add `frontend/tests/issue-157-reward-week-label.spec.ts` mocking `**/api/admin/leaderboard-top5` (style: `frontend/tests/leaderboard.spec.ts`) asserting the Rewards tab heading names the previous week, and a cheap assertion in the existing leaderboard spec that the user widget still advertises the *current* week.
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_issue_157_weekly_reward_window.py -q` and `cd frontend && npx playwright test tests/issue-157-reward-week-label.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #157 — помоему есть баг с награждением еженедельных лидеров. в понедельник произошло награждение но неделя уже закончилась и подсчет произошел по обнуленным данным в самом деле. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 157;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-157-weekly-reward-wrong-week.md` → `plans/triage/implemented/IMPLEMENTED-issue-157-weekly-reward-wrong-week.md`).

## Definition of Done — result (2026-08-18, iteration 2/22)

- `cd backend && .venv/bin/python -m pytest -q` → **291 passed**
- `cd frontend && npx playwright test --reporter=list` → **418 passed, 6 failed**

The 6 failures are **pre-existing and unrelated to #157**, verified two ways: (a) `git stash` of
this entire change, re-run → the *same* 6 fail on a clean tree; (b) the `premium-banner` test id
those specs query does not exist anywhere in `frontend/app/` or `frontend/lib/`. This change's
frontend diff is confined to the admin leaderboard-rewards tab and `lib/api.ts`, which none of the
6 exercise. Failing specs, left for a separate issue:
`issue-117-en-translation-fallback`, `news` (EN toggle), `phrase-lists` (EN labels),
`quota` (premium badge), `stats-card-alignment` ×2 (premium banner words/phrases).

Red→green was confirmed for the regression test: temporarily reverting `previous_week_bounds` to
return current-week bounds made all 7 tests in `test_issue_157_weekly_reward_window.py` fail; the
probe was then removed and they pass again.
