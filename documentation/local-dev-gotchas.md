# Local dev gotchas

Short notes on non-obvious local-environment behaviour, so future sessions don't re-derive them.

## `npm run build` breaks a running `next dev` server

Running `npm run build` in `frontend/` while a `next dev` server is running **corrupts the dev
server's serving state**. `next build` rewrites `.next/`, so the already-running dev process keeps
handing out chunk URLs that no longer exist. The symptom is a page that renders only the navbar and
footer (an otherwise-empty `<body>`, ~200 chars of text) plus console 404s like:

```
GET /_next/static/chunks/main-app.js?v=... 404 (Not Found)
GET /_next/static/chunks/app-pages-internals.js 404 (Not Found)
GET /_next/static/css/css-app_globals_css-...css 404 (Not Found)
```

This looks alarmingly like "my change broke the whole app" — it isn't. **Fix:** restart the dev
server (kill the `next dev` + `next-server` pair, then `npm run dev`). Per CLAUDE.md, restart the
existing one rather than starting a second.

Practical rule: if you need a production build to smoke-test the static export, either stop
`next dev` first, or restart it afterwards.

## The backend redirects to `:3000` when `DEV` is set in `backend/.env`

With `DEV` set, `http://localhost:8000/` answers `307` and redirects to `http://localhost:3000/`
(the `next dev` server) instead of serving the static export from `frontend/out`. So:

- Browsing `localhost:8000` in DEV mode actually exercises **live frontend source**, not the build —
  frontend edits show up without a rebuild.
- A *relative* `fetch('/api/...')` from a page loaded this way hits **next dev on :3000** and returns
  a 404 HTML page, not the API. When probing endpoints from the browser console, use the absolute
  `http://localhost:8000/api/...`.
- Verifying the real static export (what production serves) requires unsetting `DEV` and rebuilding.

## `PW_BASE_URL=http://127.0.0.1:8000` breaks specs that fetch the live API

`frontend/playwright.config.ts` offers `PW_BASE_URL` to pin the address family, and it is the right
tool for that job — but it is the wrong reflex for a connection error, and it breaks a whole class
of tests. Specs like `issue-156-*` and `issue-158-*` load a page and then `fetch()` the real API
with an **absolute** `http://localhost:8000/...` URL. Setting `PW_BASE_URL=http://127.0.0.1:8000`
makes the page origin `127.0.0.1:8000` while the fetch still targets `localhost:8000` — a different
origin. `backend/main.py` builds its CORS allowlist from `{localhost:3000, localhost:8000,
FRONTEND_URL}`, with **no 127.0.0.1 entry**, so the browser blocks the request and the test fails
inside `page.evaluate` rather than at navigation. Run those specs on the default `baseURL`.

Worth knowing because the two failure modes look alike but have opposite fixes: if `page.goto`
itself dies with `ERR_CONNECTION_REFUSED` on `/`, that is almost always **DEV mode** redirecting to
`:3000` (see the section above) — restart uvicorn with `DEV=false`, do not change the base URL.

## Playwright MCP: "Browser is already in use"

If the MCP browser errors with `Browser is already in use for .../mcp-chrome-for-testing-<hash>`, a
previous Chrome-for-Testing instance is still holding the profile lock. Clear it with
`pkill -f "mcp-chrome-for-testing"`, wait a couple of seconds, then navigate again.

## Playwright tests can silently exercise STALE frontend code

`backend/out` is a **symlink to `frontend/out`**, the Next.js static export. When no `next dev`
server is running on :3000, uvicorn serves that export directly — so `npx playwright test` exercises
whatever was last built, **not** your working tree.

The dangerous part is the failure mode: tests do not error, they just run against the old UI. A spec
asserting new behaviour fails with a confusing message (an attribute reading `null`, a stage that
never appears), and — much worse — a spec asserting *unchanged* behaviour **passes**, giving false
confidence that a change is safe.

The tell: dump the element you are asserting on (`el.outerHTML`) and look for an attribute you know
you just added. If it is absent from the DOM but present in the `.tsx` source, you are looking at
the old export, not a bug in your code.

**Fix:** `cd frontend && npm run build` before running Playwright, whenever frontend source changed.
`start.sh` already does this (`npm run build` then restart uvicorn); running specs by hand does not.
The alternative is to start `next dev` on :3000 and let DEV-mode redirect serve live source — but
only one dev server per side, per CLAUDE.md.
