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

## Playwright MCP: "Browser is already in use"

If the MCP browser errors with `Browser is already in use for .../mcp-chrome-for-testing-<hash>`, a
previous Chrome-for-Testing instance is still holding the profile lock. Clear it with
`pkill -f "mcp-chrome-for-testing"`, wait a couple of seconds, then navigate again.
