---
kind: feature
status: done
iteration: 1
max_iterations: 8
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #32 — One Premium offer, sold where the user hits the wall

## Context

Audited every place Fluent sells Premium (screenshots:
`temp_files/screenshots/premium-upsell-audit/`). Same product, four different designs, and only
two of them named the price:

| Surface | Button | Price shown |
| --- | --- | --- |
| Daily limit on `/dashboard/lists` | green `emerald-600`, flat card | yes |
| "Создавайте свои списки" on the same page | **orange** `amber-500` pill, amber gradient card | no |
| The 429 screen inside a study session | dark `gray-900`, ⏳ emoji | no |
| `/dashboard/premium` | dark, and a **`mailto:` link** | no |

`/dashboard/premium` was the worst of them and had one entry point —
`practice/[id]/page.tsx` pushed there when a free user opened a Premium test. It then:

1. **Said "этот тест" about a test no longer on screen.** The user had been navigated away; the
   page never received the test's name or id.
2. **Offered no way back to it.** "Назад к практике" went to the category list.
3. **Sold through `mailto:`** — "обратитесь к администратору… активируем вручную в течение
   24 часов" — while Stripe Checkout had been live since #11. Production
   `GET /api/billing/config` returns `{"enabled": true}`.

That last one matters against the funnel: 144 users, 3 ever reached Stripe, 2 pay (#31).

## Goals

- One card sells Premium everywhere, so the offer is recognisable and always names the price.
- A free user who opens a Premium practice test is offered it **in place**, never navigated away.
- No surface sells Premium through email when Checkout works.

## Non-Goals

- The orange "Создавайте свои списки" card and the cookie banner, both off-system. Recorded in
  the audit; separate change.
- The 429 screen inside a study session — it is a full-page state mid-session, not a card slot.
- Changing price, plan contents or Checkout itself.

## Implementation

- [x] New `frontend/app/dashboard/components/PremiumOfferCard.tsx` — flat `border border-line
      rounded-[14px]` card: title, subtitle, perks, one green button, price line beneath it.
      Copy is passed in; shape, button and price line never vary. `data-testid` is the root id,
      with `-cta` and `-price` derived from it.
- [x] `DailyLimitBanner` renders it at 0 remaining. The 1-remaining thin nudge is unchanged —
      that user can still study, so a full card there interrupts rather than offers (#25).
- [x] `practice/[id]` renders it inline above the test list instead of
      `router.push('/dashboard/premium')`. The list stays on screen and the URL does not change.
- [x] Practice gets its own perks (`premiumWallPerks`) led by "Все практические тесты без
      ограничений" — the user hit a practice test, so the generic word-list perks read as a
      non-sequitur.
- [x] Deleted `frontend/app/dashboard/premium/` — its only caller is gone, and `/pricing` already
      does the same job with a real Checkout.
- [x] Price sits under the button, not inside it. It must stay on the card before the click (#25
      measured 28 users hitting a priceless wall, none reaching Checkout), but a button should
      name the action rather than carry the terms — and the old label wrapped at 375px.
- [x] Copy rewritten: two short sentences instead of one long one with "И…" tacked on, and the
      support line stands on its own — «Подписки оплачивают серверы и развитие Fluent.»

## Validation

- [x] `frontend/tests/practice-premium-wall.spec.ts` — 6 cases: offered in place with the URL
      unchanged and the list still visible, price under the button and not on it, English, 375px
      in both languages, and `/dashboard/premium` now 404s.
- [x] `frontend/tests/daily-limit-banner.spec.ts` updated for the derived test ids.
- [x] `design-system-parity.spec.ts` — 12 passed.

## Definition of Done

```bash
cd frontend && npx playwright test tests/practice-premium-wall.spec.ts tests/daily-limit-banner.spec.ts tests/design-system-parity.spec.ts
cd backend && .venv/bin/python -m pytest -q
```

User-facing checks — all three required:

- [x] **Both languages.** Practice paywall and daily-limit card verified in RU and EN.
- [x] **Mobile at 375px.** Both surfaces; the spec asserts the card stays inside the viewport and
      `document.documentElement.scrollWidth <= 375`.
- [x] **Screenshots.** 6 in `temp_files/screenshots/plan_32_one-premium-offer/` —
      `practice-wall-{ru,en,mobile-ru,mobile-en}`, `daily-limit-{ru,en}`, the last two proving
      both surfaces now render the same card.
