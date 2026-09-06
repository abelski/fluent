---
kind: feature
status: draft
iteration: 0
max_iterations: 30
suggested_model: sonnet
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# #19 — Web Push study reminders

## Context

Fluent has no proactive nudge to bring users back for a study session — the only outbound
messaging today is reactive (30-day inactivity re-engagement email) or weekly (leaderboard
reward email), both via `backend/scheduler.py` + `backend/email_service.py`. The user wants a
daily reminder mechanism ("learn or other things") delivered as **browser Web Push** (VAPID),
once per day at a user-configurable local time, defaulting to 18:00 ("dinner time").

Confirmed with the user via clarifying questions:
- **Channel**: standard Web Push (VAPID) + service worker. Works on Chrome/Firefox/Edge
  desktop+Android. iOS Safari requires "Add to Home Screen" first — documented as a known
  platform limitation, not engineered around.
- **Trigger logic**: ONE consolidated push per user per day at their configured time.
  Priority when multiple conditions apply: streak-about-to-break > words/phrases due for
  review > generic daily nudge. Skipped entirely if the user already studied that day.
- **Controls**: dedicated `reminder_enabled` + `reminder_time` settings (not reusing
  `email_consent`). Timezone is auto-captured from the browser (`Intl.DateTimeFormat()`) at
  the moment push permission is granted — no manual timezone picker.
- **Admin**: kill-switch consistent with the existing `auto_send_inactive_emails` /
  `auto_send_weekly_rewards` toggles.

This is a genuinely new capability for the repo (no push/service-worker/PWA code exists
anywhere yet) touching auth-adjacent subscription data and a new frequent scheduler job —
`suggested_model: sonnet` / `suggested_effort: high` because of that surface area.

**This plan went through two rounds of independent blind design review** (an agent with no
codebase access, plan text only, acting as a skeptical reviewer). Round 1's P0/P1 findings are
folded into Requirements/Implementation below (inline "(review fix)" markers); its P2 items are
accepted, deferred follow-ups. The one architectural change from round 1: **this plan no longer
extracts/refactors the existing streak logic in `routers/words.py::get_stats`.** That code was
already the subject of a real production cost incident (CHANGELOG #15, Neon egress) and backs a
live user-facing endpoint — bundling its refactor into a change that also adds a new external
dependency, new scheduler job, and new DB table increases blast radius and makes a future
regression harder to bisect. Instead, the reminder job implements its own small, independent
"studied dates" query (same shape, deliberately duplicated — but see the round-2 fix below,
which shares only the *list of source tables*, not the query logic, between the two).

**Round 2 re-reviewed the round-1 fixes themselves** and found the fix mechanisms introduced
new gaps, folded in below (inline "(review fix r2)" markers): the dedup-vs-retry semantics for
a failed send were ambiguous (risked silently losing a whole day's reminder to one transient
error); 401/403 handling had no bound on retry cost; the auth-failure alert had no throttle; the
VAPID rotation runbook didn't account for the frontend's public key being baked in at
static-export build time; per-user failures were counted but not individually logged; and the
duplicated "studied dates" query had no shared source-of-truth against future drift from
`/me/stats`.

**Existing infra this builds on** (verified directly in the code):
- `backend/scheduler.py` — `BackgroundScheduler(timezone="UTC")`, `start_scheduler()` called
  from `backend/main.py:76`, cron jobs via `scheduler.add_job(fn, "cron", ...)`. Single-process,
  in-memory (APScheduler `BackgroundScheduler`) inside the one FastAPI process on Render's
  single-service hosting — fine today; would silently duplicate sends if hosting ever added a
  second instance (documented as an assumption below, not solved here).
- `email_service.py` / `email_templates.py` — structurally similar send pipeline, not reused
  directly, but `telegram_service.send_telegram(...)` ops-visibility pattern
  (`scheduler.py:136-139`) is reused for the new job.
- `AppSetting` model (`models.py:362-367`) + `scheduler.py:51-57`
  `_is_auto_send_enabled(session, key)` — kill-switch pattern, currently private to
  `scheduler.py`.
- Admin toggle UI: `_AUTO_SEND_KEYS` tuple (`routers/admin.py:1233`), `GET`/`PATCH
  /admin/settings/auto-send` (admin.py:1236-1273), superadmin-gated.
- Streak / "studied today" **reference only, not touched by this plan**: computed inline in
  `GET /me/stats` (`routers/words.py:984-1094`) — a `_distinct_dates()` helper unions 5
  activity-date sources (`UserWordProgress.last_seen`, `GrammarLessonResult.created_at`,
  `UserPhraseProgress.last_seen`, `UserCustomPhraseProgress.last_seen`,
  `PracticeExamResult.created_at`) via `SELECT DISTINCT` date-only queries (this exact
  DISTINCT-not-raw-rows shape is what CHANGELOG #15 fixed after an egress incident), then walks
  backward from today (or yesterday if today absent) while consecutive dates exist. The new
  job's own local implementation (see Requirement 5) mirrors this same query shape.
- SM-2 review-due data: `UserWordProgress.next_review` / `UserPhraseProgress.next_review`
  (`Optional[date]`), "due" = `next_review <= today`.
- Settings endpoint: `UserSettingsUpdate` (`routers/words.py:567`), `GET`/`PATCH
  /me/settings` (words.py:577, 595) — the natural home for `reminder_enabled`/`reminder_time`.
- Settings UI: `frontend/app/dashboard/settings/page.tsx`, "Other" tab (`activeTab ===
  'other'`, line 623), checkbox pattern at line 645-656 (`accent-emerald-600`), local `settings`
  state seeded at line 18, `handleSave()` at line 92. `frontend/lib/api.ts` `UserSettings`
  interface (line 68), `getSettings()`/`updateSettings()` (lines 78-99).
- Migrations: Alembic is the live convention (`backend/migrations/versions/`), current head
  `d5e6f7a8b9c0_add_stripe_billing_to_user.py`. **Known gotcha**
  (`documentation/local-dev-gotchas.md:97-108`): `main.py`'s `create_db_and_tables()` only
  creates missing tables, never alters existing ones — new `User` columns 500 every
  `select(User)` until `alembic upgrade head` is run by hand locally.
- `backend/requirements.txt` has no push library yet; `apscheduler>=3.10` already present.
- Env vars: plain `os.getenv("KEY")`, documented per-feature block in `backend/.env.example`
  (see the Stripe/Telegram blocks at the bottom) and `render.yaml`'s `envVars` list (currently
  10 entries, e.g. `NEXT_PUBLIC_BACKEND_URL`).
- Next.js: `output: 'export'` (production-only, `next.config.js`) — no Next.js API routes
  possible; the subscribe endpoint must be FastAPI. `frontend/public/` serves static files
  verbatim at the root post-export, so `sw.js` belongs there.

## Goals

- Users can opt in to a daily Web Push reminder and pick a preferred local time.
- The reminder fires once per day, content-prioritized (streak-risk > due review > generic
  nudge), and is suppressed if the user already studied that day.
- Users can disable/unsubscribe at any time from Settings.
- Admins can globally kill-switch the reminder job, consistent with existing auto-send toggles.
- The job is resilient to one bad user row and to VAPID key problems — neither should silently
  break reminders for the whole user base with no ops signal.

## Non-Goals

- No manual timezone picker (auto-captured only).
- No admin review/draft queue for push content (unlike `PreparedMessage` emails) — push is
  fire-and-forget per tick.
- No native mobile push (this is browser Web Push only); no dedicated iOS PWA install flow
  beyond a static hint.
- No change to the existing email-based inactivity/reward jobs.
- No notification-history/read-state UI (out of scope — this is push-only, not an in-app
  notification center).
- No refactor of the existing `/me/stats` streak logic (see Context — deliberately kept
  untouched; the reminder job duplicates a small piece of the same query shape instead, sharing
  only a small list-of-source-tables constant — see Requirement 5).
- No automatic recovery from a VAPID key rotation, and no automatic purge of subscriptions
  permanently broken by one (out of scope for self-healing — the bounded per-day retry cost for
  a dead subscription is cheap enough, ~3 attempts over ~45 minutes, that building auto-purge
  logic isn't worth it). This plan ships detection/alerting + a documented manual runbook
  instead (see Requirement 5 and Implementation step 13).
- No handling of a multi-instance backend deployment (current hosting is single-instance;
  documented as an assumption, not solved).

## Requirements

1. `User` gains `reminder_enabled: bool = Field(default=False, index=True)` — indexed because
   the scheduler job filters on it every 15 minutes and this is expected to remain a small
   subset of all users (review fix: avoids an unindexed full-table scan as the user base
   grows) — `reminder_time: str` ("HH:MM", default `"18:00"`), `reminder_timezone:
   Optional[str]` (IANA string), `last_reminder_sent_date: Optional[date]`, and
   `reminder_attempts_today: int = Field(default=0)` (review fix r2 — bounds same-day retries,
   see Requirement 5).
2. New `PushSubscription` table: one row per browser/device subscription
   (`endpoint` unique, `p256dh`, `auth`, `user_id` FK, `user_agent`, `created_at`) — the exact
   shape `pywebpush.webpush(subscription_info=...)` needs.
3. `POST /api/me/push/subscribe` and `POST /api/me/push/unsubscribe`, JWT-authed via the
   existing `authorization: Optional[str] = Header(None)` + `auth.require_user(...)` pattern.
   **Subscribe semantics (review fix, was ambiguous — a shared device re-subscribing under a
   different account must not leak the previous user's content):** look up `PushSubscription`
   by `endpoint`; if a row exists, **overwrite** `user_id`, `p256dh`, `auth`, `user_agent`,
   `created_at` on that row (full reassignment — the endpoint now unambiguously belongs to
   whoever most recently granted permission on that browser); if no row exists, insert one.
   Always refresh `user.reminder_timezone` on the *current* user to the browser-reported value.
   `reminder_timezone` is validated server-side (must construct a valid
   `zoneinfo.ZoneInfo(...)` without raising) — reject with 422 otherwise (review fix: was only
   validated for `reminder_time`, not timezone, so a bad value used to only surface as a
   background-job crash). **Accepted minor risk (review fix r2):** the lookup-then-write is not
   a single atomic DB-level upsert, so two near-simultaneous subscribe calls for the exact same
   `endpoint` (e.g. a double-fired client request) could race; the outcome is a benign
   lost-update (one write wins, no corruption, no cross-account leak), not worth the added
   complexity of a raw-SQL `ON CONFLICT DO UPDATE` for this traffic pattern.
4. `GET`/`PATCH /api/me/settings` extended with `reminder_enabled`/`reminder_time`, server-side
   validated (`HH:MM` regex, 422 on malformed input).
5. New scheduler job, ticking every 15 minutes, that:
   - skips entirely if the admin kill-switch (`auto_send_reminder_push`) is off or VAPID isn't
     configured;
   - **two-phase, narrow-then-wide query (review fix r2 — a full-row select on every enabled
     user, every tick, was deferred-not-fixed in round 1):** phase 1 selects only
     `User.id, User.reminder_time, User.reminder_timezone, User.last_reminder_sent_date,
     User.reminder_attempts_today` where `reminder_enabled=True AND reminder_timezone IS NOT
     NULL` (bounded by the new index, cheap even as the enabled population grows); phase 2
     loads the full `User` row via `session.get(User, id)` only for the handful of ids that
     actually match this tick's eligibility check below — so the expensive full-row work scales
     with "users due *this* 15-minute slot" (typically total-enabled/96), not with total enabled
     users;
   - for each candidate, **wrapped in its own try/except, logging the user id and exception
     (review fix r2 — round 1 only counted failures in an aggregate number, which isn't enough
     to root-cause a specific bad row) and calling `session.rollback()` before continuing to the
     next user** (review fix: one bad row — e.g. an unparseable `reminder_timezone` from stale
     data — must not silently abort the whole 15-minute tick for every other user; covered by a
     test that seeds one bad row among valid ones);
   - **eligibility = window match OR pending retry (review fix r2 — replaces round 1's ambiguous
     "dedup on every branch," which on one reading meant a single transient send error silently
     cost the user their entire day with no retry):** a user is processed this tick if either
     (a) `reminder_time` falls within the trailing 15-minute window of their local time
     (`zoneinfo.ZoneInfo(user_tz)`, `(now_local_minutes - target_minutes) % 1440 < 15` — **known,
     accepted limitation, documented rather than silent: on the local DST spring-forward day, a
     `reminder_time` inside the skipped wall-clock hour never matches that day, with no
     catch-up; affects at most one day/year per DST-observing timezone, never the 18:00
     default**), OR (b) `last_reminder_sent_date != local_today` AND `reminder_attempts_today >
     0` (a retry left over from an earlier failed attempt today);
   - if this is a *fresh* trigger for a new local day (case (a) above and not also a pending
     retry), reset `reminder_attempts_today = 0` for that user first;
   - skip immediately (no attempt) if `last_reminder_sent_date == local_today` already (the day
     is fully settled — either delivered or the retry budget was exhausted, see below);
   - computes "studied today" via a **small, local, independent query** (own function in
     `reminder_service.py`, NOT imported from `routers/words.py`, but iterating the **shared
     `ACTIVITY_SOURCES` constant** from new module `backend/activity_sources.py` — review fix r2:
     round 1's fully-duplicated query had no shared source-of-truth, so a future 6th activity
     type could be added to `/me/stats` and silently forgotten here; sharing just the *list of
     (table, date-column, user-id-column) tuples*, not the query/streak logic itself, closes that
     drift risk without reintroducing the blast-radius problem round 1 fixed) unioning the
     source dates via `SELECT DISTINCT`; if already studied today, mark the day fully settled
     (`last_reminder_sent_date = local_today`) and skip sending;
   - otherwise picks the highest-priority applicable message (streak > due > nudge) and sends
     via `pywebpush` to every `PushSubscription` row the user owns;
   - **failure categorization (review fix — VAPID rotation has no story otherwise):** a 404/410
     response means the subscription itself is gone — delete that row. A 401/403 response means
     VAPID auth was rejected, which usually indicates a global key misconfiguration/rotation,
     **not** a dead subscription — do NOT delete the row; instead count it as an `auth_failed`
     outcome;
   - **on success:** mark the day fully settled (`last_reminder_sent_date = local_today`). **On
     any failure (`auth_failed`/`error`):** increment `reminder_attempts_today`; if it has now
     reached `MAX_DAILY_ATTEMPTS = 3` (review fix r2 — bounds the retry mechanism above: a
     transient failure gets up to 2 retries roughly 15 minutes apart before the day is given up
     on, so it neither loses the whole day to one blip nor hammers a permanently-broken
     subscription every 15 minutes forever), mark the day fully settled too; otherwise leave
     `last_reminder_sent_date` unset so the pending-retry eligibility rule picks the user back up
     next tick;
   - **alert throttle (review fix r2 — round 1's elevated alert had no debounce and could fire
     on every 15-minute tick during a real incident):** if `auth_failed` accounts for the
     majority of attempted sends this tick (minimum-attempts floor, e.g. ≥5, to avoid noise),
     send one elevated Telegram alert (e.g. "🚨 Web Push auth failures — VAPID keys may be
     misconfigured or rotated, check env vars") **only if** no such alert was already sent within
     the last 6 hours — tracked via one `AppSetting` row (`last_vapid_auth_alert_sent_at`, same
     generic key/value pattern already used for the kill-switches, no new table) — see also the
     runbook doc in Implementation;
   - logs `sent`/`studied_skip`/`auth_failed`/`failed` counts and one routine ops-visibility
     Telegram summary (plus the throttled elevated alert above, when triggered).
6. Admin `/dashboard/admin` gains a third auto-send toggle, `auto_send_reminder_push`, default
   on, superadmin-gated — mirrors the two existing toggles exactly.
7. Frontend: a plain service worker (`sw.js`) handling `push`/`notificationclick`; a
   `enablePushReminders()`/`disablePushReminders()` helper that requests permission, registers
   the SW, subscribes via `PushManager`, captures the browser IANA timezone, and calls the new
   API; a checkbox + `<input type="time">` in Settings → Other tab wired to the existing
   `handleSave()`/`updateSettings()` flow; a static caption noting the iOS "Add to Home
   Screen" requirement.

### Standing constraints
- All validation must be server-side (never frontend-only) — `reminder_time` **and**
  `reminder_timezone` are both validated in their respective FastAPI handlers, not just via the
  browser's `<input type="time">` constraint or trusting `Intl.DateTimeFormat()` output blindly.
- This plan touches markup/styling in `frontend/app/dashboard/settings/page.tsx`: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, reuse the existing checkbox pattern
  (`accent-emerald-600`) and the `lang-select` input styling
  (`border border-line rounded-xl px-4 py-2 text-sm ... focus:border-gray-600`) for the new
  `<input type="time">` — no raw Tailwind steps, named tokens only. Settings isn't one of the
  5 `NAV_PAGES`-guarded pages, but re-run `design-system-parity.spec.ts` anyway since it shares
  `PageShell`/tokens.
- Add autotest coverage for the new feature (backend pytest + a Playwright settings-UI test
  with `Notification`/`serviceWorker` stubbed) and run the relevant suites as part of
  Validation.

## Message content

Simple `dict[tier][lang] -> (title, body)` in `reminder_service.py`, no templating engine —
matches the RU/EN split already used throughout the app (`user.lang`, `email_templates.py`),
falling back to `"ru"` for any other value (same fallback used in `scheduler.py`).

| Tier | RU | EN |
|---|---|---|
| `streak` | **🔥 Не теряй серию!** / Ты ещё не занимался сегодня — сохрани серию из {streak} дней! | **🔥 Keep your streak!** / You haven't studied today — keep your {streak}-day streak alive! |
| `due` | **📚 Пора повторить** / У тебя есть слова и фразы на повторение сегодня. | **📚 Time to review** / You have words and phrases due for review today. |
| `nudge` | **👋 Пора позаниматься** / Удели немного времени литовскому сегодня. | **👋 Study time** / Spend a few minutes on Lithuanian today. |

`{streak}` interpolated via plain `.format()`, using `_compute_streak(studied_dates, today)`.

## Implementation

- [ ] 1. `backend/requirements.txt` — add `pywebpush>=1.14.0`.
- [ ] 2. `backend/models.py` — add 5 columns to `User` (after `continue_include_new`, line 52):
      `reminder_enabled: bool = Field(default=False, index=True)`,
      `reminder_time: str = Field(default="18:00")`,
      `reminder_timezone: Optional[str] = None`,
      `last_reminder_sent_date: Optional[date] = None`,
      `reminder_attempts_today: int = Field(default=0)`.
      Add new `PushSubscription` table (near `PreparedMessage`, line 460):
      `id`, `user_id` (FK `user.id`, indexed), `endpoint` (unique, indexed), `p256dh`, `auth`,
      `user_agent: Optional[str]`, `created_at`.
- [ ] 3. New Alembic revision in `backend/migrations/versions/`, `down_revision =
      'd5e6f7a8b9c0'`, matching the docstring/style of
      `d5e6f7a8b9c0_add_stripe_billing_to_user.py`: `op.add_column` x5 on `user`
      (booleans/strings/int with `server_default` so existing rows backfill), `op.create_index`
      for `reminder_enabled`, `op.create_table` for `push_subscription` + its two indexes,
      symmetric `downgrade()`. Run `cd backend && .venv/bin/python -m alembic upgrade head`
      locally immediately after writing this file (per the known `create_db_and_tables()`
      gotcha) — do this before running the app or any test that executes a `select(User)`,
      since the new SQLModel columns are now part of that query the moment step 2 lands.
- [ ] 4. `backend/activity_sources.py` (new — review fix r2): a single constant,
      `ACTIVITY_SOURCES: list[tuple[type[SQLModel], str, str]]`, listing the 5
      `(model, date_column_name, user_id_column_name)` tuples currently hardcoded separately in
      `routers/words.py::get_stats`/`get_activity_calendar` (`UserWordProgress.last_seen`,
      `GrammarLessonResult.created_at`, `UserPhraseProgress.last_seen`,
      `UserCustomPhraseProgress.last_seen`, `PracticeExamResult.created_at`) — **data only, not
      logic**: `words.py`'s existing `_distinct_dates()` calls switch from 5 hardcoded literals
      to iterating this list, with byte-identical output (covered by the existing streak/stats
      regression tests). This is deliberately a much smaller, lower-risk change than the
      round-1-rejected full `streak_service.py` extraction — it touches *what tables are
      consulted*, not the query or streak algorithm — and it's what step 7 below imports so the
      reminder job's "studied today" check can never silently drift from `/me/stats` if a future
      6th activity type is added to one but not the other.
- [ ] 5. `backend/app_settings.py` (new) — extract `is_auto_send_enabled(session, key)` out of
      `scheduler.py:51-57` (currently private/module-local). Update `scheduler.py`'s two call
      sites (`generate_inactive_messages`, `send_weekly_rewards`) to import it. This extraction
      is a genuine necessity (avoids a circular import once `scheduler.py` also needs the
      reminder toggle from a separate `reminder_service.py`), unlike the streak logic — it does
      not touch any previously incident-affected code. Re-run `tests/test_scheduler.py` after.
- [ ] 6. `backend/push_service.py` (new) — `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
      from `os.getenv`; `is_configured() -> bool`; `send_push(session, subscription, title, body,
      url="/dashboard") -> Literal["sent", "gone", "auth_failed", "error"]` via
      `pywebpush.webpush(...)` — catches `WebPushException`, inspects
      `exc.response.status_code`: 404/410 → delete the `PushSubscription` row, return `"gone"`;
      401/403 → do NOT delete, return `"auth_failed"`; anything else → return `"error"` (logged,
      no deletion). `send_push_to_user(session, user_id, title, body) -> dict[str, int]` (counts
      per outcome) fanning out to every subscription the user owns.
- [ ] 7. `backend/reminder_service.py` (new):
      `REMINDER_TEXT: dict[tier][lang] -> (title, body)` for `streak`/`due`/`nudge` × `ru`/`en`
      (see Message content below);
      `_get_studied_dates(session, user_id) -> set[date]` — local `SELECT DISTINCT` query
      iterating the shared `activity_sources.ACTIVITY_SOURCES` constant (step 4) — same data
      source as `/me/stats`, independent query path;
      `_compute_streak(studied_dates, today) -> int` — same backward-walk algorithm, local copy;
      `_has_due_items(session, user_id, today) -> bool` (SM-2 `next_review <= today` check,
      words + phrases, mirroring `routers/words.py:730` / `phrases.py:695`);
      `build_message(user, today, studied_dates, has_due) -> tuple[str, str]` — pure function,
      priority streak > due > nudge;
      `_matches_window(user_tz, target_hhmm, now_utc, window_minutes=15) -> bool` — via
      `zoneinfo.ZoneInfo(user_tz)`, `(now_minutes - target_minutes) % 1440 < window_minutes`;
      `_is_pending_retry(user) -> bool` — `user.last_reminder_sent_date != local_today and
      user.reminder_attempts_today > 0`;
      `send_daily_reminders(now: datetime | None = None) -> None` — the scheduler entry point,
      one `with Session(engine) as session:` for the whole tick. **Phase 1**: narrow-projected
      candidate query (`User.id, .reminder_time, .reminder_timezone, .last_reminder_sent_date,
      .reminder_attempts_today` where `reminder_enabled=True AND reminder_timezone IS NOT
      NULL`). **Phase 2**: for candidates where `_matches_window(...) or _is_pending_retry(...)`,
      `session.get(User, id)` to load the full row, then process — each iteration **wrapped in
      its own try/except Exception, logging `user.id` + the exception, calling
      `session.rollback()` before `continue`** so one bad row can't poison the session or abort
      the batch. Per-user logic: reset `reminder_attempts_today = 0` on a fresh (non-retry)
      trigger; skip if `last_reminder_sent_date == local_today`; check studied-today (mark
      settled + skip send if so); else send via `push_service.send_push_to_user`, then on
      success mark settled, on failure increment `reminder_attempts_today` and mark settled only
      once `MAX_DAILY_ATTEMPTS = 3` is reached. Tracks `sent`/`studied_skip`/`auth_failed`/
      `failed` counts across the tick; sends the routine Telegram summary, plus the elevated
      auth-failure alert (throttled via the `AppSetting` row `last_vapid_auth_alert_sent_at`,
      minimum 6h between alerts) per Requirement 5.
- [ ] 8. `backend/scheduler.py` — register
      `scheduler.add_job(send_daily_reminders, "cron", minute="*/15", misfire_grace_time=600,
      coalesce=True)` in `start_scheduler()`; update the startup log line to mention the third
      job.
- [ ] 9. `backend/routers/push.py` (new) — `POST /me/push/subscribe` (body: `endpoint`,
      `keys.p256dh`, `keys.auth`, `timezone`; validates `timezone` via
      `zoneinfo.ZoneInfo(...)`, 422 if invalid; **upserts by overwriting all fields on conflict,
      not insert-or-ignore** — see Requirement 3; refreshes `user.reminder_timezone`) and
      `POST /me/push/unsubscribe` (body: `endpoint`; idempotent delete scoped to the current
      user). Wire into `backend/main.py` alongside the other routers
      (`app.include_router(push_router, prefix="/api")`, near line 143).
- [ ] 10. `backend/routers/words.py` — extend `UserSettingsUpdate` (line 567) with
      `reminder_enabled: bool = False`, `reminder_time: str = '18:00'`; add server-side
      `HH:MM` regex validation in the `PATCH` handler (line 595+); include both fields in the
      `GET`/`PATCH` response dicts.
- [ ] 11. `backend/routers/admin.py` — add `"auto_send_reminder_push"` to `_AUTO_SEND_KEYS`
      (line 1233) and `AutoSendBody` (line 1250); default-true like the other two.
- [ ] 12. `backend/.env.example` — new block (style-matched to the Telegram block):
      `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:admin@fluent.lt`, with a
      comment on generating a keypair (`pip install py-vapid && vapid --gen`). Generate a real
      local dev keypair and set it in `backend/.env`.
- [ ] 13. `documentation/web-push-notes.md` (new — review fix, VAPID rotation runbook,
      expanded per round 2): document that rotating/regenerating VAPID keys invalidates every
      existing `PushSubscription` at once with no automatic migration path; the job's elevated
      Telegram alert (Requirement 5, throttled to at most once per 6h) is the detection signal;
      **rotation requires changing backend env vars (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
      `VAPID_SUBJECT`) AND `NEXT_PUBLIC_VAPID_PUBLIC_KEY` together, followed by a full frontend
      rebuild + redeploy — not just a backend restart — because the public key is baked into the
      static-export bundle at build time; a backend-only deploy leaves the frontend still
      requesting subscriptions under the stale public key**; recovery for already-affected
      subscribers is manual and two-part — (1) they self-heal within `MAX_DAILY_ATTEMPTS`-bounded
      cost automatically once they next re-toggle the setting (a fresh subscribe overwrites their
      row under the new key), so (2) after a rotation, publish a brief news post (via
      `/news-writer`, the same channel already used for feature announcements) telling affected
      users to toggle reminders off/on to resume receiving them, since there's no in-app
      detection that specifically distinguishes "your subscription was silently invalidated by a
      server-side key rotation" from "you just haven't touched this setting." Also note the DST
      spring-forward limitation from Requirement 5 and the single-backend-instance assumption
      from Context.
- [ ] 14. `frontend/public/sw.js` (new) — `push` listener calling `showNotification(title,
      {body, icon: '/favicon.svg', data: {url}})`; `notificationclick` listener focusing an
      existing tab matching `url` or opening a new one.
- [ ] 15. `frontend/lib/push.ts` (new) — `VAPID_PUBLIC_KEY` from
      `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `urlBase64ToUint8Array`; `isPushSupported()`;
      `enablePushReminders()` (request permission → register `/sw.js` → `pushManager.subscribe`
      → capture `Intl.DateTimeFormat().resolvedOptions().timeZone` → call
      `subscribePush(sub, timezone)`); `disablePushReminders()` (unsubscribe + call
      `unsubscribePush(endpoint)`).
- [ ] 16. `frontend/lib/api.ts` — extend `UserSettings` (line 68) with `reminder_enabled:
      boolean`, `reminder_time: string`; add `subscribePush(sub, timezone)` and
      `unsubscribePush(endpoint)` calling the two new routes, following the exact
      `getSettings()`/`updateSettings()` fetch pattern (lines 78-99).
- [ ] 17. `frontend/app/dashboard/settings/page.tsx` — in the "Other" tab (line 623), between
      the email-consent checkbox (645-656) and the save button, add a `reminder_enabled`
      checkbox (same `accent-emerald-600` pattern; on check calls `enablePushReminders()`,
      surfaces failure via the existing inline `error` state, leaves unchecked on
      denied/unsupported; on uncheck calls `disablePushReminders()`) and, shown only while
      checked, a `<input type="time" value={settings.reminder_time} ...>` styled like the
      `lang-select` (line 631-639). Add a static caption for the iOS "Add to Home Screen" note.
      Seed the initial `settings` state (line 18) with `reminder_enabled: false, reminder_time:
      '18:00'`.
- [ ] 18. `frontend/lib/i18n/types.ts`, `en.ts`, `ru.ts` — new `settings` keys
      (`reminderEnabledLabel`, `reminderEnabledHint`, `reminderTimeLabel`, `reminderIosHint`,
      `reminderPermissionDeniedError`, `reminderUnsupportedError`) and new `adminSettings` keys
      (`autoSendReminderLabel`, `autoSendReminderDesc`).
- [ ] 19. `frontend/app/dashboard/admin/page.tsx` — extend the auto-send toggles array (near
      line 3644-3645) with the third `auto_send_reminder_push` entry; widen the `autoSend`
      state type union (line ~529) to include it.
- [ ] 20. `frontend/.env.example` + `render.yaml` — add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time
      var, `sync: false` in `render.yaml`'s `envVars`, matching the `NEXT_PUBLIC_BACKEND_URL`
      entry).
- [ ] 21. `documentation/design system/Component Library (as-built).html` /
      `documentation/IMPLEMENTATION.md` — document the new `<input type="time">` pattern (first
      use in the codebase).
- [ ] 22. `documentation/CHANGELOG.md` — append `#19` entry once implementation + validation
      are complete.

## Validation

- [ ] Backend unit: `cd backend && .venv/bin/python -m pytest -q` — new
      `test_push_subscribe.py` (subscribe creates a row; **re-subscribing the same `endpoint`
      under a different user reassigns `user_id`/keys — the previous owner's row is gone/updated,
      confirming no cross-account leak**; unsubscribe idempotent; 401 without auth; 422 on an
      invalid `timezone` string), `test_reminder_settings.py` (round-trip + 422 on malformed
      `reminder_time`), `test_reminder_service.py` — `_matches_window` boundaries incl. midnight
      wrap and a DST spring-forward date where the target time falls in the skipped hour (asserts
      no send and no crash that day); `build_message` tier selection both langs;
      `send_daily_reminders` end-to-end on SQLite with `push_service.send_push` monkeypatched
      covering: in-window filtering; already-studied skip; kill-switch no-op; **one user seeded
      with an invalid/unparseable `reminder_timezone` among otherwise-valid users, asserting the
      bad row is caught, logged (assert on `caplog` that the user id appears), and every other
      user is still processed**; **the retry/dedup semantics specifically — a user whose first
      attempt this tick returns a monkeypatched transient `"error"` outcome is NOT marked
      `last_reminder_sent_date` and IS picked up again as a pending retry on a second simulated
      tick ~15 minutes later (asserting the "one transient failure doesn't lose the whole day"
      fix actually works); a user who fails 3 times in a row (`MAX_DAILY_ATTEMPTS`) IS marked
      settled after the 3rd and is NOT retried again the same day**; `test_push_service.py`
      (404/410 deletes the subscription and returns `"gone"`; 401/403 does NOT delete and returns
      `"auth_failed"`); `test_reminder_alert_throttle.py` (majority-`auth_failed` in one run
      triggers the elevated Telegram alert; **a second run within 6 hours that also qualifies
      does NOT re-trigger it; a run more than 6 hours later does**);
      `test_admin_reminder_toggle.py` (auto-send endpoint includes the new key, superadmin-gated).
- [ ] Regression: re-run `tests/test_streak.py`, `tests/test_stats_query_efficiency.py`,
      `tests/test_scheduler.py` to confirm the `activity_sources.py`/`app_settings.py`
      extractions are behavior-preserving and `/me/stats`'s actual query/streak logic is
      genuinely untouched (only the list of source tables it iterates is now shared).
- [ ] Playwright autotest added: `frontend/tests/reminder-settings.spec.ts` — toggle + time
      input render in the Other tab; saving persists via the `PATCH /me/settings` request body;
      `Notification.requestPermission`/`navigator.serviceWorker` stubbed so it doesn't depend on
      real browser push permission.
- [ ] Design-system regression: `npx playwright test design-system-parity.spec.ts`.
- [ ] Smoke: `/dashboard/settings` → Other tab, verify the new checkbox/time input render and
      match existing design tokens.
- [ ] Edge case: `PATCH /me/settings` with `reminder_time: "25:99"` → 422.
- [ ] Edge case: `POST /me/push/subscribe` with `timezone: "Not/A_Zone"` → 422.
- [ ] Auth gate: `POST /me/push/subscribe` without a token → 401.
- [ ] Manual QA (push delivery can't be automated — real browser permission + push-service
      round trip required): Chrome desktop grant → `PushSubscription` row appears with correct
      endpoint/keys/timezone; set `reminder_time` a couple minutes out and confirm delivery +
      click opens `/dashboard`; confirm "studied today" suppresses the push; seed data to hit
      each of the 3 message tiers and confirm copy; toggle `auto_send_reminder_push` off in
      `/dashboard/admin` and confirm no sends; unsubscribe via settings and confirm the DB row
      is gone; re-subscribe the same browser under a second test account and confirm the first
      account stops receiving pushes to that device.
- [ ] News post written and published via /news-writer.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
