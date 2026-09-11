# Production DB latency: every query in a request path costs ~0.2–0.3s

Measured 2026-09-11 while planning #23 (inbox).

- Neon database: `us-east-1` (AWS, Virginia) — from the host in `backend/.env` `DATABASE_URL`.
- Render web service: `render.yaml` sets **no `region`**, so it runs in Render's default (Oregon).
  Every query crosses the continent.
- Method: time server-side TTFB (`curl -w '%{time_starttransfer} - %{time_pretransfer}'`, 6 samples
  each) of two public production endpoints:
  - `GET /api/billing/config` — no DB access: ~260–310ms (occasional ~600ms).
  - `GET /api/admin/settings/cefr-thresholds` — one `SELECT` (+ `pool_pre_ping` on checkout):
    ~800–930ms (one ~450ms outlier).
  - Difference ≈ 550ms for pre-ping + 1 query → **roughly 0.2–0.3s per round trip in production.**
- From a dev machine it is ~180–400ms per round trip (see `verb-principal-forms.md`, #22).

## How to apply

- Treat each added query in a hot request path (anything fetched on every page load, route change or
  tab refocus — e.g. `/me/stats`, `/me/quota`, header fetches) as ~0.25s of user-visible latency.
  Every authenticated request already pays one round trip for `require_user`'s `User` lookup.
- Prefer: bulk statements over loops, per-process caches for rarely-changing settings, fetching on
  page load / tab refocus instead of on every client-side navigation.
- Guard with statement-count tests (`before_cursor_execute` listener), not wall-clock timings.

## Not done (possible fix)

Moving the Render service to `region: virginia` (same region as Neon) would likely cut this to a few
ms per round trip. Not investigated or attempted — needs a service recreate/migration on Render.
