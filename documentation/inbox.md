# In-app inbox (#23)

Fluent's only outbound channel used to be email. This adds a personal inbox inside the site:
an envelope in the header, a minimal Gmail-style message list at `/dashboard/inbox`, a
superadmin broadcast composer, and automatic celebration/mirror messages. See
`plans/improvements/active/plan_23_inbox.md` for the full requirements this implements.

## Data model — fan-out at send time, not audience-at-read-time

`InboxMessage` (the content, written once) and `InboxDelivery` (one row per recipient, written
in bulk at send time) are separate tables. The alternative — storing only an audience filter and
resolving "does this message apply to me" at read time — was rejected: it would mean re-running
segment SQL (premium/free/inactive) on every inbox read, and a user's read/delete state has
nowhere to live without a per-recipient row anyway. Fan-out costs one bulk INSERT regardless of
recipient count (a broadcast to "all" is ~146 rows, see below), so the write-time cost is cheap
and the read-time cost drops to zero.

`UserAchievement` is a separate ledger table (`UniqueConstraint(user_id, key)`), not a JSON blob
on `User` — the unique constraint doubles as the race guard (see "Achievement race guard" below),
and it needs no new `User` column (see "No migration needed" below).

## No migration needed — tables only, no new `User` column

`main.py` startup runs `create_db_and_tables()` → SQLModel's `create_all()`, which creates
missing *tables* on every boot. No Alembic revision in `backend/migrations/versions/` has ever
created a table — this plan doesn't either, it just relies on the same mechanism three new
tables get created by. New *columns* on an existing table are a different, harder case: they
500 every `select(Model)` on that table until an Alembic migration is run by hand
(`documentation/local-dev-gotchas.md`), and Render's `buildCommand` never runs Alembic
automatically. So this feature deliberately adds zero columns to `User` — every per-user fact
(deliveries, achievements) lives in its own new table instead.

## FK delete order (#21's gotcha, again)

`backend/models.py` declares no `relationship()`s, so SQLAlchemy ORM deletes are not
dependency-ordered — a `session.delete(user)` doesn't know it must delete `InboxDelivery`/
`UserAchievement` rows first. `backend/routers/admin.py::_delete_user_data` uses Core
`sa_delete` statements in explicit written order instead, and both new tables were added there.
`backend/tests/test_inbox.py` exercises user delete under `conftest.enforce_foreign_keys()`,
which is what actually catches an ordering mistake — SQLite's test DB otherwise ignores FKs
(`documentation/testing-foreign-keys.md`).

## Achievements: evaluated inside `GET /me/stats`, not a separate job

`award_achievements()` runs on every `GET /me/stats` call using values that endpoint already
computed (`known`, `streak`, `grammar_lessons_passed`, `practice_exams_completed`,
`phrases_learned`) — there is no cron/background pass scanning all users for milestones. This
keeps the check as cheap as the request that's already happening (StatsBar calls it on every
dashboard load and tab refocus) instead of adding a second read path.

**Grandfathering.** A user with zero rows in `UserAchievement` is being evaluated for the first
time. That call silently records every currently-reached key plus a sentinel `_init`, and sends
no messages — otherwise every pre-feature user with a 400-day streak would get flooded with every
milestone message at once on the first request after deploy. A brand-new account has reached
nothing yet at this point, so its later milestones are still celebrated normally.

**Race guard.** Two concurrent `/me/stats` calls for the same user (e.g. two open tabs) must not
send the same celebration twice. The insert is
`INSERT INTO user_achievement (...) ON CONFLICT (user_id, key) DO NOTHING RETURNING key`
(`sqlalchemy.dialects.postgresql`/`sqlite` `insert`) — only the call whose row actually landed
gets the key back in `RETURNING`, and only returned keys get a message sent. The `UniqueConstraint`
is the source of truth; there is no application-level lock.

**Why word milestones stop at 250.** `WORD_MILESTONES = (100, 250)`. The CEFR thresholds
(`AppSetting['cefr_thresholds']`, defaults A1=500/A2=1000/B1=2000…) take over from there — without
the cut-off, crossing 500 known words would fire both a `words:500`-style message (if one existed)
and a `cefr:A1` message for the same underlying event. There's no `words:500`+ milestone at all;
250 is the last one before CEFR levels become the celebration.

## Caching — built entirely on #24's `backend/cache.py`

Neon caps network transfer (#15) and each extra round trip costs ~0.2–0.3s in production
(`documentation/production-db-latency.md`), so every read this feature adds goes through
`cache.get_or_load` rather than hitting the DB. `inbox_service.py` has no cache plumbing of its
own — no dicts, no locks, no session listeners.

| Loader | Key | Tags | TTL | Why it's safe to cache |
|---|---|---|---|---|
| user's delivery flag rows (id, message_id, read_at, deleted_at, created_at — no text) | `("inbox_deliveries", user_id)` | `inbox_delivery:user=<user_id>` | 5 min | every write to this user's rows is tagged with their id |
| message content (kind, source, titles, bodies, CTA) | `("inbox_message", message_id)` | `inbox_message:pk=<id>` | default | immutable after send; retract's Core delete evicts the whole family |
| awarded achievement keys | `("achievements", user_id)` | `user_achievement:user=<user_id>` | default | the DB unique constraint + `ON CONFLICT` is the actual source of truth, the cache just avoids re-reading it |
| CEFR thresholds | reuses #24's existing `("setting", "cefr_thresholds")` loader | `app_setting` | default | admin threshold changes evict it, shared with the existing admin endpoint |

**After-commit eviction, narrowed by `cache_tags`.** A bare Core `INSERT`/`UPDATE`/`DELETE`
would otherwise evict every user's cached inbox (the whole-table tag) — `send()`'s delivery
insert and every `/me/inbox/actions` write instead pass
`.execution_options(cache_tags={f"inbox_delivery:user=<id>", ...})` so a broadcast to 146 users
only evicts those 146 cache entries, and one user's "mark as read" only evicts their own. Retract
and user-delete stay whole-table (they're rare, and correctness there matters more than the
saved eviction).

**Resulting Neon cost with a warm cache:** `GET /me/inbox/unread-count`, `GET /me/inbox` (any
offset), and `GET /me/inbox/{id}` all issue **zero** SQL statements. Any action (read/delete/
undelete) issues one write plus one small reload of that user's flag rows, and the next list
read reuses that reload. `GET /me/stats` gains achievement evaluation at zero added round trips
in steady state (nothing new to award). Confirmed by statement-count guard tests in
`test_inbox.py` (the same `before_cursor_execute`-listener technique as `test_verb_lookup.py`,
not wall-clock timing).

**Deliberately not cached:**
- **Admin send recipient resolution** (`_resolve_recipients` in `routers/inbox.py`). It must
  reflect premium/activity *at the moment of sending* — a user who just bought Premium must not
  receive a "buy Premium" broadcast a stale cache still thinks is accurate.
- **Admin sent-history read counts** (`GET /admin/inbox`). Admin-only, rare, and stale counts
  would actively mislead an admin checking whether a broadcast landed.
- **`/me/stats` itself.** Progress and `now`-relative data is never cached, per #24's rule — only
  the *achievement ledger and thresholds it reads inside that handler* are.

## Stripe webhook placement — after the entitlement commit, never before

`notify_premium_welcome()` is called from the `checkout.session.completed` handler in
`billing.py`, but only **after** the handler's existing entitlement `session.commit()`, in its
own `try: send(); session.commit() / except: session.rollback(); logger.exception(...)`. If the
inbox write were folded into the same transaction as the entitlement grant and it failed, it
would roll back the Premium grant along with it — a customer who just paid Stripe would have no
Premium and the webhook would 500, causing Stripe to retry a payment that already succeeded. The
webhook must return 200 regardless of whether the inbox write succeeds; `test_inbox.py` patches
`notify_premium_welcome` to raise and asserts the webhook still returns 200 and the user is still
Premium. Only `checkout.session.completed` is touched — `invoice.paid`,
`customer.subscription.updated`, cancellation and payment-failed handling are unchanged. Stripe's
own event redelivery can duplicate the welcome message on a retry; this is accepted, the same
stance the handler already takes for its Telegram ping (no processed-event table).

## Frontend request discipline

The unread badge is mounted in `Header.tsx` on every page for every logged-in user, so its
request pattern matters more than most components': it fetches on mount, on `visibilitychange`
→ visible (throttled to once per 60s), and on a `fluent:inbox-changed` window event — **never**
on pathname/route change, which would otherwise add an auth lookup + query to every navigation
for every user (~0.5s of DB time per the same round-trip cost above). Where the answer is
already known, no fetch happens at all: an action response's `unread`, or `/me/stats`'s
`new_inbox_messages` delta, is dispatched on `fluent:inbox-changed` and applied locally
(`frontend/lib/inbox.ts`'s `notifyInboxChanged`). Playwright's request-avoidance assertions in
`inbox.spec.ts` are the executable guard for this.

## Deliberate deviations from the design system (recorded here and in the component library)

- **Dropdown elevation shadow** (`shadow-[0_6px_20px_rgba(0,0,0,0.08)]` on the envelope dropdown)
  — cards are normally flat/no-shadow, but a dropdown floating over page content needs visual
  separation a flat border doesn't give at this size.
- **Unread badge's 2px `ring-2 ring-white` cut-out ring** — badges are normally borderless filled
  pills; here the ring is invisible against the white header background and exists only so the
  badge reads as a clean cut-out where it overlaps the envelope glyph's stroke, matching the
  Microsoft Teams reference screenshot.
- **`PageMascot` only in the inbox's empty state**, not beside the title like every other
  top-nav page — a dense Gmail-style row list has no room for a 128px mascot next to the title;
  it only appears when there's nothing else to show.

See "Notification badge (Teams-style)" and the "Inbox" shell entry in
`documentation/design system/Component Library (as-built).html` for the visual spec, and its
"Deliberate deviations" table for the three rows above.

## What is NOT in scope (see the plan's Non-Goals for the full list)

No email/push delivery of inbox messages, no two-way chat (Reply routes through the existing
anonymous Feedback endpoint), no scheduled/delayed sends or edit-after-send, no markdown/HTML
bodies, no external CTA URLs, no realtime transport, no per-user inbox opt-out, and deliberately
none of Gmail's non-essential controls (search, folders, bulk actions, star, archive, etc. — the
plan's "Not rendered, by design" list and `inbox-buttons.spec.ts`'s "nothing extra rendered"
assertions are the enforcement mechanism for that last one).
