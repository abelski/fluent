---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #31 — Stop giving Premium away, and put review first

Follows #25 (`documentation/premium-conversion.md`), which measured the funnel on 2026-09-13 and
left one finding explicitly unfixed. That finding is 31a, and it is worth more than anything else
here.

## Context

Started from a user proposal: block new-word learning when more than 20% of a user's words are
overdue, show a popup saying research proves efficiency drops, and sell Premium as the bypass.
Measured first (production, read-only, 2026-09-16).

| Metric | Value |
| --- | --- |
| Users | 144 |
| Active 30d / 7d | 101 / 32 |
| `is_premium = true` | 15 |
| Ever reached Stripe (`stripe_customer_id`) | 3 |
| **`subscription_status = 'active'`** | **2** (was 3 on 2026-09-13 — one lapsed) |
| `premium_until` still in the future | 5 of the 15 flags |

`is_premium` is not a revenue metric. 10 of the 15 flags are expired and never reset (by design —
`billing.py` has no expiry job, `is_premium_active()` lapses them at read time). The admin panel
showed 15 Premium users; 2 pay.

### The top 10 most active users, last 30 days

| Sessions | Premium flag | Ever paid | `premium_until` |
| --- | --- | --- | --- |
| 263 | yes | **no** | 2026-09-28 |
| 204 | no | no | — |
| 182 | yes | **no** | 2026-09-14 |
| 121 | yes | **no** | 2026-09-21 |
| 81 | yes | **no** | 2026-09-28 |
| 73 | yes | yes | 2026-09-29 |
| 66 | yes | yes | 2026-07-13 (lapsed) |
| 53 | yes | yes | 2026-10-08 |
| 45 | no | no | — |
| 41 | yes | **no** | 2026-08-31 |

**Five of the ten most engaged users hold Premium and have never paid.** From
`prepared_message`: 48 reward grants, 12 distinct winners, **4 of whom took 36 of the 48**;
`norpus1` won 11 of roughly 17 weeks. None of the 12 has ever reached Stripe. Total given away:
336 days.

### Review backlog

Active-30d users with scheduled words: 67.

| Overdue share of scheduled words | Users |
| --- | --- |
| 0–20% | 7 |
| 20–40% | 1 |
| 40–60% | 3 |
| 60–80% | 8 |
| 80–100% | 17 |
| exactly 100% | 31 |

Mean overdue per user: 122. Max: 1151. Among active-**7d** users, mean overdue is 283.

The 31 users at 100% overdue are not a bug: their oldest due date is on average 19 days past and
only 2 of the 31 studied in the last 7 days. The backlog is a **symptom of churn**, not its cause.
Direction of causation matters — they stopped coming, so reviews piled up.

### Why the original proposal was rejected

1. **It fires for 60 of 67 active-30d users** (90%). That is a wall across the product, not a gate.
2. **Restricted to active-7d users it reaches 6 free users.** It cannot move revenue.
3. **It blocks returning users at the worst possible moment.** A 122-word backlog means someone
   who was away; the session it fires in is the session they came back for.
4. **The science claim is not supportable.** No published result gives a 20% overdue threshold or
   any "dramatic" efficiency loss at one. See `documentation/spaced-repetition-evidence.md` for
   what the literature does and does not support.

## Goals

- Stop the leaderboard reward functioning as a permanent free subscription for the users most
  likely to pay.
- Make review-first the default when a user's backlog exceeds one session, without blocking anyone.
- Back the review-first nudge with real, citable evidence the user can read.

## Non-Goals

- Blocking new-word learning behind a paywall.
- Clawing back the two over-granted users (decided 2026-09-16: what was granted is granted).
- Rebuilding SM-2 as FSRS — real gain (20–30% fewer reviews at equal retention) but a scheduler
  rewrite for 32 weekly-active users. Revisit past ~1000 active users.
- Winning back the 31 fully-lapsed users — that is reactivation (email/push), a separate plan.
- **Review-first anywhere but the word-list study session.** Confirmed out of scope by the user on
  2026-09-16. The clamp lives only in `routers/words.py`'s `GET /lists/{id}/study`. Grammar,
  practice and phrases are untouched, and so is `continue_session.py` — its review pool is fetched
  with a limit, so it cannot tell a true backlog from a capped fetch without an extra count query,
  and on Neon that is a round trip per call (~180ms from dev) for a surface that already leads with
  due items. Grammar in particular has no per-item SM-2 schedule to be "overdue" against at all,
  so the rule would not even be expressible there. Note `grammar.py` is named under 31b below only
  as a router that *already* charges the daily quota — that is a fact about the quota, not scope.
- **31b, charging the daily quota on phrases and practice** — descoped by the user 2026-09-16.
  Recorded so it is not re-derived: `quota_check_and_increment` is called only from `words.py`,
  `grammar.py` and `continue_session.py`. `phrases.py` and `practice.py` never call it, so a free
  user who has spent their 5 daily sessions can keep studying phrases and practice tests without
  limit. Not a bug in the quota code — those routers never opted in.

## Requirements

- **R1** Reward days follow finishing rank: 1st = 7, 2nd = 4, 3rd = 2 (user's call, 2026-09-16;
  5 days for 1st was proposed and rejected). One source of the number, read by both the grant and
  the email copy.
- **R2** A grant is a rolling window, never additive. Winning repeatedly must not bank Premium.
- **R3** An unlimited admin grant (`is_premium` with `premium_until IS NULL`) must never be
  downgraded to a fixed date.
- **R4** The weekly job must grant once per user per rewarded week no matter how many app
  instances run it concurrently.
- **R5** Review-first is a default, not a block. Free and paying users can both always study.
- **R6** No scientific claim appears in UI copy. Citations live in a published article.

## Implementation

### 31a — Tier the reward, and stop it stacking (R1, R2, R3)

A weekly grant of N days covers N/7 of the calendar, so only N = 7 keeps pace with the week. At
4 and 2 days the 2nd- and 3rd-place winners meet the paywall 3 and 5 days a week instead of never.
At 7 days first place is still continuously covered while they hold the spot — a deliberate
product call, not an oversight.

- [x] `leaderboard_service.REWARD_DAYS = {1: 7, 2: 4, 3: 2}` — single source of the number
- [x] `leaderboard_service.grant_reward_premium(user, rank, now)` — rolls `premium_until` to
      `now + days`, never further; returns days granted; returns 0 and touches nothing for an
      unrewarded rank or an unlimited grant
- [x] `scheduler.send_weekly_rewards` uses the helper instead of `premium_until += 7 days`
- [x] `admin.send_prepared_message` uses the same helper — manual and auto paths cannot drift
- [x] `email_templates.generate_reward_email` reads `REWARD_DAYS` so the promise cannot disagree
      with the entitlement; `_ru_days()` gives correct Russian plurals (7 дней / 4 дня / 2 дня)
- [x] `generate_notice_email` lists all three tiers, built from `REWARD_DAYS`

This is deliberately the opposite of `billing._extend_premium`, which uses `max()` so a **paid**
renewal never moves the date backwards. Paid time is bought and must be honoured; reward time is
granted and must expire. The two must stay separate functions.

### 31a-bug — The weekly reward double-granted (R4)

On 2026-09-14 all three winners received **two** reward rows each, created 0.6s apart at exactly
10:00. `norpus1` and `Satti Preetham` were granted 14 days instead of 7. Two app instances ran the
job together (Render overlaps instances during a deploy; each runs its own APScheduler), and
`generate_weekly_reward_messages`'s `already_generated` check is a read-then-write race — both read
an empty set, both inserted.

- [x] `PreparedMessage.rank` and `.rewarded_week` columns
- [x] Partial UNIQUE index on `(user_id, message_type, rewarded_week)`, declared in **both** the
      migration and `__table_args__` — `database.py` builds schema from model metadata via
      `create_all()`, so a migration-only index would be missing from a fresh DB and from tests
- [x] Migration `b8c9d0e1f2a3`, no backfill: historical rows keep `rewarded_week` NULL so the
      partial index ignores them and the existing duplicates stand
- [x] Generator wraps its insert in a savepoint and skips on `IntegrityError`, so the loser of the
      race drops its row without poisoning the batch

### 31c — Review-first: a screen with a choice, then a reminder (R5, R6)

Not a block and not a silent clamp. Before a session on a list whose backlog outgrows one
session, the user gets a screen with **two** buttons, and whichever they pick is honoured
literally.

An earlier draft quietly capped the new-word share at 0.2 whenever the backlog was large. It
was dropped: once there is a button labelled «Всё равно учить новое», a clamp behind it would
make the label a lie. The choice is now explicit, so the mix can be honest.

- [x] `GET /lists/{id}/progress` reports `due` (learning + known past `next_review`) and
      `session_size`. **The offer is read from here, not from `/study`, because `/study`
      charges a daily session** — showing someone a recommendation must not cost them one of
      their five. Verified by a test that calls `/progress` twice and asserts
      `sessions_today` is unchanged.
- [x] `GET /lists/{id}/study?mode=review` → `session_new_ratio()` returns 0.0, a review-only
      session. No `mode` → the user's own ratio, untouched.
- [x] Trigger is `due > session_size`, a count, not a percentage — 20% of 20 scheduled words
      is 4 (nothing), 20% of 1000 is 200 (ten days of work).
- [x] Full-screen offer matching the page's existing `allKnown` / `limitReached` states
      (`PageMascot` + heading + two buttons + article link). Neutral mascot mood on purpose:
      at any other mood `PageMascot` swaps the page's phrase for a canned cheer ("Šaunu!"),
      and this is a nudge, not a celebration.
- [x] Primary «Повторить 47 слов», secondary «Всё равно учить новое». Two buttons because a
      single one is a block, and it would land hardest on people who just came back from a
      break — exactly the wrong moment.
- [x] After «Всё равно учить новое», the session runs as normal **and** keeps a one-line
      reminder strip above it, so the count stays visible without interrupting again.
- [x] Both strips are wrapped in a `bg-slate-50` container. `QuizSession` paints that colour
      over the body's green gradient (`globals.css`) starting at its own top, so a strip
      above it otherwise showed the gradient and read as a coloured band seamed against the
      session. That also fixes the pre-existing `more-new-at-higher-level` strip.
- [x] Copy set by the user 2026-09-16 — «Сегодня лучше заняться повторением» / "Today is
      better spent reviewing". The first draft («Сегодня повторяем: … ждут повторения»)
      repeated the same root twice.
- [x] Russian declension throughout goes through the repo's existing `plural()` helper: one
      hardcoded string gives "Повторить 21 слов" instead of "Повторить 21 слово".
- [x] Verified in both languages and at 375px.

No scientific claim appears anywhere in the UI; the article carries every citation and is one
link away from both the screen and the strip.

### 31c-decision — The screen repeats on purpose. Do not add suppression.

Measured before shipping: the offer fires for **18 of 22 weekly-active users**, on **585 of 1646
(36%) of their user/list pairs**. There is no once-per-day gate, so opening five backlogged lists
in one evening shows it five times.

A once-per-day `localStorage` gate was proposed and **rejected by the user on 2026-09-16**:
quality of learning is the point, not volume of sessions. Someone who opens a third backlogged
list in one evening is exactly the person the recommendation is for, and suppressing it to be
polite would quietly restore the behaviour the feature exists to interrupt.

So: repetition here is the feature, not an oversight. If a future session reads "the screen shows
every time" as a bug, it is not — check with the user before adding a gate.

### 31d — Publish the evidence article (R6)

`temp_files/articles/why-review-beats-new-words.md` holds the finished bilingual draft (RU + EN,
six verified DOIs).

- [x] Inserted into the `article` table as **id 34**, 2026-09-16: slug `why-review-beats-new-words`,
      titles «Почему повторение важнее новых слов» / "Why review beats new words",
      `category: learning_materials`, tags `память,повторение,методика,наука` (Russian, matching the
      other learning_materials rows), `published: true`, `show_in_footer: false`. Both bodies carry
      the full six-DOI reference list — the EN half's references were spelled out rather than left
      as the draft's "same six as above", since the two bodies are separate columns.
- [x] Published **before** 31c, so the nudge's link cannot 404. Verified live:
      `GET https://fluent.lt/api/articles/why-review-beats-new-words` → 200, and the slug appears in
      `GET /api/articles?category=learning_materials`

Claims are sourced in `documentation/spaced-repetition-evidence.md`, which also lists what the
article must **not** say. Anything added later gets checked against that file first.

## Validation

- [x] `backend/tests/test_reward_grant.py` — days follow rank; repeat wins do not bank; a smaller
      prize never shortens existing coverage; unlimited grants are not downgraded; email copy
      matches `REWARD_DAYS`; duplicate (user, type, week) insert raises; reengagement rows unaffected
- [x] `cd backend && .venv/bin/python -m pytest -q` — full backend suite green
- [x] `alembic upgrade head` applied to production 2026-09-16: `a7b8c9d0e1f2` → `b8c9d0e1f2a3`,
      one migration, after the user took a backup. Verified on the live DB: both columns present,
      the index is genuinely partial (`WHERE (rewarded_week IS NOT NULL)`), all 173 historical rows
      untouched, and a duplicate `(user, message_type, rewarded_week)` insert is rejected with
      `duplicate key value violates unique constraint` (probed inside a rolled-back transaction).
      `generate_weekly_reward_messages` was then dry-run against production in a rolled-back
      transaction and wrote `reward_rank=5 / rewarded_week=2026-09-07` correctly.
      **Alembic does not run on deploy** — neither `buildCommand` nor `startCommand` calls it, and
      `create_all()` only ever adds missing *tables*. This had to be run by hand *before* shipping
      the code, because `auth.py`'s OAuth callback selects `prepared_message` on every login: the
      new code against the old schema would have 500'd every sign-in, not just the admin panel.
- [x] `backend/tests/test_review_first.py` — 11 cases incl. «learn new» really serving new
      words, review mode serving none, and `/progress` never charging a session
- [x] `frontend/tests/review-first.spec.ts` — 11 cases: the offer fetches no session, each
      button's actual request (`mode=review` vs no mode), the strip only after «учить новое»,
      declension, English, and 375px in both languages
- [x] Article reachable at `/dashboard/articles/why-review-beats-new-words` in both languages
- [x] The nudge's link resolves (static export appends a trailing slash; the spec matches the path)
- [x] `design-system-parity.spec.ts` — 12 passed; the strip is documented as "Study notice strip"
      in the component library, since a second instance makes it a shared pattern

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/alembic upgrade head
cd frontend && npx playwright test tests/review-first.spec.ts tests/design-system-parity.spec.ts
```

User-facing checks — all three required, none of them optional:

- [x] **Both languages.** Screen and strip verified in RU and EN, including singular/plural
      agreement (`Повторить 21 слово` vs `Повторить 22 слова`; `1 word is waiting` vs
      `47 words are waiting`).
- [x] **Mobile at 375px.** Both surfaces verified in both languages; the specs assert
      `document.documentElement.scrollWidth <= 375`, so a long string cannot silently push the
      page sideways.
- [x] **Screenshots.** 7 shots in
      `temp_files/screenshots/plan_31_review-first-and-premium-leaks/` — `screen-ru`, `screen-en`,
      `screen-mobile-ru`, `screen-mobile-en`, `strip-ru`, `strip-en`, `strip-mobile-ru`.

## Honest framing on the revenue target

144 users, 32 weekly-active, 2 paying. At €4.50/month no in-product mechanic reaches a survivable
number — converting *every* weekly-active user is €144/month. 31a is worth doing because it is
cheap and stops a real leak, but **the binding constraint is top of funnel and early retention, not
monetisation mechanics.** 96 of the 144 users signed up in the last two months, so acquisition is
working; the retention step (57 of 111 users who ever studied studied on exactly one day, per #25)
is where the volume is lost.
