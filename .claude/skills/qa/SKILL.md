---
name: qa
description: Full QA cycle for the Fluent app — runs Playwright tests, verifies UI consistency, and checks server health. Use after implementing any feature or fix.
---

Perform a full QA cycle for the Fluent app. Follow these steps in order:

## 1. Verify servers are running

Check that both backend and frontend are up:
- Backend + static files: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/` should return 200
- If not running, remind the user to start the servers before QA

## 2. Run all Playwright autotests

```bash
cd frontend && npx playwright test --reporter=list
```

- Report the total passed/failed count
- For any failures, show the test name, error message, and file:line location
- Do NOT retry flaky tests blindly — investigate the root cause

## 3. Login via Playwright browser (required before UI checks)

Before navigating auth-gated pages, open the app and ask the user to log in:

1. Navigate to `http://localhost:3000/` using the Playwright browser tool
2. Tell the user: "Please log in using the browser — click 'Войти' and complete Google auth"
3. Ask the user to confirm when done (use AskUserQuestion: "Have you logged in?" with options "Yes, logged in" / "Skip login")
4. If logged in, take a snapshot to confirm the authenticated state (user avatar or dashboard content visible)

## 4. UI consistency check (use Playwright browser)

Navigate to key pages and verify nothing was accidentally removed:

| Page | Things to verify |
|------|-----------------|
| `/` | Branding ("fluent") visible |
| `/dashboard/lists` | Nav links: Словари, Грамматика, Практика |
| `/dashboard/grammar` | Beta disclaimer banner, Падежи category expanded |
| `/dashboard/practice` | Heading "Практика" visible |
| `http://localhost:3000/dashboard/admin/` | Admin panel loads, no errors in console, key admin UI elements visible |

## 5. Clean up Playwright MCP logs

Delete stale console log files left by the Playwright MCP server:

```bash
rm -f /Users/Artur_Belski/Documents/src/fluent/.playwright-mcp/console-*.log
```

## 6. Report results

Summarise findings in this format:

```
✓ Tests: X passed, Y failed
✓ UI: navigation intact / ISSUE: <what's missing>
✓ Server: healthy / ISSUE: <what's wrong>
✓ Logs: cleaned up

Failures:
- <test name> — <error> (<file>:<line>)
```

If $ARGUMENTS is provided, treat it as a specific area to focus QA on (e.g. "grammar", "auth", "navigation") and filter tests and UI checks accordingly.

## Notes

- Test config: `frontend/playwright.config.ts` — baseURL is `http://localhost:3000`, headless Chromium
- Test files: `frontend/tests/*.spec.ts`
- Fake JWT helper is available in navigation.spec.ts — reuse the pattern for new auth-gated tests
- All validation is server-side; do not trust frontend-only checks
