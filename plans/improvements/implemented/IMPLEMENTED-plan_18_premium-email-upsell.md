---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Plan #18 — Soft Premium upsell footer on every outgoing user email

## Context

Fluent sends user-facing email through exactly two layers: `backend/email_templates.py` (pure
string-templating functions, zero DB/User-model imports, returning `(subject, body)` tuples) and
`backend/email_service.py`'s `send_email(to, subject, body)` (a thin SMTP wrapper with no
User/session awareness). There are exactly **four call sites** that actually invoke
`email_service.send_email(...)` for a real user:

1. `backend/routers/reports.py::_notify_reporter` (~lines 23-39) — bilingual (RU+EN in one body,
   joined by `"— — —"`) mistake-report status-change notice.
2. `backend/scheduler.py::generate_inactive_messages` (~lines 65-129) — daily inactive-user
   win-back email, sent immediately at generation time; body is also stored on the
   `PreparedMessage` row for the admin review UI.
3. `backend/scheduler.py::generate_weekly_reward_messages` (~lines 132-196), whose drafts are later
   sent by `send_weekly_rewards` (~lines 199-255) or manually via
   `backend/routers/admin.py::send_prepared_message` (~lines 285-329) — weekly leaderboard
   reward (top 3, grants 1 free week of Premium) and notice (rank 4-5) emails.
4. `backend/routers/admin.py::send_email_to_user` (~lines 199-220) — superadmin freeform ad-hoc
   email to one user, already gated on `target.email_consent`.

`is_premium_active(user)` (`backend/quota.py`, lines 13-19) is the single source of truth for
"does this user still need the pitch": `False` if `user.is_premium` is falsy; `True` forever if
`premium_until is None`; otherwise a naive-UTC datetime comparison. `admin.py` already imports it
as `_is_premium_active` (line 17). Per the confirmed design, `email_templates.py` stays a pure
string module and never imports `quota.py` — every caller computes the bool itself and passes it
in.

**Test-harness caveat found during exploration:** `generate_weekly_reward_messages`'s raw SQL
(`session.execute(text(f"""..."""))`, ~lines 143-158) embeds Postgres-specific SQL via
`build_leaderboard_score_joins`/`LEADERBOARD_SCORE_EXPR` and isn't exercised end-to-end against
SQLite anywhere in `backend/tests/test_scheduler.py` today — existing tests there seed
`PreparedMessage` rows directly and replicate only the send-time logic inline. New tests for call
site 3 must follow that same convention (construct `User` objects and exercise the new
upsell-selection logic directly) rather than calling `generate_weekly_reward_messages()` against
the SQLite test engine. `generate_inactive_messages` (call site 2) uses only ORM `select()` — no
raw SQL — so it can genuinely be exercised end-to-end.

**Copy direction (set by the user after reviewing each of the 5 emails in full, one by one):** the
approved framing leads with project sustainability — Premium subscriptions cover Fluent's hosting
and infrastructure and are what keep the project running — rather than a plain feature-benefit
list. The link target is `https://fluent.lt/pricing`.

**Notable finding surfaced during review, resolved with the user:** `generate_reengagement_email`'s
existing "⚠️ we'll delete your profile in 7 days" line is copy-only — a full repo search confirmed
there is no scheduled/automated job anywhere that deletes accounts for inactivity (the only account
deletion path is the manual, admin-triggered `DELETE /users/{user_id}` in `backend/routers/admin.py`,
via `_delete_user_data`). The user asked for the inactive-email upsell to state that Premium
accounts are never deleted for inactivity, and explicitly confirmed this should be **copy-only**,
matching the existing unenforced-threat style — no new deletion-enforcement job is in scope here
(see Non-Goals).

There are three copy variants (not two as originally drafted) — `generic`, `convert`, and a new
`inactive` variant used only by the re-engagement email, since it's the only email with the
deletion-warning context to tie back to:

One accepted nuance: `generate_notice_email` (rank 4-5) already contains its own *gamified* upsell
("reach top 3 next time for free Premium"). The new `variant="generic"` paid-upsell footer is
appended after it regardless — two different upsell mentions in one email is intentional here, not
a bug.

`suggested_model`/`suggested_effort` rationale: backend-only, no auth/payment/migration risk; every
change is "compute a bool, call a helper" inserted at four already-identified call sites, reusing
an existing, already-proven test-mocking pattern (`email_recorder` / `patch("email_service.send_email")`).
Breadth (5 source files + 4 test files + changelog) is real but architecturally trivial → `sonnet` /
`medium`.

## Goals

- Every outgoing user email (automated templates *and* admin ad-hoc/manual sends) that reaches a
  non-premium user ends with a short, soft, 2-3 line Premium benefit paragraph + a link to
  `https://fluent.lt/pricing`, placed after the email's existing signature/closing.
- The weekly leaderboard reward email (top-3, 1 free week just granted) gets distinct
  "convert-to-paid" copy instead of the generic pitch.
- The inactive-user re-engagement email gets distinct copy that ties the upsell directly to the
  deletion warning already in that email (Premium accounts are exempt from it).
- A user for whom `is_premium_active(user)` is `True` never sees the upsell, on any of the four
  send paths, with no exceptions.
- No new consent check is introduced — every call site already gates on `user.email_consent`
  upstream before reaching the send call.

## Non-Goals

- No changes to `is_premium_active`, Stripe, entitlement/grant logic, or the premium-granting code
  in `send_weekly_rewards` / `send_prepared_message` — this plan only decides whether to *append a
  paragraph*, never who gets Premium.
- No change to `send_prepared_message` — it sends `msg.body` verbatim, and the upsell is baked into
  that body at generation time (see Implementation items 3-4).
- No new DB columns, no migration, no change to `PreparedMessage`'s schema.
- No actual inactivity-deletion enforcement job. The re-engagement email's deletion warning stays
  exactly as unenforced as it is today; the new "Premium accounts aren't deleted for inactivity"
  line is copy-only, matching that existing style. Building a real enforced deletion job (and
  exempting Premium from it) is a separate, materially riskier feature (destructive user-data
  deletion) that the user explicitly deferred out of this plan.
- No frontend/UI change — `/dashboard/premium/page.tsx` and `pricing`'s i18n copy are read for
  reference only, not modified.
- No A/B testing or click-through instrumentation on the new link.

## Requirements

1. **`backend/email_templates.py` — two new pure functions**, keeping the file's existing
   zero-DB-import style:
   - `build_premium_upsell(lang: str, variant: Literal["generic", "convert", "inactive"] = "generic") -> str`
     — returns the RU or EN paragraph for `lang in ("ru", "en")`; for `lang == "both"` returns
     `f"{ru}\n\n— — —\n\n{en}"`, mirroring the separator already used in
     `generate_report_status_email`.
   - `append_premium_upsell(body: str, is_premium: bool, lang: str, variant: str = "generic") -> str`
     — returns `body` unchanged if `is_premium` is `True`; otherwise
     `f"{body}\n\n{build_premium_upsell(lang, variant)}"`.

2. **`backend/routers/reports.py::_notify_reporter`** — after
   `subject, body = generate_report_status_email(...)` and before `email_service.send_email(...)`,
   insert `body = append_premium_upsell(body, is_premium_active(user), "both")`. `user` is already
   in scope. New imports: `from quota import is_premium_active`; add `append_premium_upsell` to the
   existing `email_templates` import line.

3. **`backend/scheduler.py::generate_inactive_messages`** — both branches (custom admin template
   via `_load_template`, or the default `generate_reengagement_email`) converge into
   `subject, body` before `msg = PreparedMessage(...)` is constructed. Immediately before that
   construction, insert:
   ```python
   lang = user.lang if user.lang in ("ru", "en") else "ru"
   body = append_premium_upsell(body, is_premium_active(user), lang, "inactive")
   ```
   This bakes the footer into the *stored* draft body, so it matches both what gets emailed
   immediately and what an admin sees when reviewing/editing it via
   `PATCH /api/admin/messages/{id}`. Add a top-level `from quota import is_premium_active` and
   extend the existing `email_templates` import with `append_premium_upsell`.

4. **`backend/scheduler.py::generate_weekly_reward_messages`** — the raw-SQL query selects
   `id, email, name, lang, email_consent, score` but not `is_premium`/`premium_until`, so
   `is_premium_active` can't be computed from `row` directly. In the per-row loop, right after
   `subject, body = generate_reward_email(...)` / `generate_notice_email(...)` and before
   `msg = PreparedMessage(...)`, insert:
   ```python
   user_obj = session.get(User, row.id)
   variant = "convert" if msg_type == "reward" else "generic"
   body = append_premium_upsell(body, is_premium_active(user_obj), lang, variant)
   ```
   (`lang` is already computed earlier in the loop and reused as-is.) `User` is already imported;
   reuse the imports added in item 3. At most 5 extra point-lookups per weekly cron run —
   negligible. No change to `send_weekly_rewards`: its premium-grant logic runs *after* this
   generation step and is orthogonal to whether the upsell paragraph was included.

5. **`backend/routers/admin.py::send_email_to_user`** — after the existing
   `if not target.email_consent: raise HTTPException(403, ...)` check and before
   `email_service.send_email(target.email, payload.subject, payload.body)`, insert:
   ```python
   from email_templates import append_premium_upsell
   lang = target.lang if target.lang in ("ru", "en") else "ru"
   body = append_premium_upsell(payload.body, _is_premium_active(target), lang)
   ```
   then send `body` instead of `payload.body`. `_is_premium_active` is already imported at
   module top-level (line 17) — no new import needed for it.

6. **`backend/routers/admin.py::send_prepared_message`** — verification-only, no code change
   expected: confirm it still sends `msg.body` untouched (items 3-4 already bake the upsell into
   stored drafts at generation time).

7. **Copy** — soft, short (2-3 lines), tone-matched to existing templates. Leads with project
   sustainability (Premium subscriptions cover hosting/infrastructure and keep Fluent running)
   rather than a plain feature list; this framing and every line below was reviewed and approved by
   the user email-by-email before implementation:

   | Variant | Lang | Copy |
   |---|---|---|
   | `generic` | ru | `Кстати: Fluent живёт благодаря поддержке пользователей — Premium помогает оплачивать хостинг и инфраструктуру, без которых проекта просто не будет. Плюс с Premium снимается дневной лимит занятий.\n👉 https://fluent.lt/pricing` |
   | `generic` | en | `By the way — Fluent runs on user support: Premium covers the hosting and infrastructure that keep the project alive, and it also removes your daily session limit.\n👉 https://fluent.lt/pricing` |
   | `convert` | ru | `Пользуйтесь бесплатной неделей Premium! Она уже активна — и если Fluent вам полезен, будем благодарны, если вы останетесь на Premium и после её окончания: подписки — это то, что покрывает расходы на хостинг и не даёт проекту закрыться.\n👉 https://fluent.lt/pricing` |
   | `convert` | en | `Enjoy your free week of Premium — it's already active! If Fluent has been useful to you, we'd be grateful if you kept your subscription after the free week ends: subscriptions are what cover the hosting costs and keep the project alive.\n👉 https://fluent.lt/pricing` |
   | `inactive` | ru | `Кстати: аккаунты с Premium не удаляются за неактивность, а подписка помогает оплачивать хостинг и инфраструктуру, без которых Fluent не сможет существовать.\n👉 https://fluent.lt/pricing` |
   | `inactive` | en | `By the way — Premium accounts are never deleted for inactivity, and your subscription helps cover the hosting and infrastructure that keep Fluent alive.\n👉 https://fluent.lt/pricing` |

   `lang == "both"` (used only by the report-status email) composes the `ru` and `en` strings for
   the requested variant, joined by `"\n\n— — —\n\n"`, per `build_premium_upsell`'s spec above.

### Standing constraints

- All entitlement checks stay server-side: this plan only reads the already-server-computed
  `is_premium_active(user)` and the already-enforced `user.email_consent` gate at each of the four
  call sites; it introduces zero new client-facing trust decisions.
- N/A — no markup/styling/component change. This is a backend-only, plain-text email-copy change;
  the design-system parity test does not apply.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation —
  see Implementation items 8-11 and the Validation section below.

## Implementation

- [x] 1. `backend/email_templates.py` — add the six copy strings from the table above, plus
      `build_premium_upsell(lang, variant="generic")` and
      `append_premium_upsell(body, is_premium, lang, variant="generic")` per Requirement 1.
- [x] 2. `backend/routers/reports.py` — in `_notify_reporter`, add `from quota import
      is_premium_active` and add `append_premium_upsell` to the existing `email_templates` import;
      insert the `append_premium_upsell(body, is_premium_active(user), "both")` call per
      Requirement 2.
- [x] 3. `backend/scheduler.py` — add top-level `from quota import is_premium_active` and extend
      the `email_templates` import with `append_premium_upsell`; in `generate_inactive_messages`,
      insert the `lang`/`append_premium_upsell` lines immediately before the `PreparedMessage(...)`
      construction, per Requirement 3.
- [x] 4. `backend/scheduler.py` — in `generate_weekly_reward_messages`, insert the
      `user_obj = session.get(User, row.id)` / `variant` / `append_premium_upsell` lines in the
      per-row loop before the `PreparedMessage(...)` construction, per Requirement 4.
- [x] 5. `backend/routers/admin.py` — in `send_email_to_user`, add the local
      `append_premium_upsell` import, compute `lang`, and send the upsell-appended body instead of
      `payload.body`, per Requirement 5.
- [x] 6. `backend/routers/admin.py::send_prepared_message` — verify (no code change expected) that
      it still sends `msg.body` untouched, per Requirement 6.
- [x] 7. `documentation/CHANGELOG.md` — append entry `#18` describing the feature (every outgoing
      user email upsells non-premium users toward `https://fluent.lt/pricing`, framed around
      project sustainability; leaderboard reward recipients get convert-to-paid copy; the
      inactive-user email states Premium accounts are exempt from its deletion warning
      copy-only, no enforcement job added; the four call sites touched; the SQLite/Postgres test
      caveat for the weekly-reward generation path).
- [x] 8. New `backend/tests/test_email_templates.py` — unit tests for `build_premium_upsell`
      (generic ru/en, convert ru/en, inactive ru/en, `lang="both"` returns RU paragraph +
      `"— — —"` + EN paragraph for a given variant) and `append_premium_upsell`
      (`is_premium=True` short-circuits to the unchanged body; `is_premium=False` appends with the
      `"\n\n"` join; variant selection works).
- [x] 9. `backend/tests/test_reports.py` — extend the `email_recorder`-based tests: assert a
      non-premium reporter's status-change email body contains `"fluent.lt/pricing"`; add a new
      test that sets the reporter's `is_premium=True, premium_until=None` before triggering the
      status change, asserting the sent body does **not** contain `"fluent.lt/pricing"`.
- [x] 10. `backend/tests/test_scheduler.py` —
      (a) two new end-to-end tests calling `scheduler.generate_inactive_messages()` directly
      (patching `email_service.send_email`): a non-premium, 30+-days-inactive user's stored
      `PreparedMessage.body` and the sent body both contain the `inactive`-variant upsell in the
      user's `lang`; a premium inactive user's body contains neither the upsell nor
      `"fluent.lt/pricing"`.
      (b) per the SQLite-limitation caveat in Context, do **not** call
      `generate_weekly_reward_messages()` end-to-end; instead add a focused unit test that builds
      `User` objects directly and exercises the new per-row snippet from Requirement 4: a
      non-premium rank-1-3 user's resulting body contains the `convert` copy, a non-premium
      rank-4-5 user's body contains the `generic` copy, and an already-premium rank-1-3 user's body
      contains neither.
- [x] 11. New `backend/tests/test_admin_send_email.py` — tests for
      `POST /api/admin/users/{user_id}/send-email`, following `test_superadmin.py`'s
      `make_token`/`auth`/`_ensure_user`/`_get_user_id` pattern and patching
      `email_service.send_email`: a non-premium target's sent body is `payload.body + upsell`; a
      premium target's (set via `PATCH /api/admin/users/{id}/premium` with
      `is_premium: true, premium_until: null`) sent body equals `payload.body` unchanged; the
      existing 403-on-no-consent behavior is unaffected (regression check).

## Validation

- [x] `cd backend && .venv/bin/python -m pytest tests/test_email_templates.py -q`
- [x] `cd backend && .venv/bin/python -m pytest tests/test_reports.py -q`
- [x] `cd backend && .venv/bin/python -m pytest tests/test_scheduler.py -q`
- [x] `cd backend && .venv/bin/python -m pytest tests/test_admin_send_email.py -q`
- [x] Full regression: `cd backend && .venv/bin/python -m pytest -q`
- [x] Scenario — report-status email: non-premium reporter's email contains both the RU and EN
      generic-upsell paragraphs (separated by `"— — —"`) and a working `https://fluent.lt/pricing`
      link; a premium reporter's email contains neither. Verified via
      `test_resolve_notifies_reporter`/`test_no_upsell_for_premium_reporter` in `test_reports.py`
      (send-time assertions) plus the `lang="both"` unit test in `test_email_templates.py`
      (confirms the RU+`"— — —"`+EN composition `_notify_reporter` relies on).
- [x] Scenario — inactive re-engagement email: non-premium user's stored `PreparedMessage.body`
      **and** the actually-sent body both carry the `inactive`-variant upsell (deletion-exemption
      line) in the user's own language; premium user's does not; an admin-edited custom template
      still gets the upsell appended after the admin's custom copy. Verified via
      `test_generate_inactive_messages_appends_upsell_for_non_premium_user`/
      `..._no_upsell_for_premium_user` in `test_scheduler.py`; the custom-template sub-case is
      confirmed by direct code inspection of `generate_inactive_messages`
      (`backend/scheduler.py` lines 99-107) — the `append_premium_upsell` call sits after the
      custom-template/default `if`/`else` converges, so it applies to both branches structurally.
- [x] Scenario — weekly leaderboard emails: rank 1-3 non-premium recipient gets the `convert` copy,
      rank 4-5 non-premium recipient gets the `generic` copy (in addition to the pre-existing
      gamified notice-email pitch — expected, not a regression), and an already-premium rank 1-3
      user gets no upsell appended. Verified via `test_weekly_reward_top3_non_premium_gets_convert_copy`/
      `test_weekly_notice_rank4_5_non_premium_gets_generic_copy`/
      `test_weekly_reward_top3_premium_gets_no_upsell` in `test_scheduler.py`.
- [x] Scenario — admin ad-hoc send: non-premium target's received email is the admin's original
      text followed by the soft upsell; premium target's received email is the admin's original
      text, byte-for-byte unchanged; 403-on-no-consent still fires before any send is attempted.
      Verified via all three tests in `test_admin_send_email.py`.
- [x] Scenario — `send_prepared_message`: confirm it forwards `msg.body` verbatim, so a
      reward/notice/inactive draft sent later through this path still contains whatever upsell was
      baked in at generation time. Verified by direct code inspection of
      `backend/routers/admin.py::send_prepared_message` (lines 290-314) — unchanged, still calls
      `email_service.send_email(msg.user_email, msg.subject, msg.body)` with no upsell logic
      inserted, exactly as Requirement 6 specifies.
- [ ] Manual smoke: with the backend running locally and real SMTP env vars set, log in as
      superadmin and call `POST /api/admin/users/{id}/send-email` against a real non-premium test
      account; confirm the received email shows the typed message, then a blank line, then the
      soft upsell paragraph, then a working `https://fluent.lt/pricing` link — and that repeating
      the same call against a premium test account produces no upsell.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
```
