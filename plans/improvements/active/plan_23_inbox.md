---
kind: feature
status: approved
iteration: 0
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# #23 — In-app Inbox (envelope menu, admin broadcasts, achievements)

> **Depends on #24** (`plan_24_neon-transfer-caching.md`). Implement #24 first: this plan's
> caches use `backend/cache.py`, and #24 caches the `require_user` lookup app-wide.

## Context

Fluent has no way to talk to users *inside* the site. Everything outbound today is email:
superadmin ad-hoc email (`admin.py::send_email_to_user`), weekly leaderboard reward/notice
(`PreparedMessage` + `scheduler.py::send_weekly_rewards` / `admin.py::send_prepared_message`),
report-status emails (`reports.py::_notify_reporter`), inactive re-engagement drafts. Users
without email consent get nothing, and there is no place to upsell or celebrate.

The user wants a small envelope with an unread badge **left of the RU/EN switcher** in
`frontend/components/Header.tsx`, opening a personal inbox, so admins can reach one user or a
segment, upsell, and celebrate achievements.

Confirmed via clarifying questions:
- **Audience:** single/selected users (search by name/email), all, premium, free, inactive N+ days.
- **Sources:** manual admin sends **plus** automatic achievements (streak milestones, words
  learned, CEFR level reached, first grammar lesson / first practice exam / 100 phrases) **plus**
  mirrors of existing flows (leaderboard reward/notice, report status, Premium activated).
  Not selected: news posts, re-engagement emails.
- **Format:** RU+EN title/body (like `NewsPost`), optional CTA button (label RU/EN + URL), a
  `kind` (info / celebration / offer) that sets the accent.
- **UX:** envelope opens a **dropdown preview** (latest 5 + "All messages" link to
  `/dashboard/inbox`).
- **Email copy for manual sends:** no, inbox only. Existing email flows keep emailing unchanged.
- **Replies:** "Reply" opens the existing `FeedbackModal` prefilled with `Re: <title>`.
- **Neon network transfer is limited (added in review):** cache every read this feature adds
  wherever it is safe, to cut Neon traffic. See "Caching" under Requirements.
- **Inbox UX (review):**
  - **Look:** Gmail's list and message view (dense rows, bold unread, snippet, Gmail-style dates).
  - **Controls:** only the essential buttons from a user's perspective. The user trimmed a
    Gmail-parity draft down to this.
  - **No folders.**
  - **Unread badge:** looks like the Microsoft Teams app-icon badge (user's screenshot) — a filled
    red circle overlapping the icon's top-right corner, with a bold white count.
  - **Every rendered button must work.** Anything non-essential isn't rendered at all. Visuals
    stay Fluent (design-system tokens, Inter, emerald accent).

Facts found in the code that shape the design:
- **No migration needed.** `main.py` startup runs `create_db_and_tables()` → `create_all()`,
  which creates missing *tables*. No Alembic revision in `backend/migrations/versions/` has ever
  created a table. New *columns* are different: they 500 every `select(Model)` until Alembic is
  run by hand (`documentation/local-dev-gotchas.md`), and Render's `buildCommand` never runs
  Alembic. So this plan adds **only new tables and no `User` column**.
- **FK delete order gotcha (#21):** `models.py` declares no `relationship()`s, so ORM deletes
  are not dependency-ordered, and SQLite tests don't enforce FKs. New `user_id` FK tables must
  be added to `admin.py::_delete_user_data`. Deletes use Core `sa_delete` statements, which run
  in written order. Tests use `conftest.enforce_foreign_keys()`.
- **Remote DB cost (#15, #22), measured 2026-09-11:** Neon is `us-east-1`; `render.yaml` sets no
  region (Render default: Oregon). Production `GET /api/admin/settings/cefr-thresholds` (1 query)
  is ~550ms slower server-side than `GET /api/billing/config` (no DB), so **each extra round trip
  in a request path costs ~0.2–0.3s in production**, not ms. Hence: no per-navigation fetches,
  zero added queries on `/me/stats` in steady state, bulk inserts only. Scale is small: 146
  users (100 active in 30d, 6 premium), so a broadcast to "all" is ~146 rows.
- `GET /me/stats` (`routers/words.py`) already computes `known`, `streak`,
  `grammar_lessons_passed`, `practice_exams_completed`, `phrases_learned`. CEFR thresholds live in
  `AppSetting['cefr_thresholds']` (defaults A1=500, A2=1000, B1=2000… seeded in `main.py`).
  StatsBar refetches stats on mount and `visibilitychange`.
- `GET /admin/users` returns **all** users unpaginated, so the composer's name search can filter
  the already-loaded list client-side.
- `news.py` mixes `/news` and `/admin/news` in one router under prefix `/api`. That is the
  precedent for one `inbox.py` router.
- Design system: no decorative emoji (TAK policy), so kinds are shown as filled pills, not 🎉.
  Icon-only buttons need a 44×44 tap area. Pills are `rounded-full`, borderless and filled. Cards
  are flat `border-line rounded-[14px]`. Every non-admin page shows exactly one `PageMascot`.
- Playwright specs mock `/api/**` per test. ~90 existing specs won't mock the new unread-count
  endpoint, so its fetch must fail silently.
- Plan #19 (web push, draft) is unrelated to this and doesn't conflict. Neither plan adds a migration.

**Model rationale:** `opus`/`high`. The change touches the Stripe webhook, the scheduler, a
superadmin broadcast that can reach every user, a race-safe dedupe on a hot endpoint, and the
shared header shown on every page.

## Goals

- Logged-in users see an envelope icon left of RU/EN with a **Teams-style unread badge**: a red
  circle on the icon's top-right corner, white bold count, up to "99+".
- Clicking it opens a dropdown with the latest 5 messages, "Mark all as read" (only when
  something is unread) and "All messages" → `/dashboard/inbox`.
- `/dashboard/inbox` is a **minimal, Gmail-looking message list**. From a user's perspective it
  does exactly what's needed: open a message, use its button, Reply, Delete (with Undo), mark
  everything read, show older messages. **12 controls in total**, each covered by a Playwright test.
- Superadmins compose bilingual messages in Admin → Messages → **Inbox** and send them to:
  selected users (name/email search), all, premium, free, or inactive N+ days. They see the
  recipient count in a confirm step before sending, plus a sent history with read counts and retract.
- Users automatically receive celebration messages for streak / words / CEFR / first-lesson /
  first-exam / 100-phrases milestones, once each. Existing users don't get a retroactive flood.
- Leaderboard reward/notice, report status changes, and Premium activation also land in the inbox.

## Non-Goals

- No email or push delivery of inbox messages. Existing email flows are unchanged. Push is #19.
- No two-way chat. Replies go through the existing anonymous Feedback endpoint.
- No scheduled or delayed sends, expiry, or edit-after-send. Retract (delete) only.
- No markdown/HTML in bodies. Plain text with line breaks.
- No external CTA URLs. Internal paths only.
- No realtime (WebSocket/SSE) and no refetch on every route change. The badge refreshes on page
  load, when the tab becomes visible again (at most once per 60s), and on a
  `fluent:inbox-changed` window event. A broadcast shows up on the next load or tab refocus.
- No change to StatsBar's #16 localStorage milestone nudge.
- News posts and re-engagement emails are not mirrored. Users excluded from leaderboard drafts
  today (no email consent) stay excluded.
- **Not rendered, by design (minimal controls):**
  - search; selection checkboxes, bulk actions and the select menu
  - star; mark as unread; refresh
  - a pagination counter/arrows (replaced by "Show older"); newer/older inside a message
  - hover quick actions on rows; a snackbar close × (it auto-hides)
  - folders of any kind, archive, a Trash view, "delete forever"
  - compose, forward, reply-all, threads; snooze, spam, "important", attachments, print
  - keyboard shortcuts, swipe gestures
  - **category tabs (Primary/Promotions/…):** a Promotions tab would hide exactly the upsell
    messages this feature exists to deliver. The message kind is shown as a label chip instead.
- No per-user inbox opt-out.

## Requirements

### Data model (new tables only)
- `InboxMessage` (`inbox_message`): `id`, `kind` (`info|celebration|offer`), `source`
  (`admin|achievement|leaderboard|report|premium`), `title_ru`, `title_en`, `body_ru`, `body_en`,
  `cta_label_ru?`, `cta_label_en?`, `cta_url?`, `audience?` (admin history label, e.g. `premium`,
  `inactive:30`, `users:3`), `created_at`.
- `InboxDelivery` (`inbox_delivery`): `id`, `message_id` FK index, `user_id` FK index,
  `read_at?`, `deleted_at?`, `created_at`. One row per recipient
  (fan-out at send time). `deleted_at` is a soft delete that exists only so the Undo snackbar
  can restore a message. Deleted rows are hidden everywhere and hard-deleted by the daily purge
  after 24h.
- `UserAchievement` (`user_achievement`): `id`, `user_id` FK index, `key`, `created_at`,
  `UniqueConstraint(user_id, key)`. Ledger of awarded milestone keys.

### User API (JWT-verified on every call; users only ever see their own deliveries)
- Auth via `require_user`. #24 caches its DB lookup app-wide, so no inbox-specific auth code.
  Data is served from the caches below.
- `GET /api/me/inbox/unread-count` → `{unread}`. Unread, not deleted.
- `GET /api/me/inbox?limit=20&offset=0` (limit 1–50, offset ≥ 0; 422 otherwise) →
  `{items:[{id (delivery id), kind, source, title_ru, title_en, snippet_ru, snippet_en,
  created_at, read}], has_more, unread}`. Newest first, deleted rows excluded. Snippets are the
  first ~120 chars of the body; **no full bodies in the list**. Paged in Python over the user's
  cached rows (see Caching).
- `GET /api/me/inbox/{id}` → `{item}` with full bodies, CTA and `read`. 404 if the delivery isn't
  the caller's or is deleted.
- `POST /api/me/inbox/actions`, body `{action, ids?: int[] (1–500) | all?: true}`. Exactly one of
  `ids`/`all`, and `all` is allowed only with `read` ("Mark all as read"); 422 otherwise.

  | action | SQL effect (always `AND user_id = :uid`) | precondition in `WHERE` | used by |
  |---|---|---|---|
  | `read` | set `read_at` | not deleted, unread | opening a message; "Mark all as read" |
  | `delete` | set `deleted_at` | not deleted | Delete |
  | `undelete` | clear `deleted_at` | deleted | Undo |

  - One `UPDATE … RETURNING id` (Postgres + SQLite ≥3.35).
  - Response `{affected_ids, unread}`. Ids that aren't the caller's, or that fail the
    precondition, aren't in `affected_ids`, so Undo restores **exactly** what was deleted.

### Caching — minimize Neon network transfer (built on #24's `backend/cache.py`)
Neon caps network transfer (#15), and each round trip costs ~0.2–0.3s in production. Every read
this feature adds goes through `cache.get_or_load`. #24 already provides plain-data values,
deepcopy on read, eviction applied after commit from the SQL actually committed, the
stale-refill guard, the TTL safety net and the test autouse `cache.clear()`. **No hand-rolled
dicts, locks or session listeners in `inbox_service`.**

| Loader | Key | Tags | TTL | Why it's safe |
|---|---|---|---|---|
| user's deliveries: all `(delivery_id, message_id, read_at, deleted_at, created_at)`, newest first, **no text** | `("inbox_deliveries", user_id)` | `inbox_delivery:user=<user_id>` | 5 min | every delivery write is tagged for its user (below) |
| message content (kind, source, titles, bodies, CTA) for the missing ids, one `WHERE id IN (…)` | `("inbox_message", message_id)` | `inbox_message:pk=<id>` | default | immutable after send; retract's Core delete evicts all `inbox_message*` |
| awarded achievement keys (`key` column only) | `("achievements", user_id)` | `user_achievement:user=<user_id>` | default | DB unique constraint + `ON CONFLICT` is the source of truth |
| CEFR thresholds | reuse #24's row-21 loader | `app_setting` | default | admin changes evict it |

Precise eviction. Core statements would otherwise evict every user's entries (bare table tag),
so the per-user ones narrow themselves with `.execution_options(cache_tags=…)`:
- `send()`'s bulk delivery insert → `{f"inbox_delivery:user={u}" for u in recipients}`.
- Every `/me/inbox/actions` `UPDATE`/`DELETE` → `{f"inbox_delivery:user={uid}"}`.
- Achievement `INSERT … ON CONFLICT` → `{f"user_achievement:user={uid}"}`.
- Retract and user delete stay table-level. They're rare, so evicting everyone's inbox entries is fine.

Resulting Neon cost with a warm cache:
- `GET /me/inbox/unread-count`: **0** statements (auth cached by #24, deliveries cached here).
- `GET /me/inbox` (any offset) and `GET /me/inbox/{id}`: **0**, served from cached rows + cached
  message content.
- Added to `GET /me/stats`: **0**.
- Any action (open, mark all as read, delete, Undo): 1 write, plus 1 small reload of the user's
  flag rows for `unread`. The next list read reuses that reload.
- `# ponytail:` in-memory paging loads all of a user's delivery rows (ids/flags, ~50 bytes each).
  Move paging into SQL only if a user ever exceeds ~5k deliveries.

Transfer hygiene where caching isn't possible:
- Select only the columns needed: segment resolution selects `User.id`; the ledger selects
  `key`; the deliveries load carries no text; admin history selects
  `id, kind, title_ru, title_en, audience, created_at` + counts, never bodies.
- `expire_on_commit` (#22): never touch an ORM object after a commit in these paths. Capture
  `user.id`, `is_premium_active(user)` etc. *before* committing (webhook, `get_stats`,
  `set_premium`). Otherwise SQLAlchemy silently re-`SELECT`s the whole row.
- A send's deliveries are one bulk insert regardless of recipient count, never a per-user loop.

Deliberately **not** cached:
- Admin send recipient resolution. It must reflect premium/activity at the moment of sending: a
  user who just bought Premium must not get a "buy Premium" offer.
- Admin history read counts. Admin-only and rare; stale counts would mislead and the saving is ~0.
- `/me/stats` results. Progress and `now`-relative, per #24's never-cache rule.

### Admin API (superadmin, matching the existing Messages tab)
- `POST /api/admin/inbox` body: `audience` (`users|all|premium|free|inactive`), `user_ids`
  (required for `users`, 1–5000), `inactive_days` (required for `inactive`, 1–3650), `kind`,
  titles/bodies, optional CTA, `dry_run` (default false).
- Server-side validation (422): titles non-empty after strip and ≤120 chars; bodies ≤4000 chars;
  `kind` must be in the set; `cta_url` must match `^/(?!/)` and be ≤500 chars (rejects `javascript:`,
  `//host`, `https://`); CTA URL and both labels all-or-none; zero resolved recipients → 422.
- Segments are resolved in SQL. Premium mirrors `quota.is_premium_active`:
  `is_premium AND (premium_until IS NULL OR premium_until > now)`. Free is its negation.
  Inactive = `COALESCE(last_login, created_at) < now - N days`.
- `dry_run` returns `{recipients}` and writes nothing. A real send returns
  `{message_id, recipients}`, with deliveries inserted in one executemany.
- `GET /api/admin/inbox` returns `source='admin'` messages newest first (limit 100) with
  `recipients` and `read` counts from one grouped query, with no body columns.
- `DELETE /api/admin/inbox/{message_id}` retracts: Core-delete deliveries, then the message.

### Automatic messages
- `inbox_service.send(session, user_ids, *, kind, source, …)` is the single write path used by
  everything below. It does not commit; the caller's transaction commits.
- **Achievements** are evaluated inside `GET /me/stats` from values it already computed. Keys:
  `streak:7|30|100|365`, `words:100|250`, `cefr:A1…C2` (known ≥ threshold, level `0` excluded),
  `grammar:first`, `exam:first`, `phrases:100`. Words stop at 250 because the default CEFR
  thresholds (500/1000/2000) take over from there. Without that cut-off, 500/1000/2000 would
  double-celebrate.
  - **Zero added round trips in steady state** (stats runs on every `/dashboard/lists` load and
    tab refocus). Thresholds and awarded keys come from the "awarded keys" and "CEFR thresholds"
    caches (see Caching).
  - Load existing keys (cache miss only: 1 query). **If the user has no rows at all**, this is their first
    evaluation. Silently record `reached ∪ {"_init"}` with no messages. Pre-feature users get no
    retroactive flood. New users hit this on their first dashboard load, when nothing is reached
    yet, so their later milestones are still celebrated.
  - Otherwise insert `reached − existing` with dialect `INSERT … ON CONFLICT DO NOTHING RETURNING
    key` (`sqlalchemy.dialects.postgresql`/`sqlite` `insert`). Send one message per key actually
    returned, so two concurrent stats calls can't double-send.
  - Celebration copy is bilingual constants in `inbox_service`. Non-premium users get CTA
    "Premium" → `/pricing` (same upsell stance as #18). Premium users get no CTA.
  - The stats response gains `new_inbox_messages: int`.
- **Leaderboard:** when a `reward`/`notice` `PreparedMessage` flips to `sent`, in both
  `admin.py::send_prepared_message` and `scheduler.py::send_weekly_rewards`, also send an inbox
  message (reward: top-3 + 7 days Premium; notice: top-5). Use a shared helper so the two paths can't drift.
- **Report status:** `_notify_reporter` sends the inbox message **before** the email-consent early
  return (inbox isn't email). Kind `info`. Includes a ≤200-char excerpt of the report and the
  status copy. Covers `open|onhold|resolved`.
- **Premium activated:** billing webhook `checkout.session.completed`, and `admin.py::set_premium`
  when `is_premium=True` and the target was not `is_premium_active` before. Kind `celebration`,
  CTA → `/dashboard`. The leaderboard grant doesn't trigger this because it has its own message.
  - **Stripe webhook placement is strict:** the welcome goes **after** the handler's existing
    entitlement `session.commit()`, next to the Telegram ping, in its own `try: send(); commit()
    / except: rollback + logger.exception`. Never before that commit: a failed insert there would
    poison the session and roll back the Premium grant itself (paid user, no Premium, 500 →
    Stripe retries). The webhook must still return 200 if the inbox write fails.
  - Only `checkout.session.completed`. `invoice.paid`, `customer.subscription.updated`, cancel
    and payment-failed are untouched. No change to entitlement logic, Stripe API calls, checkout,
    portal, prices or `subscription_status`.
  - Stripe redelivery of the same event can duplicate the welcome message. Accepted, same stance
    the handler already documents for the Telegram ping (no processed-event table).
- **Deleted-row purge:** a daily `scheduler.py` job issues one Core
  `DELETE FROM inbox_delivery WHERE deleted_at < now - 24 hours`. By then the Undo window is long
  gone.
- Inbox writes in mirrored flows must never break the surrounding action. Wrap them the way
  `_notify_reporter` swallows email errors, with `logger.exception`.

### Frontend
- `InboxMenu` in Header, rendered before the RU/EN toggle, only when authed.
  - 44×44 icon button with an inline 20px SVG envelope (`text-muted-nav hover:text-ink`).
  - **Unread badge — Teams app-icon style:**
    - **Placement:** absolutely positioned on a `relative` wrapper around the envelope glyph (not
      the 44px hit area). Its centre sits on the glyph's top-right corner, so about half of it
      overlaps the envelope and half sticks out, as in the screenshot. Nothing in the header may
      clip it.
    - **Shape:** 18px tall and `rounded-full`. A **perfect circle** for 1–9 (width = height), a
      pill for 10–99 (`min-w-[18px] px-[5px]`), and "99+" above 99.
    - **Colour and type:** filled `bg-destructive` (#c2504a, the closest existing red token; white
      text on it is ~4.6:1 contrast, AA for small bold text), `text-white`, `text-[11px]
      font-bold tabular-nums leading-[18px]`, centred.
    - **Cut-out ring:** a 2px ring in the header background colour (`ring-2 ring-white`), so where
      the badge overlaps the envelope's stroke it reads as a clean cut-out, like the icon edge in
      the screenshot. The design system says badges are never outlined, so record this as a
      deliberate deviation: the ring is invisible against the header and only separates the badge
      from the glyph.
    - **Hidden at 0.** No empty dot, no animation.
    - **Accessibility:** the badge is `aria-hidden`. The button's `aria-label` carries the count:
      "Входящие, 6 непрочитанных" / "Inbox, 6 unread" (plain "Входящие"/"Inbox" at 0).
  - Fetches unread count on mount, on `visibilitychange` → visible (skipped if the last fetch was
    <60s ago) and on `fluent:inbox-changed`. **Not** on `pathname` change: that would add an
    auth lookup + `COUNT` (~0.5s of DB time) to every navigation for every user. Failures are
    silent (no `console.error`). The dropdown shows a loading row while `?limit=5` is in flight.
  - **Avoid requests entirely where the answer is already known.** `fluent:inbox-changed` may
    carry `detail.unread` (the `unread` every action response returns) or `detail.delta`
    (+N from stats' `new_inbox_messages`), and the header applies it locally with no fetch. Only an
    event without detail triggers a fetch. The dropdown reuses its last list for 60s unless an
    event arrived in between.
  - Dropdown: `bg-white border border-line rounded-[14px]` plus a light elevation shadow (record
    as deviation), width `min(20rem, 100vw-2rem)`, right-aligned, closes on outside click. Opening
    it fetches `?limit=5`. Items show an unread emerald dot, bold title if unread, a 2-line
    snippet (`text-muted`) and a Gmail-style date (`text-faint`). Clicking an item opens that
    message: `/dashboard/inbox?m=<id>`. The header row has "Mark all as read"
    (`actions {read, all:true}`), **shown only when unread > 0**. The footer has an
    `emerald-600` "All messages" link. Empty state: "Нет сообщений".
- **`/dashboard/inbox` — minimal, Gmail-looking message list.** Visuals are Fluent: tokens only,
  Inter, emerald accent, `line` borders, no shadows.
  - **URL state:** `?m=<id>` opens a message, and browser Back returns to the list. Use
    `useSearchParams` inside `<Suspense>` + `router.push(…, {scroll:false})`, the existing
    pattern in `ArticlesList.tsx`.
  - **List view** (single column inside `.page`, same on desktop and mobile):
    - Title row: "Входящие"/"Inbox" with the unread count, and a "Прочитать все"/"Mark all as
      read" text button at the right, **only when unread > 0**.
    - **Rows** (Gmail look):
      - Content: unread dot · sender "Fluent" · kind label chip (filled pill, only for
        `celebration`/`offer`) · **subject** — snippet (`text-muted`, one line, truncated) · date
        at right.
      - Date: today → `14:03`; this year → `11 сент.`/`Sep 11`; older → `11.09.2025`, via
        `Intl.DateTimeFormat(lang)`. Full date in the `title` tooltip.
      - Unread rows: white background, `font-semibold text-ink`. Read rows: `chip` background,
        normal weight.
      - Below 860px, rows go two-line (sender + date, then subject — snippet).
      - With no nested controls, each row is a single `Link` to `?m=<id>` (≥44px tall).
    - "Показать более ранние"/"Show older" secondary button at the bottom, **only when
      `has_more`**, appending the next 20.
  - **Message view** (replaces the list, as in Gmail):
    - "← Назад"/"Back" at the top.
    - Header: subject (`text-xl font-semibold`) + kind chip.
    - Sender row: "F" avatar circle (`bg-emerald-600`, same as Header's avatar fallback), "Fluent",
      a muted source label (Команда / Достижения / Рейтинг / Отчёты / Premium), and the full date
      + relative time via `Intl.RelativeTimeFormat` ("11 сент. 2026, 14:03 (2 часа назад)").
    - Body `whitespace-pre-line`.
    - The message's CTA as a primary button (`Link`, `rounded-[10px] bg-emerald-600`), **only if
      it has one**.
    - Bottom row: "Ответить"/"Reply" (secondary: white, `border-[#ddd]`, `rounded-[10px]`) and
      "Удалить"/"Delete" (text button, `destructive` token).
    - Opening an unread message marks it read (optimistic `read` action).
  - **Delete:** no confirm dialog. Delete returns to the list with the row gone and shows an Undo
    snackbar (bottom-left, `bg-ink text-white rounded-[10px]`): "Сообщение удалено ·
    Отменить". Undo sends `undelete` with the returned `affected_ids` and the row reappears in
    place. The snackbar auto-hides after 7s.
  - **Optimistic actions:** the UI updates immediately. On failure, revert and show the snackbar
    with an error message. Every action response's `unread` is dispatched as
    `fluent:inbox-changed` `detail.unread`.
  - **Empty state:** "Нет сообщений", with the page's single `PageMascot`. The mascot appears only
    in the empty state, because a dense list has no room for a 128px mascot. Record this as a
    deliberate deviation.
  - **Loading:** skeleton rows. A failed load shows an inline error row with "Повторить"/"Retry".
  - **Button contract — the complete list of controls.** Every one works, and nothing else is
    rendered. Each row is exercised by `inbox-buttons.spec.ts`:

    | # | Control | Where | Shown when | Effect | Request |
    |---|---|---|---|---|---|
    | 1 | Envelope | header | logged in | toggle dropdown | `GET /me/inbox?limit=5` (60s reuse) |
    | 2 | Message row | dropdown | always | open `/dashboard/inbox?m=<id>` | — |
    | 3 | Mark all as read | dropdown | unread > 0 | all read, badge → 0, button hides | `actions {read, all:true}` |
    | 4 | All messages | dropdown footer | always | go to `/dashboard/inbox` | — |
    | 5 | Mark all as read | inbox title row | unread > 0 | same as #3 | `actions {read, all:true}` |
    | 6 | Message row | inbox list | always | open message; marks read if unread | `GET /me/inbox/{id}`, `actions {read}` |
    | 7 | Show older | end of list | `has_more` | append the next 20 | `GET ?offset=` |
    | 8 | ← Back | message view | always | back to the list (history) | — |
    | 9 | CTA | message view | message has a CTA | navigate to `cta_url` | — |
    | 10 | Reply | message view | always | Feedback modal prefilled `Re: <title>` + email | `POST /feedback` on send |
    | 11 | Delete | message view | always | back to list, row gone, Undo snackbar | `actions {delete}` |
    | 12 | Undo | snackbar | 7s after a delete | row reappears in place | `actions {undelete}` |

    Plus "Retry" on a failed load (reruns the failed GET), which only exists in the error state.
- `FeedbackModal` gains optional `initialMessage` / `initialEmail` props. The inbox passes
  `Re: <title>\n\n` and the JWT email.
- `StatsBar` dispatches `fluent:inbox-changed` with `detail.delta = new_inbox_messages` when it
  is > 0, so the badge updates without a reload or a fetch.
- Admin → Messages gets a 4th sub-tab, **Inbox**:
  - Audience radio. `users` shows a search input filtering the loaded `users` by name/email with
    checkboxes and a selected-count. `inactive` shows a days input.
  - Kind select, RU/EN title+body, optional CTA label RU/EN + URL.
  - Send runs `dry_run` → `confirm("Send to N users?")` → real send.
  - Sent-history table (title, audience, recipients, read, date, retract).
  - All strings go through i18n (see `issue-23-admin-panel-translation.spec.ts`).

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. **Applies**: Header (shared shell) changes.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [ ] 1. `backend/models.py` — add `InboxMessage`, `InboxDelivery` (incl. `deleted_at`), `UserAchievement` (with
  `__table_args__ = (UniqueConstraint("user_id", "key"),)`). No `User` changes, no Alembic
  revision (tables come from `create_all`).
- [ ] 2. `backend/inbox_service.py` (new) — `send()` (one message row + bulk delivery insert,
  returns recipient count). Bilingual copy constants for achievements, leaderboard, report status
  and premium welcome. `notify_leaderboard(session, user_id, message_type)`,
  `notify_report_status(session, report, status)`, `notify_premium_welcome(session, user)`.
  `award_achievements(session, user, stats) -> int` per Requirements (loads CEFR thresholds from
  `AppSetting` via #24's cached loader, falling back to `main.py` defaults).
  `get_inbox(user_id)` / `unread_count(user_id)` are built from the "Caching" loaders via
  `cache.get_or_load`, with the `cache_tags` execution options listed there. No cache plumbing
  of its own.
- [ ] 3. `backend/routers/inbox.py` (new) + `backend/main.py` `include_router(..., prefix="/api")`
  — user endpoints (`GET /me/inbox/unread-count`, `GET /me/inbox?limit&offset`,
  `GET /me/inbox/{id}`, `POST /me/inbox/actions` with `read|delete|undelete`, `ids|all`,
  `RETURNING` ids and user-scoped `cache_tags`) and superadmin endpoints (`POST/GET /admin/inbox`,
  `DELETE /admin/inbox/{id}`) with Pydantic bodies plus explicit 422 validation and SQL segment
  resolution. User endpoints use `require_user` and read through `inbox_service`'s cached
  loaders. Admin endpoints keep `_require_superadmin`.
- [ ] 4. `backend/routers/words.py::get_stats` — call `award_achievements` after computing values,
  commit if >0, add `new_inbox_messages` to the response.
- [ ] 5. `backend/routers/reports.py::_notify_reporter` — call `notify_report_status` before the
  consent early-return, exception-safe.
- [ ] 6. `backend/routers/admin.py::send_prepared_message` + `backend/scheduler.py::send_weekly_rewards`
  — call `notify_leaderboard` right where status becomes `sent`. `scheduler.py` — also register
  the daily purge of rows soft-deleted more than 24h ago.
- [ ] 7. `backend/routers/billing.py` (`checkout.session.completed` only, **after** the existing
  entitlement commit, own try/commit/rollback, webhook still returns 200 on inbox failure) +
  `backend/routers/admin.py::set_premium` (inactive → active only) — call `notify_premium_welcome`.
  Test in `test_inbox.py`: with `notify_premium_welcome` patched to raise, the checkout webhook
  still returns 200 and the user is still premium.
- [ ] 8. `backend/routers/admin.py::_delete_user_data` — add `InboxDelivery` and `UserAchievement`
  to `_tables_with_user_id`. Their Core `sa_delete` evicts those tables' cache entries
  automatically via #24, so no manual eviction.
- [ ] 9. `backend/tests/test_inbox.py` (new).
  - **List:** newest first, snippets (no full bodies), `limit`/`offset`/`has_more` boundaries,
    422 on a bad limit/offset, deleted rows hidden from the list, detail and unread count.
  - **Detail:** `GET /me/inbox/{id}` returns full content; 404 for another user's id or a deleted row.
  - **Actions:**
    - each action's precondition and `affected_ids` (deleting a deleted row → not affected;
      `read` on a read row → not affected)
    - another user's ids are never affected
    - `all:true` marks only the caller's unread rows
    - delete→undelete brings the row back with its read state and position
    - `unread` is correct in every response
    - 422s: unknown action, both or neither of ids/all, `all` with anything but `read`, >500 ids
  - **Purge job:** hard-deletes only rows soft-deleted more than 24h ago.
  - **Auth:** 401 unauthenticated. Admin send (403 non-superadmin; 422s for empty title, `javascript:`/`//x`
  CTA, label without URL, zero recipients; each audience resolves exactly the right seeded users
  incl. expired `premium_until`; `dry_run` writes nothing; retract under `enforce_foreign_keys()`).
  Achievements (first call grandfathers silently; crossing a new milestone creates exactly one
  message; repeat call creates none). Mirrors (report resolve without email consent still
  creates a delivery; `set_premium` false→true creates welcome, true→true doesn't; reward send
  creates an inbox message; checkout webhook creates welcome, reusing
  `test_billing_webhook.py`'s setup). User delete with deliveries+achievements under
  `enforce_foreign_keys()`. **Statement-count guards** (`before_cursor_execute` listener, same
  technique as `test_verb_lookup.py`, not wall-clock): a warm `GET /me/stats` with nothing new
  issues exactly as many statements as with `award_achievements` patched to a no-op. Warm
  `GET /me/inbox/unread-count`, warm `GET /me/inbox` (any offset) and warm
  `GET /me/inbox/{id}` issue **0** statements. An action issues 1 write + at most 1 reload. An admin send to N users issues a constant number of statements regardless of N
  (seed 3 vs 30). **Cache correctness:** send → recipient's next unread-count/list includes it;
  an action → the next list/count reflects it; retract → message gone for
  recipients; user delete evicts; a send whose transaction rolls back leaves the cache unchanged
  (no phantom, no stale-refill); expired TTL (monkeypatched `time.monotonic`) reloads from DB;
  actions on another user's ids affect nothing even with a warm cache. Update any exact-dict stats assertions in
  `test_stats_query_efficiency.py`/`test_streak.py` for the new `new_inbox_messages` key.
- [ ] 10. `frontend/lib/i18n/types.ts`, `en.ts`, `ru.ts` — new `inbox` namespace (RU+EN): page
  title, "Mark all as read", "All messages", "Show older", "Back", "Reply", "Delete", snackbar
  texts ("Message deleted", "Undo", error), empty state, "Retry", source labels, kind labels,
  envelope aria label. Plus `adminMessages` inbox-composer keys.
- [ ] 11. `frontend/components/FeedbackModal.tsx` — optional `initialMessage`/`initialEmail`
  props applied when `open` turns true. Footer usage unchanged.
- [ ] 12. `frontend/components/InboxMenu.tsx` (new) + `frontend/components/Header.tsx` — envelope,
  badge and dropdown per Requirements, rendered before the lang toggle when `isAuthed`.
- [ ] 13. `frontend/app/dashboard/components/StatsBar.tsx` — dispatch `fluent:inbox-changed` when
  `new_inbox_messages > 0`.
- [ ] 14. Minimal inbox per Requirements:
  - `frontend/lib/inbox.ts` (new): typed API calls, Gmail-style date formatting and the
    `fluent:inbox-changed` dispatcher; shared with `InboxMenu`.
  - `frontend/app/dashboard/inbox/page.tsx` (Suspense wrapper + URL state + list + snackbar).
  - `frontend/app/dashboard/inbox/MessageView.tsx`.
- [ ] 15. `frontend/app/dashboard/admin/page.tsx` — Messages → Inbox sub-tab (composer, dry-run
  confirm, history, retract).
- [ ] 16. `frontend/tests/inbox.spec.ts` (new, mocked API + fake JWT like
  `premium-badge-click-to-pricing.spec.ts`) — envelope absent when logged out. **Badge visual contract:**
  - hidden at 0
  - "6" renders as a circle (bounding box width == height == 18px)
  - "42" renders as a pill (width > height)
  - 120 renders "99+"
  - computed `background-color` equals the `destructive` token (`rgb(194, 80, 74)`), text is
    white and `font-weight` ≥ 700
  - the badge box intersects the envelope glyph box, with its centre above-right of the glyph's
    centre (top-right overlap)
  - the badge isn't clipped by the header (fully inside the viewport and not covered, via
    `elementFromPoint` at its centre)
  - the button's `aria-label` includes the count
  - the same checks at 375px;
  dropdown lists items; "All messages" navigates; page expand fires POST read; CTA href;
  Reply opens Feedback prefilled `Re: …`; 44×44 button size check. **Request-avoidance:** a
  client-side navigation fires no unread-count request; mark-read on the page decrements the
  badge with no unread-count request (count requests via `page.on('request')`); reopening the
  dropdown within 60s fires no second `/me/inbox` request.
  `frontend/tests/admin-inbox-composer.spec.ts` (new) — premium audience → dry-run → confirm
  → POST payload asserted; name search filters and selects a user.
  `frontend/tests/inbox-buttons.spec.ts` (new) is the **button contract**. It uses a stateful
  in-test fake backend (`page.route` over an in-memory list, so actions really change what the
  next GET returns):
  - one test per row of the 12-control table (plus Retry), asserting the visible effect **and**
    the exact request payload
  - "Shown when" conditions: "Mark all as read" hidden at 0 unread, "Show older" hidden without
    `has_more`, CTA hidden without one
  - Undo restores exactly the deleted row; browser Back from a message returns to the list
  - **nothing extra rendered:** in each view state (list, message view, empty, error), the set
    of `button`/`a`/`[role=button]` equals the table's controls for that state. No checkboxes,
    star, search, folders or pagination arrows. Every control has an accessible name and none has
    `href="#"`/`javascript:`
  - a **375px** run: every control ≥44×44, no horizontal page scroll

- [ ] 17. Docs — `documentation/inbox.md` (decisions: fan-out vs audience-at-read-time;
  tables-only to avoid the manual-Alembic deploy trap; achievements in `/me/stats` with
  grandfathering + `ON CONFLICT … RETURNING` race guard; why words milestones stop at 250;
  internal-only CTA; FK delete order; **the caching table, after-commit invalidation rule, TTL
  rationale for deploy overlap, and the "deliberately not cached" list**, linking
  `documentation/production-db-latency.md`). `Component Library (as-built).html`: Inbox menu + inbox
  page entries: the minimal Gmail-looking list pattern (dense rows, message view, 12-control
  contract) and the Undo snackbar as new patterns. Deliberate
  deviations: dropdown shadow; mascot only in inbox empty states; the unread badge's 2px
  header-coloured cut-out ring. Also a "Notification badge (Teams-style)" entry: placement on the
  glyph's top-right corner, circle-vs-pill sizing, "99+" cap, `destructive` fill, and the
  aria-label rule. `documentation/IMPLEMENTATION.md`
  mapping. `documentation/CHANGELOG.md` `#23` entry once validated.

## Validation

- [ ] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_inbox.py -q`
- [ ] Backend regression: `cd backend && .venv/bin/python -m pytest -q` (esp. `test_reports`,
  `test_scheduler`, `test_billing_webhook`, `test_streak`, `test_stats_query_efficiency`,
  `test_admin_send_email`)
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Playwright autotests added: `npx playwright test inbox.spec.ts inbox-buttons.spec.ts admin-inbox-composer.spec.ts`
- [ ] Shared shell regression: `npx playwright test design-system-parity.spec.ts`
- [ ] Full Playwright suite (header renders on every page): `npx playwright test`
- [ ] Edge cases (covered in `test_inbox.py`): `cta_url: "javascript:alert(1)"` → 422;
  non-superadmin `POST /api/admin/inbox` → 403; unauthenticated `GET /api/me/inbox` → 401;
  marking another user's delivery → 404
- [ ] Smoke (local, one uvicorn + one next dev, check `ps` first): log in → envelope left of
  RU/EN; Admin → Messages → Inbox → send a message with audience **users = your own account
  only** (backend/.env may point at the shared Neon DB) → badge increments after reload or tab refocus →
  dropdown → "Mark all as read" → open a message from the list → CTA → browser Back → Reply
  prefilled → Delete → Undo → Delete again → "Show older" (seed >20 to yourself) → retract from
  admin history. Nav, header, footer and login intact vs production. Mobile 375px: envelope fits, dropdown within viewport.
- [ ] Design check vs `Component Library (as-built).html` (tokens, pills, 44px tap target, one mascot)
- [ ] News post written and published via /news-writer

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test inbox.spec.ts inbox-buttons.spec.ts admin-inbox-composer.spec.ts design-system-parity.spec.ts --reporter=list
cd frontend && npx playwright test --reporter=list
```
