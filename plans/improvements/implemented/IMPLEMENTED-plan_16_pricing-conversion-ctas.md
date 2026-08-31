---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: sonnet
suggested_effort: high
confirmed_model: sonnet
confirmed_effort: high
---

# Plan #16 — Pricing nav link + free→Premium conversion CTAs

## Context

Fluent has a working `/pricing` page and full Stripe subscription infrastructure (plan #11), but
two gaps limit conversion: (1) there is no menu link to `/pricing` anywhere in the app — the only
paths in are an already-premium user's own badge, a locked practice/grammar row, or hitting the
daily session limit; (2) the end-of-lesson screen (the moment right after finishing a study/review
session — highest-attention point in the whole app) says nothing about Premium at all for
non-premium users.

Decisions made with the user before this plan (via `AskUserQuestion`):
- The pricing link becomes a **6th pill** in the main top-nav strip (`components/Header.tsx`),
  alongside Слова/Фразы/Грамматика/Практика/Статьи. Note: those 5 are a documented, test-guarded
  shared-shell product family (`design-system-parity.spec.ts`'s `NAV_PAGES`, per this repo's
  CLAUDE.md); `/pricing` is **not** joining that family — it keeps its existing, documented
  heavy-border layout — it is only joining the same physical pill strip in `Header.tsx`.
- The end-of-lesson CTA (in `QuizSession.tsx`'s "done" screen) uses **support-the-mission** tone,
  matching the pricing page's existing voice ("Fluent isn't built to make money, Premium funds
  servers/development"), and shows on **every** non-premium session completion (it's a soft inline
  card, not a blocking modal, so "every time" doesn't mean "naggy").
- The pricing page gets a "less than a burger or a specialty coffee" price-framing line under the
  Premium price.
- Two extra conversion ideas were approved to fold into this same plan: a **conditional** daily
  session-limit warning (only near/at the limit — see the important precedent below) and a
  **milestone-triggered nudge** (streak/words-learned achievement).

**Important precedent found during research:** `QuotaBanner` — an *always-visible* "Sessions
today: N/limit" + "Get Premium" banner — was removed from `/dashboard/lists` and
`/dashboard/phrases` in changelog #9, at the user's explicit request. The user confirmed (via
`AskUserQuestion`) that the new daily-limit warning should avoid repeating that mistake by being
**conditional only** — it appears **only** when a free user has 1 or 0 sessions left today, not
as a persistent always-on banner — on the same two pages `QuotaBanner` used to occupy.

**A useful discovery:** `frontend/lib/i18n/{ru,en}.ts`'s `stats.motivations` object
(`streak3/7/14/30`, `known50/100`, etc.) and `lists.limitReached`/`sessionsToday`/`getPremium` are
**already-authored, currently-unused strings** — dead code left over from `QuotaBanner`'s removal
and from a milestone feature that was apparently never wired up. Both the daily-limit banner and
the milestone nudge in this plan **revive these exact strings** instead of writing new copy from
scratch, which also means this plan reduces dead code rather than adding to it.

**Model/effort rationale:** every sub-feature here reuses an already-proven pattern in this exact
codebase (the `/api/me/quota` fetch-on-mount pattern used on ~6 pages already; `Link
href="/pricing"` already exists in 3 places; localStorage-based one-time-dedup already used for
`star_level`/`fluent_complexity`). No backend, DB, or auth changes. But the diff touches ~10 files
across nav, i18n (3 files), the quiz done-screen, two list pages, and a new shared component, plus
4 new Playwright specs and doc updates — breadth, not novelty, so `high` effort at `sonnet` rather
than `medium`.

## Goals

- A "Pricing" nav pill (RU: "Тарифы") appears in `Header.tsx`'s top-nav strip on every page,
  active-highlighted when on `/pricing`.
- Every non-premium user who finishes a study or review session sees a soft, mission-toned Premium
  upsell card on the "done" screen, linking to `/pricing`. Premium/admin users never see it.
- `/pricing`'s Premium card states the price is "less than a burger or a specialty coffee" per
  month.
- A free user with 1 or 0 sessions left today sees a small inline notice on `/dashboard/lists` and
  `/dashboard/phrases` (existing pages, existing `quota` state) — silent otherwise, never a
  persistent always-on banner.
- A free user who newly crosses a streak (3/7/14/30 days) or words-known (50/100) milestone sees a
  one-time congratulatory card with a Premium mention, on `/dashboard/lists` (where `StatsBar`
  already renders `known`/`streak`). Never repeats for the same milestone (localStorage dedup).
- `documentation/design system/Component Library (as-built).html` and
  `documentation/CHANGELOG.md` reflect all of the above.

## Non-Goals

- No changes to entitlement logic, Stripe, pricing amount, or `is_premium_active()` — this is
  presentation/marketing only.
- No referral program (deferred — user chose to keep this plan scoped to the other 4 items).
- `/pricing` itself does **not** adopt the shared 5-page `PageShell`/`.page` shell — it keeps its
  documented heavy-border deviation; only the nav pill is shared.
- No A/B testing or analytics instrumentation beyond what already exists.
- No change to `design-system-parity.spec.ts`'s `NAV_PAGES` list (pricing isn't part of that
  family).

## Requirements

1. **Nav pill** — `Header.tsx`'s `navLinks` gets a 6th `<Link href="/pricing">` using
   `tr.nav.pricing`, active-state computed the same way as the other 5
   (`pathname.startsWith('/pricing')`), same pill styling as the existing 5 (no new visual
   pattern). Update the inline comment referencing "5 Russian nav pills" (the 1000px breakpoint
   rationale) to say 6.

2. **End-of-lesson upsell card** — In `QuizSession.tsx`'s `done` screen (~line 830), after the
   existing result message (`tr.common.perfectSession`/etc.) and before the primary/secondary
   buttons: fetch `/api/me/quota` once (same `fetch`-on-mount pattern as `PricingClient.tsx`/
   `Header.tsx`) to read `premium_active`. When `premium_active === false`, render a card with
   `tr.common.premiumUpsellTitle`/`premiumUpsellBody` and a `Link href="/pricing"` button
   (`tr.common.premiumUpsellButton`), `data-testid="premium-upsell-card"` /
   `"premium-upsell-cta"`. Shown for both `study` and `review` session modes, regardless of
   pass/fail. Never shown when `premium_active === true` or while the fetch hasn't resolved yet.

3. **Pricing page price-framing** — In `PricingClient.tsx`, under the Premium card's price row
   (~line 273, next to `tr.pricing.premiumPrice`), add a caption using new key
   `tr.pricing.priceComparison`, `data-testid="price-comparison"` (distinct from the existing
   `data-testid="premium-note"`, which is the subscription-renewal note — do not reuse that id).

4. **Daily-limit conditional banner** — New small component
   `frontend/app/dashboard/components/DailyLimitBanner.tsx`, taking the already-fetched `quota`
   object (`{ premium_active, sessions_today, daily_limit }`) as a prop. Renders nothing unless
   `!premium_active && daily_limit != null`. Let `remaining = daily_limit - sessions_today`:
   - `remaining <= 0` → reuse the existing (currently unused) `tr.lists.limitReached` string
     (already has `{count}`/`{limit}` placeholders) + `tr.lists.getPremium` button.
   - `remaining === 1` → new `tr.lists.limitNear` string + `tr.lists.getPremium` button.
   - `remaining >= 2` → render nothing.
   Rendered on `frontend/app/dashboard/lists/page.tsx` and `frontend/app/dashboard/phrases/page.tsx`
   near the top of page content, passing each page's existing `quota` state — no new fetch on
   either page.

5. **Milestone nudge** — In `StatsBar.tsx` (already fetches `known`/`streak` via `/api/me/stats`):
   add one more fetch to `/api/me/quota` for `premium_active` (same pattern as everywhere else).
   On each stats load, for a non-premium user, check in order: streak crossed a new threshold in
   `[30, 14, 7, 3]` (highest first) using `localStorage['fluent_milestone_streak_shown']` as the
   last-shown threshold; if none, check known-words crossed a new threshold in `[100, 50]` using
   `localStorage['fluent_milestone_words_shown']`. On first crossing, render a dismissible card
   using the matching **existing, currently-unused** `tr.stats.motivations.streakN` /
   `tr.stats.motivations.knownN` string as the headline, plus new
   `tr.stats.milestonePremiumHint` body and `tr.stats.milestonePremiumButton` → `/pricing` link.
   Immediately persist the crossed threshold to localStorage (view = dedup, per user's stated
   design) so it never re-shows for that threshold. `data-testid="milestone-nudge"` /
   `"milestone-nudge-dismiss"`. At most one nudge rendered at a time (streak takes priority over
   words if both newly crossed in the same load).

6. **i18n** — add to `frontend/lib/i18n/types.ts` (and both `ru.ts`/`en.ts`):
   - `nav.pricing`
   - `pricing.priceComparison`
   - `common.premiumUpsellTitle` / `premiumUpsellBody` / `premiumUpsellButton`
   - `lists.limitNear`
   - `stats.milestonePremiumHint` / `milestonePremiumButton`

   Exact copy:

   | Key | RU | EN |
   |---|---|---|
   | `nav.pricing` | Тарифы | Pricing |
   | `pricing.priceComparison` | Меньше, чем бургер или чашка кофе в кофейне — в месяц | Less than a burger or a specialty coffee — per month |
   | `common.premiumUpsellTitle` | Fluent живёт благодаря Premium | Fluent runs on Premium support |
   | `common.premiumUpsellBody` | Мы не показываем рекламу и не продаём данные — Premium от таких же учеников, как ты, покрывает сервера и новые уроки. | No ads, no data selling — Premium from learners like you covers the servers and new lessons. |
   | `common.premiumUpsellButton` | Узнать про Premium | See Premium |
   | `lists.limitNear` | Осталась последняя бесплатная сессия на сегодня. Premium снимает дневной лимит. | This is today's last free session. Premium removes the daily limit. |
   | `stats.milestonePremiumHint` | Premium снимает дневной лимит и поддерживает Fluent. | Premium removes the daily limit and supports Fluent. |
   | `stats.milestonePremiumButton` | Узнать про Premium | See Premium |

### Standing constraints
- All validation must be server-side (never frontend-only). N/A for entitlement here — this plan
  is presentation-only and reads `premium_active` from the existing, already-server-validated
  `/api/me/quota` endpoint; it introduces no new server trust decisions.
- This plan touches markup/styling/components: read `documentation/design system/Component
  Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens
  (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after the
  `Header.tsx` change. Update the component library in the same change (new "Deliberate
  deviations" row for the 6th pill; document the new upsell-card/banner/nudge patterns).
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `frontend/lib/i18n/types.ts` — add the 8 new keys listed above (`nav.pricing`,
      `pricing.priceComparison`, `common.premiumUpsellTitle/Body/Button`, `lists.limitNear`,
      `stats.milestonePremiumHint/Button`).
- [x] 2. `frontend/lib/i18n/ru.ts` — add the same keys with the RU copy from the table above.
- [x] 3. `frontend/lib/i18n/en.ts` — add the same keys with the EN copy from the table above.
- [x] 4. `frontend/components/Header.tsx` — add the 6th "Pricing" pill to `navLinks` (shared by
      desktop strip and mobile dropdown, both already render the same `navLinks` variable);
      compute `pricingActive = pathname.startsWith('/pricing')`; update the "5 Russian nav pills"
      breakpoint comment to reflect 6.
- [x] 5. `frontend/app/pricing/PricingClient.tsx` — add a `data-testid="price-comparison"` caption
      under the Premium price using `tr.pricing.priceComparison`.
- [x] 6. `frontend/app/dashboard/components/QuizSession.tsx` — add a one-time `/api/me/quota`
      fetch (mirrors `PricingClient.tsx`'s `fetchQuota`) storing `premiumActive: boolean | null`;
      in the `done` screen render block, insert the upsell card (`data-testid=
      "premium-upsell-card"`, CTA `data-testid="premium-upsell-cta"` linking to `/pricing`) when
      `premiumActive === false`, positioned after the existing result-message paragraph and before
      the `flex flex-col gap-3` button block.
- [x] 7. `frontend/app/dashboard/components/DailyLimitBanner.tsx` (new) — presentational
      component per Requirement 4, taking `quota: { premium_active, sessions_today, daily_limit }`
      as a prop; returns `null` per the render rules above; otherwise a small inline
      `border-line rounded-[14px]` notice (match existing card token conventions) with the message
      + `tr.lists.getPremium` → `/pricing` link.
- [x] 8. `frontend/app/dashboard/lists/page.tsx` — render `<DailyLimitBanner quota={quota} />`
      near the top of page content, reusing the existing `quota` state (no new fetch).
- [x] 9. `frontend/app/dashboard/phrases/page.tsx` — same as #8, reusing its existing `quota`
      state.
- [x] 10. `frontend/app/dashboard/components/StatsBar.tsx` — add the `/api/me/quota` fetch for
      `premium_active`; add the milestone-crossing check (streak `[30,14,7,3]` then known
      `[100,50]`) against `localStorage['fluent_milestone_streak_shown']` /
      `['fluent_milestone_words_shown']`; render the dismissible nudge card
      (`data-testid="milestone-nudge"`, dismiss `data-testid="milestone-nudge-dismiss"`) using the
      matching existing `tr.stats.motivations.*` string + the two new `stats.milestonePremium*`
      strings; persist the threshold to localStorage as soon as it's shown (view = dedup).
- [x] 11. `documentation/design system/Component Library (as-built).html` — update the "Nav tab
      pills" row / the "5 Russian nav pills" deviation note to say 6 and mention Pricing; add a new
      "Deliberate deviations" row noting Pricing joins the pill strip but not the 5-page
      `PageShell` family; document the new upsell-card / daily-limit-banner / milestone-nudge
      visual patterns so future work matches them.
- [x] 12. `documentation/CHANGELOG.md` — append entry `#16` summarizing this change (nav link,
      end-lesson upsell, price-framing, conditional daily-limit banner reviving dead
      `QuotaBanner`-era strings, milestone nudge reviving dead `motivations` strings).
- [x] 13. New test `frontend/tests/pricing-nav-link.spec.ts` — Pricing pill visible in header on
      an arbitrary dashboard page, links to `/pricing`, active-highlighted when already on
      `/pricing`.
- [x] 14. New test `frontend/tests/premium-upsell-end-of-lesson.spec.ts` — mock `/api/me/quota`
      with `premium_active:false`, complete a study session, assert the upsell card + working
      `/pricing` link; re-run with `premium_active:true` and assert the card is absent.
- [x] 15. New test `frontend/tests/daily-limit-banner.spec.ts` — on `/dashboard/lists` (and one
      case for `/dashboard/phrases`): mock quota with 2+ remaining → banner absent; 1 remaining →
      `limitNear` text visible; 0 remaining → `limitReached` text visible; `premium_active:true`
      with 0 remaining → banner absent.
- [x] 16. New test `frontend/tests/milestone-nudge.spec.ts` — mock stats crossing e.g. `streak:7`
      (localStorage empty) → nudge visible with the `streak7` motivation string; reload with the
      same `streak:7` and localStorage already at `7` → nudge absent; `premium_active:true` → never
      shown regardless of streak/known values.

## Validation

- [x] `cd frontend && npx tsc --noEmit`
- [x] `cd frontend && npx playwright test pricing-nav-link premium-upsell-end-of-lesson daily-limit-banner milestone-nudge --reporter=list`
- [x] `cd frontend && npx playwright test design-system-parity --reporter=list`
- [x] Regression: `cd frontend && npx playwright test quota premium-badge-click-to-pricing stats-card-alignment stripe-checkout-cta --reporter=list` (all touch `Header.tsx`/`quota`/`/pricing` and must still pass)
- [x] Smoke: navigate to `/dashboard/lists`, confirm the "Тарифы" pill is visible and clicking it goes to `/pricing` with the pill highlighted there — covered by `pricing-nav-link.spec.ts` (passing, see item 229's run)
- [x] Smoke: as a free-tier test user, finish a study session and confirm the Premium upsell card appears and its button opens `/pricing` — covered by `premium-upsell-end-of-lesson.spec.ts` (passing)
- [x] Smoke: as a premium test user (or admin), finish a session and confirm no upsell card appears — covered by the same spec's "not shown to a Premium user" / "not shown to an admin" cases (passing, also individually re-verified — see Definition of Done note below)
- [x] Edge case: free user with exactly 1 session left today sees the `limitNear` notice on both `/dashboard/lists` and `/dashboard/phrases`; 0 left sees `limitReached`; 2+ left sees neither — covered by `daily-limit-banner.spec.ts` (passing)
- [x] Edge case: crossing a milestone shows the nudge once; refreshing the page again does not re-show it — covered by `milestone-nudge.spec.ts` (passing)
- [ ] News post written and published via `/news-writer` — left for the calling flow (feature-analyst Phase 5), not this skill's job

## Definition of Done

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```

**Result:** `tsc --noEmit` is clean. The full suite (535 tests) was run twice; each run reported a
different, non-overlapping set of 17-32 failures with no correlation to the files this plan
touched. Root-caused and documented in `documentation/full-suite-test-flakiness.md`: (1)
resource-contention timeouts under full parallelism — a spec logged as "15.2 minutes" in the full
run passes in 1.7s alone — and (2) a pre-existing `localhost:8000`/`:3000` redirect-assertion
mismatch, unrelated to this plan. Both directly-relevant tests
(`premium-upsell-end-of-lesson.spec.ts`, `quota-banner-removed.spec.ts`, the latter asserting the
pre-existing "no persistent banner" invariant this plan's `DailyLimitBanner` must not violate) were
re-run in isolation multiple times and passed every time, as did every other spec touching a file
this plan modified (`Header.tsx`, `QuizSession.tsx`, `StatsBar.tsx`, `lists/page.tsx`,
`phrases/page.tsx`, `PricingClient.tsx`) — `quota`, `premium-badge-click-to-pricing`,
`stats-card-alignment`, `stripe-checkout-cta`, `design-system-parity`, all green. No regression
attributable to this plan.
