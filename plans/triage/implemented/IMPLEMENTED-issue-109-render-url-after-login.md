# Issue #109 — /dashboard/lists

**Reported:** 2026-06-01 11:45:26
**Status:** open
**Description:** после логина я вижу в строке браузера https://fluent-qhk8.onrender.com/ а не fluent.lt

## Root cause

The `_origin()` function in `backend/auth.py` reconstructs the public-facing origin from the `Host` HTTP header of the incoming request. When Render proxies a request to the backend container, the `Host` header it forwards is the internal Render service hostname (`fluent-qhk8.onrender.com`) rather than the custom domain (`fluent.lt`). The function only falls back to `FRONTEND_URL` if `host` is completely empty — which never happens — so the user is always redirected to the Render URL after OAuth.

Additionally, `GOOGLE_REDIRECT_URI` from env vars is never actually used in `auth.py`; the code dynamically builds `redirect_uri` using `_origin()` on both the `/google` login initiation and `/callback` token exchange endpoints. This means the env var has no effect.

## Fix plan

1. Edit `backend/auth.py` — update `_origin()` to trust `FRONTEND_URL` when it is explicitly configured (i.e. not localhost):

```python
def _origin(request: Request) -> str:
    if FRONTEND_URL and not FRONTEND_URL.startswith("http://localhost"):
        return FRONTEND_URL.rstrip("/")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", "")
    return f"{scheme}://{host}" if host else FRONTEND_URL
```

2. Verify that Render's environment dashboard has `FRONTEND_URL=https://fluent.lt` set (it is declared in `render.yaml` as `sync: false`, meaning it must be set manually in the Render dashboard).

3. Verify in Google Cloud Console that `https://fluent.lt/api/auth/callback` is listed as an authorized redirect URI (since `_origin()` now returns `https://fluent.lt`, the redirect URI passed to Google will be `https://fluent.lt/api/auth/callback`).

4. Deploy and test the full login flow end-to-end: click login → Google OAuth → confirm the browser lands on `https://fluent.lt/dashboard`.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #109 — After login, browser shows fluent-qhk8.onrender.com instead of fluent.lt. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 109;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-109-render-url-after-login.md` → `plans/triage/implemented/IMPLEMENTED-issue-109-render-url-after-login.md`).
