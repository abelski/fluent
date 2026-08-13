---
name: fix-issue-from-triage
description: Fix a triaged issue from plans/triage/active/ — delegate the fix + tests to the ralph-implement loop, smoke test, and leave the local server ready for user validation before confirming resolution.
---

Fix a triaged issue by following its pre-written plan from `plans/triage/active/`.

## Step 1 — Locate the plan file

If `$ARGUMENTS` is provided, treat it as an issue number (e.g. `35`) or partial filename.
- Search `plans/triage/active/` (not `implemented/` or `hold/`) for a file matching `issue-<number>` or the given string.
- If no match is found, list all open plan files and use `AskUserQuestion` to ask which one to fix.

`/triage` always writes plan files with frontmatter `status: draft` — there's no separate
approval UI for the bugfix pipeline the way `feature-analyst` has one; the user invoking this
skill on a specific issue *is* the approval. If the located plan's `status` is still `draft`,
flip it to `approved` now, before delegating in Step 2 (this is what lets `ralph-implement`
proceed instead of bouncing it back as unapproved).

## Step 2 — Delegate the fix and tests

```
Skill(skill: "ralph-implement", args: "plans/triage/active/issue-<N>-*.md")
```

`ralph-implement` reads the plan's `## Root cause` and `## Fix plan` checklist, applies each item
(code fix, data-only fix, or mixed — it handles all three), then works through `## Tests`,
running real commands and retrying failures up to the plan's `max_iterations` before giving up.
It owns all checkbox flipping, retry/iteration bookkeeping, and the final `## Definition of Done`
gate. Do not duplicate any of that logic here.

- If it reports `status: blocked` — relay its `## Blocked` section to the user verbatim and stop.
  Do not attempt to silently finish the fix yourself.
- If it reports `status: done` — proceed to Step 3. The plan file is still in `plans/triage/active/`
  at this point (`ralph-implement` never moves files — that stays this skill's job, see Step 5).

## Step 3 — Ensure local server is running and ready

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

## Step 4 — Smoke test the fix

Navigate to the URL from the plan's header (e.g. `/dashboard/lists/187/study`) using the Playwright browser:

1. Open `http://localhost:8000<path>` — substitute the path from the plan's `# Issue #N — <path>` line.
2. Take a screenshot.
3. Verify the specific data fixed in the issue is now correct (e.g. translation shown, word displayed).

(The Playwright autotest suite itself already ran as part of `ralph-implement`'s `## Tests`/
`## Definition of Done` pass in Step 2 — this step is the human-facing visual check on top of
that, not a repeat of it.)

If the smoke check fails, investigate and fix before proceeding to Step 5.

## Step 5 — Confirm resolution with user

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
   mv plans/triage/active/issue-<N>-*.md plans/triage/implemented/IMPLEMENTED-issue-<N>-*.md
   ```
3. Report: "Issue #<N> marked resolved. Plan moved to `implemented/`."

If the user selects **No**, ask a follow-up `AskUserQuestion`: "What still looks wrong?" and investigate.

## Notes

- This skill is the pipeline-specific wrapper around `ralph-implement`, not a reimplementation of
  it — it owns issue lookup, the browser-based smoke check, the human resolution gate, DB update,
  notifications, and the `implemented/` move, exactly the parts of this flow that are unique to
  bugfixes and have no equivalent in the feature pipeline. `ralph-implement` itself never touches
  the DB directly, never notifies anyone, and never moves plan files.
- DATABASE_URL is in `backend/.env` — read it fresh every time, never hard-code it. (SQL-fix
  checklist items inside `ralph-implement`'s delegated pass follow the same rule — see the
  `ralph-implementer` agent definition.)
- Do not push to git.
- For destructive SQL (DELETE without WHERE, DROP, TRUNCATE) ask the user to confirm first.
- Triage plan files live in `plans/triage/active/`. Resolved files go to `plans/triage/implemented/` with the `IMPLEMENTED-` prefix. Blocked files live in `plans/triage/hold/` (this is the DB-driven `hold` state from `/triage`, separate from a plan's own `status: blocked` frontmatter field, which means the implementation loop hit its retry budget — check both meanings if a plan seems stuck).
- The plan may reference optional steps (e.g. "Option B — add a new word row"). Only do these if the plan explicitly marks them as required, or the user asks.
