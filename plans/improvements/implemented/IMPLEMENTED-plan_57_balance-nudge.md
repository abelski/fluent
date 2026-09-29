---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
uat_rounds: 0
max_uat_rounds: 3
---

# Plan #57 — Balance nudge: radar info button + balance tips (email + inbox)


## Context

Idea: `plans/ideas/idea_57_balance-nudge.md` (confirmed 2026-09-29).

The effort radar (#56, `frontend/components/EffortRadar.tsx`, `GET /api/me/effort`) shows how a
learner's leaderboard points split between words, phrases and grammar, but gives no guidance and
nobody is told when a direction is dropped. A research-backed article
(`how-to-learn-lithuanian-order`, draft + import file in `temp_files/articles/`) gives the recipe.
It is **not published yet** — the user publishes it via admin import (Claude was blocked from
writing to the production DB).

Measured on prod (rolling 14 days): chosen rule flags **13 of 49** active users.

Existing pieces reused:
- `leaderboard_service.build_leaderboard_score_joins(bounds)` — per-source points (w/p/g joins).
- `scheduler.py` — `_is_auto_send_enabled()` (defaults **True** when unset — must gain a default
  param, this key defaults off), `generate_inactive_messages` shape, Telegram summary,
  `start_scheduler()`; #31's savepoint + UNIQUE index race guard (`generate_weekly_reward_messages`).
- `inbox_service.send(session, [uid], kind=, source=, title_*, body_*, cta_*)` — never commits.
- `email_service.send_email(to, subject, body)` (plain text), `email_templates.append_premium_upsell`.
- `admin.py` `_AUTO_SEND_KEYS` / `GET|PATCH /admin/settings/auto-send` (GET defaults every key to
  True; `AutoSendBody` has required bools) + admin page toggle list (`admin/page.tsx:3973`).
- `words.py` `GET|PATCH /me/settings` (`UserSettingsUpdate`), settings page Other tab
  (`settings/page.tsx:665+`, tab is local state, not in the URL).
- `admin.py::_delete_user_data` — explicit per-table delete list (FK order, #21/#23 gotcha).
- Inbox body renders as plain text (`inbox/MessageView.tsx:139`, `whitespace-pre-line`) — URLs are
  not clickable today.

Model/effort rationale: opus/high — scheduler job with a cross-instance race guard, email + inbox
fan-out, two new tables and user-delete ordering, plus UI on three surfaces.

## Goals
- An "i" info button beside the radar title opens the balance article.
- A daily job sends a balance tip (inbox always, email if consented) to active learners who fully
  dropped a direction, at most once per 14 days, all reasons in one message.
- Learners can turn tips off in Settings → Other (on by default); every tip links there.
- A superadmin switch turns the job on; it is off by default.

## Non-Goals
- Soft article ranges (phrases <10% etc.) as triggers; per-reason cooldowns.
- Tips to users with 0 points in the window (inactive email covers them).
- Admin stats dashboard; push notifications; retroactive tips; practice/reading in the balance.
- Publishing the article (user does it; it is a prerequisite, see DoD).

## Requirements

**Rule** (window = last 14 days, `now - 14d .. now`, leaderboard scoring, practice excluded):
- Eligible: `words + phrases + grammar > 0` in window; no opt-out row; no `BalanceTip` for the user
  with `sent_on > today - 14 days` (date-based, so run-time jitter can't stretch the period to 15 days).
- Reasons, in this fixed order: `grammar` if grammar = 0 and known words > 150; `phrases` if
  phrases = 0 and known > 150; `words` if words = 0. `known` = all-time
  `user_word_progress.status = 'known'` count.
- Flagged = at least one reason. One query for all users (no per-user round trips — Neon is
  ~0.2 s per round trip).

**Send** — two phases, like #31 (`generate_weekly_reward_messages` commits, then
`send_weekly_rewards` sends), because SMTP cannot be rolled back:
1. **Claim + inbox, then commit.** Per flagged user, inside `session.begin_nested()`: insert
   `BalanceTip(user_id, sent_on=today, reasons, words_pct, phrases_pct, grammar_pct)` and the inbox
   message (`inbox_service.send(kind="info", source="balance", ...)`, both RU and EN copy — the
   inbox picks by the viewer's UI language; CTA → section of the first reason:
   `/dashboard/grammar`, `/dashboard/phrases`, `/dashboard/lists`, label «К грамматике» / "Go to
   grammar", «К фразам» / "Go to phrases", «К словам» / "Go to words"). `IntegrityError` on
   `UNIQUE(user_id, sent_on)` → skip that user (another instance won). Then `session.commit()` —
   the claims are durable before any email leaves, so a crash can't cause a resend tomorrow and the
   other instance doesn't wait on uncommitted rows during SMTP.
2. **Email, then commit.** For each claimed user with `email_consent`: plain text in `user.lang`
   (ru/en, fallback ru), full `https://fluent.lt/...` URLs,
   `append_premium_upsell(body, is_premium_active(user), lang, "generic")`; set
   `BalanceTip.emailed=True` per success; failure logged, stays False. Commit.
3. Telegram summary `⚖️ Balance tips: inbox=N email=M failed=K` when N>0.

**Copy** (both languages, in `balance_service.py`):
- Subject/title: one reason → «Не забывайте про грамматику» / "Don't forget grammar" (likewise
  фразы/phrases, слова/words); 2+ → «Пара направлений ждёт вас» / "A couple of directions are
  waiting for you".
- Body: 14-day shares line («За 14 дней: слова X%, фразы Y%, грамматика Z%»); one "why now" line
  per reason; **email only:** a section line for the first reason («Открыть грамматику:
  https://fluent.lt/dashboard/grammar/» / "Open grammar: …") — the inbox has the CTA button instead;
  article link `https://fluent.lt/dashboard/articles/how-to-learn-lithuanian-order/`
  («Почему баланс важен» / "Why balance matters"); footer «Не хотите такие советы? Отключить в
  настройках: https://fluent.lt/dashboard/settings/?tab=other».
- Shares: `round(100 * part / total)`.

**Opt-out**: stored as a row in new table `BalanceTipOptOut(user_id PK/FK, created_at)` — row
present = off. Chosen over a `User` column: a new `User` column needs a hand-run Alembic migration
on production (Render never runs it; #31 left one pending), while new tables are created by
`create_all()` on boot (`documentation/inbox.md`). `PATCH /me/settings` takes
`balance_tips: Optional[bool] = None` — **None leaves it unchanged**, so an older client or a tab
that omits the field can never silently re-enable or disable it.

**Admin switch**: key `auto_send_balance_tips`, default **False** in both `GET /admin/settings/
auto-send` and the job. `AutoSendBody.auto_send_balance_tips: bool = False` (the admin page always
PATCHes the whole object, `admin/page.tsx:899`).

**Info button**: `<a>` beside the radar title, inline SVG "i" in a circle (no icon library in the
repo), `aria-label` + `title` = «Как держать баланс» / "How to keep the balance", 44×44 tap target
via padding + negative margin so the card header height doesn't grow, same-tab link, color tokens
only (`text-muted` → `hover:text-emerald-700`).

**Inbox links**: `MessageView.tsx` renders `https://fluent.lt/<path>` substrings in the body as a
Next `<Link href="/<path>">` (origin stripped, so it works on localhost too); all other text is
unchanged. Emails keep full URLs.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/models.py` — add `BalanceTip` (id, `user_id` FK index, `sent_on: date`,
  `created_at`, `reasons: str` comma list, `words_pct`/`phrases_pct`/`grammar_pct: int`,
  `emailed: bool=False`, `UniqueConstraint("user_id", "sent_on")` in `__table_args__`) and
  `BalanceTipOptOut` (`user_id` PK + FK, `created_at`).
- [x] 2. `backend/balance_service.py` (new) — pure `balance_reasons(words, phrases, grammar, known)
  -> list[str]`; `build_copy(lang, reasons, points) -> dict` (shares computed inside; returns
  subject/body/title/cta for one language — inbox calls it for both `ru` and `en`, email for
  `user.lang`); `find_flagged(session, now)` — one SQL over
  `build_leaderboard_score_joins((now-14d, now))` + LEFT JOIN known-count subquery, excluding
  opt-out rows and users with a `balance_tip` in the last 14 days, `WHERE total > 0`;
  `send_balance_tips(session, now) -> dict` implementing the two Send phases. Update the
  `InboxMessage.source` comment in `models.py:631` to list `balance`.
- [x] 3. `backend/scheduler.py` — `_is_auto_send_enabled(session, key, default=True)`; new job
  `send_balance_tips_job()` (checks `auto_send_balance_tips` with `default=False`, opens a session,
  calls `balance_service.send_balance_tips`); register in `start_scheduler()` daily 09:30 UTC with
  `misfire_grace_time=3600, coalesce=True`; update module docstring + start log line.
- [x] 4. `backend/routers/admin.py` — add `auto_send_balance_tips` to `_AUTO_SEND_KEYS` with a
  per-key default (False for it, True for the others) in GET; `AutoSendBody` gets
  `auto_send_balance_tips: bool = False` and PATCH writes it; add
  `BalanceTip`, `BalanceTipOptOut` to `_delete_user_data`'s table list.
- [x] 5. `backend/routers/words.py` — `GET /me/settings` returns `balance_tips` (no opt-out row);
  `UserSettingsUpdate.balance_tips: Optional[bool] = None`; PATCH inserts/deletes the opt-out row
  accordingly, returns `balance_tips`.
- [x] 6. `backend/tests/test_balance_tips.py` (new) — reasons table (each rule, >150 boundary:
  150 → not flagged, 151 → flagged; words-0 regardless of known); active-only; opt-out excluded;
  14-day cooldown on `sent_on` (13 days ago skipped, 14 days ago sent); one message for multiple
  reasons; CTA order grammar → phrases → words; copy: one-reason vs 2+ subject, RU vs EN by
  `user.lang`, unknown lang → ru, shares line numbers, email section line; Premium user and admin
  are tipped too; email only with consent; upsell only for non-Premium; SMTP failure → inbox still
  sent, `emailed=False`, claim committed; switch off by default → nothing sent; second run same day
  → UNIQUE guard, no duplicate (simulate race by pre-inserting today's row after the flagged
  query); a test that prints the full RU and EN email bodies (with/without upsell) so the copy can
  be reviewed before the switch is turned on; settings GET/PATCH round trip incl. omitted field = unchanged; admin auto-send
  GET default False for the new key; user delete with `enforce_foreign_keys()` removes both tables.
- [x] 7. `frontend/lib/api.ts` — `UserSettings.balance_tips: boolean`.
- [x] 8. `frontend/lib/i18n/{types,ru,en}.ts` — `inbox.sources.balance` («Баланс» / "Balance");
  `landing.effortInfo` («Как держать баланс» /
  "How to keep the balance"), `settings.balanceTipsLabel` / `balanceTipsHint`
  («Советы по балансу занятий» / "Study balance tips"; hint: «Раз в две недели, если вы совсем
  забросили слова, фразы или грамматику» / "Every two weeks at most, if you've fully dropped words,
  phrases or grammar"), `adminSettings.autoSendBalanceLabel` / `autoSendBalanceDesc`.
- [x] 9. `frontend/components/EffortRadar.tsx` — title row becomes `flex items-center
  justify-between`; add the info `<a data-testid="effort-info">` per Requirements.
- [x] 10. `frontend/app/dashboard/settings/page.tsx` — initial state `balance_tips: true`; checkbox
  `data-testid="balance-tips-checkbox"` directly under email consent, same markup; on mount, if
  `window.location.search` has `tab=other`, open the Other tab.
- [x] 11. `frontend/app/dashboard/admin/page.tsx` — third toggle row for `auto_send_balance_tips`;
  state type gains the key.
- [x] 12. `frontend/app/dashboard/inbox/MessageView.tsx` — `https://fluent.lt/<path>` in the body →
  `<Link href="/<path>">`.
- [x] 13. Tests: `frontend/tests/effort-radar.spec.ts` (info link present, href, aria-label RU/EN,
  ≥44×44 box, at 1280 and 375); `frontend/tests/user-settings.spec.ts` (checkbox default checked,
  PATCH body carries `balance_tips:false` after uncheck, `?tab=other` opens Other); inbox spec
  (a fluent.lt URL in the body renders as a relative link); admin spec (third toggle renders off,
  PATCH body includes `auto_send_balance_tips`). All with mocked API.
- [x] 14. Screenshots → `temp_files/screenshots/plan_57_balance-nudge/`: radar with info button
  (RU/EN × 1280/375), settings Other tab with the new checkbox (RU/EN × 1280/375), inbox message
  view of a balance tip with clickable links (RU/EN × 1280/375), admin auto-send block with the
  new toggle (1280 only — admin-only screen, not shot at 375). Look at each and describe what it shows.
- [x] 15. Docs: `documentation/balance-tips.md` (rule, why exact-zero not article ranges — 43/49 vs
  13/49 measurement, opt-out table vs column, race guard, default-off switch, success SQL query);
  component library — "Card info button" pattern; specs updated: `specs/home.md`,
  `specs/settings.md`, `specs/admin.md`, `specs/inbox.md` (linkify), new `specs/balance-nudge.md`
  (scenarios from the idea's Proposed spec).

## Review

- [x] Code review passed (round 1)

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_balance_tips.py tests/test_scheduler.py tests/test_inbox.py tests/test_effort.py`
- [x] Backend full suite green: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright: `cd frontend && npx playwright test tests/effort-radar.spec.ts tests/user-settings.spec.ts tests/inbox.spec.ts tests/inbox-buttons.spec.ts --reporter=list`
- [x] Design parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [ ] Local smoke — **never against `backend/.env` as is**: it points at production Neon and real
  SMTP, so a run would tip ~13 real users and block their real tips for 14 days. Only with
  `DATABASE_URL` overridden to a throwaway SQLite file and `SMTP_HOST` unset: seed a user with >150
  known words and 0 grammar, run `send_balance_tips` → one inbox message with working links;
  checkbox off → rerun sends nothing. If that override can't be guaranteed, skip and rely on pytest.
- [x] Screenshots taken and reviewed (item 14): RU + EN, desktop + 375px.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/effort-radar.spec.ts tests/user-settings.spec.ts tests/inbox.spec.ts tests/inbox-buttons.spec.ts tests/design-system-parity.spec.ts --reporter=list
ls temp_files/screenshots/plan_57_balance-nudge/ | grep -c png   # expect >= 13
```

User-facing checks (named explicitly, per CLAUDE.md):
- **Both languages**: radar info label, settings checkbox, tip copy — RU and EN.
- **Mobile 375px**: radar header, settings Other tab, inbox message view.
- **Screenshots** proving each, in `temp_files/screenshots/plan_57_balance-nudge/`.
- **Prerequisite before push** (the info button has no switch, it goes live with the deploy):
  `curl -s -o /dev/null -w "%{http_code}" https://fluent.lt/api/articles/how-to-learn-lithuanian-order`
  → `200` (user publishes). Not the page URL — the static `_` placeholder answers 200 for any slug.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000` (frontend) + `http://localhost:8000`
(backend), signed in as a local test user.

**Scenarios:**
1. Open the home page; find the "Where your effort goes" card; click the small info icon next to
   its title.
2. Switch the UI language to Russian and repeat step 1; resize to 375px wide and repeat.
3. Open Settings → Other; uncheck "Study balance tips"; save; reload the page.
4. Open `/dashboard/settings/?tab=other` directly.

**Acceptance criteria:**
- [ ] The info icon is next to the card title and leads to the article page about the order of
  learning words, grammar and phrases, in the same tab.
- [ ] The icon's hover/accessible label reads "How to keep the balance" (EN) / «Как держать баланс»
  (RU); at 375px it is still visible and tappable, the card layout is not broken.
- [ ] After unchecking and saving, the checkbox stays unchecked after reload.
- [ ] Opening the settings URL with `?tab=other` shows the Other tab directly.
