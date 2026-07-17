---
name: fix-issue-from-triage
description: Fix a triaged issue from plans/triage/ — read the plan, apply the fix, run smoke tests, and leave the local server ready for user validation.
---

Fix a triaged issue by following its pre-written plan from `plans/triage/`.

## Step 1 — Locate the plan file

If `$ARGUMENTS` is provided, treat it as an issue number (e.g. `35`) or partial filename.
- Search `plans/triage/` (not `implemented/` or `hold/`) for a file matching `issue-<number>` or the given string.
- If no match is found, list all open plan files and use `AskUserQuestion` to ask which one to fix.

Read the matched plan file in full before proceeding.

## Step 2 — Understand and apply the fix

The plan file contains a **Root cause** section and a **Fix plan** section. Follow the Fix plan steps exactly.

Fix types you may encounter:

### Data-only fix (SQL)
- Read `backend/.env` and extract `DATABASE_URL`.
- Run all SQL statements using a psql heredoc so they execute in one session:
  ```bash
  psql "<DATABASE_URL>" <<'EOF'
  <SQL statements>
  EOF
  ```
- Run the verification SELECT from the plan (if present) and display results as a markdown table.
- If the plan has no verification SELECT, write one yourself targeting the updated rows.

### Code fix
- Read the affected files before editing.
- Apply the minimal change described in the plan — do not refactor surrounding code.
- If the fix requires a frontend rebuild, do it (see Step 3).

### Mixed fix (SQL + code)
- Apply SQL changes first, then code changes.

## Step 3 — Rebuild frontend if code was changed

Only rebuild if Step 2 touched frontend files:

```bash
cd frontend && npm run build
```

If the build fails, fix the error before continuing.

## Step 4 — Ensure local server is running and ready

For user validation the backend must serve the built static export (not DEV mode).

1. Check if a server is already running on port 8000:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
   ```
2. If the response is not `200`, start the backend:
   ```bash
   cd backend && .venv/bin/python -m uvicorn main:app --port 8000 &
   sleep 2
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
   ```
3. Report whether the server was already running or was just started.

## Step 5 — Smoke test the fix

Navigate to the URL from the plan's header (e.g. `/dashboard/lists/187/study`) using the Playwright browser:

1. Open `http://localhost:8000<path>` — substitute the path from the plan's `# Issue #N — <path>` line.
2. Take a screenshot.
3. Verify the specific data fixed in the issue is now correct (e.g. translation shown, word displayed).
4. If a Playwright autotest exists for this fix, run it:
   ```bash
   cd frontend && npx playwright test --reporter=list
   ```
   Report pass/fail counts.

If the smoke check fails, investigate and fix before proceeding to Step 6.

## Step 6 — Confirm resolution with user

Use `AskUserQuestion` to ask:
- Question: `"Issue #<N> — <one-line summary of what was fixed>. Mark as resolved?"`
- Options: `"Yes — mark resolved"`, `"No — something looks wrong"`

If the user selects **Yes**:
1. Call the resolve API endpoint (triggers reporter email + Telegram notification):
   ```bash
   cd backend && .venv/bin/python3 -c "
   import sys; sys.path.insert(0, '.')
   from dotenv import load_dotenv; load_dotenv()
   from sqlmodel import Session
   from database import engine
   from models import MistakeReport, User
   import email_service, telegram_service
   from email_templates import generate_report_status_email
   with Session(engine) as s:
       r = s.get(MistakeReport, <N>)
       r.status = 'resolved'
       s.add(r); s.commit(); s.refresh(r)
       u = s.get(User, r.user_id)
       if u and u.email_consent:
           subj, body = generate_report_status_email(u.name, r.description, 'resolved')
           email_service.send_email(u.email, subj, body)
           telegram_service.send_telegram(f'📬 Report #<N> → resolved — email sent to {u.email}')
           print(f'Email sent to {u.email}')
       else:
           print('No email sent (no consent or anonymous user)')
   "
   ```
2. Move the plan file:
   ```bash
   mv plans/triage/issue-<N>-*.md plans/triage/implemented/IMPLEMENTED-issue-<N>-*.md
   ```
3. Report: "Issue #<N> marked resolved. Plan moved to `implemented/`."

If the user selects **No**, ask a follow-up `AskUserQuestion`: "What still looks wrong?" and investigate.

## Notes

- DATABASE_URL is in `backend/.env` — read it fresh every time, never hard-code it.
- Do not push to git.
- For destructive SQL (DELETE without WHERE, DROP, TRUNCATE) ask the user to confirm first.
- Triage plan files live in `plans/triage/`. Resolved files go to `plans/triage/implemented/` with the `IMPLEMENTED-` prefix. Blocked files live in `plans/triage/hold/`.
- The plan may reference optional steps (e.g. "Option B — add a new word row"). Only do these if the plan explicitly marks them as required, or the user asks.
