Perform a full triage of unresolved user-reported issues from the production database.

## Steps

### 1. Load DB connection
Load environment from `backend/.env` and connect to the production PostgreSQL database.

### 2. Ensure triage folders exist
Create the following folders in the project root if they do not already exist:
- `plans/triage/active/` — active issue plans
- `plans/triage/hold/` — plans for issues that are on hold in the DB
- `plans/triage/implemented/` — plans for resolved issues

### 3. Fetch unresolved issues
Query all rows from `mistake_report` where `status NOT IN ('resolved', 'onhold')`, ordered by `created_at` ascending.
Print a summary: total count and list each issue (id, context, description, created_at).

### 4. Validate each issue against production data
Before planning a fix, verify that each issue actually reflects a real problem in production — not a test submission or fabricated report. Red flags:
- Description contains words like "тест", "test", "случайная ошибка", "для проверки" (Russian: "for checking the form")
- The reported data (word, translation, sentence, etc.) does not exist in the database
- Multiple reports with identical or contradictory claims filed within hours of each other

To verify, query the relevant table(s) for the specific data mentioned in the description (e.g. look up the word, translation, grammar sentence). If the reported problem cannot be confirmed in production data, mark the issue as invalid spam and resolve it immediately (`UPDATE mistake_report SET status = 'resolved' WHERE id = <id>;`) without creating a plan file.

### 5. Plan fixes in parallel
For all confirmed issues that do not yet have a plan file, spawn **Plan agents in parallel** — one per issue — using the Agent tool with subagent_type=`Plan`. Send all agent calls in a single message so they execute concurrently.

Each agent prompt must include:
- Issue id, context, description, and status
- Instruction to explore the codebase and identify: the affected area, likely root cause, specific files/endpoints involved, and concrete step-by-step fix steps
- Instruction to judge, from the nature of the fix, a `suggested_model` (`sonnet` | `opus` | `haiku` | `fable`) and `suggested_effort` (`low` | `medium` | `high` | `xhigh` | `max`) for the *implementation* of the fix — a mechanical, well-scoped data-only or single-file fix suggests a cheaper/faster tier; something spanning multiple files, ambiguous root cause, or auth/data-integrity risk suggests a stronger tier — plus a one-line reason.

Wait for **all** agents to return before proceeding. Collect each agent's output and use it to populate the corresponding plan file in step 6.

### 6. Save individual plans
For each issue, derive a short slug from the description (3-5 words, lowercase, hyphen-separated). The filename format is `plans/triage/active/issue-<id>-<slug>.md` (e.g. `issue-12-wrong-verb-form.md`).

Check if a file matching `plans/triage/active/issue-<id>-*.md` or `plans/triage/hold/issue-<id>-*.md` already exists. If it does, skip that issue entirely. Otherwise, write a new file using the slug-based name.

Format each file as (this schema is shared with the feature-planning pipeline — `ralph-implement` drives both from the same frontmatter + checkbox shape):

```
---
kind: bugfix
status: draft
iteration: 0
max_iterations: <N>
suggested_model: <sonnet | opus | haiku | fable>
suggested_effort: <low | medium | high | xhigh | max>
confirmed_model: null
confirmed_effort: null
---

# Issue #<id> — <context>

**Reported:** <created_at>
**Status:** <status>
**Description:** <description>

## Root cause
... (include the one-line suggested_model/suggested_effort reason here)

## Fix plan
- [ ] 1. ...
- [ ] 2. ...

## Tests
- [ ] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
- [ ] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

​```bash
cd frontend && npx playwright test --reporter=list
​```

## Confirm resolution
Ask the user: "Issue #<id> — <description>. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = <id>;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-12-wrong-verb-form.md` → `plans/triage/implemented/IMPLEMENTED-issue-12-wrong-verb-form.md`).
```

`max_iterations` = `clamp((Fix plan items + Tests items) * 2, 8, 30)`. Set `status: draft` here —
`fix-issue-from-triage` (via `ralph-implement`) flips it to `approved` and beyond once a human
starts working the issue; `/triage` itself only ever produces drafts. Frontend rebuild / local
server staging is *not* a checklist item here — that's handled procedurally by
`fix-issue-from-triage` after `ralph-implement` finishes, not authored per-issue.

After saving all files, print the list of created file paths.

### 7. Clean up stale plan files
After processing new issues, audit the existing plan files for staleness:

**Move IMPLEMENTED- files** — any file with an `IMPLEMENTED-` prefix found in `plans/triage/active/` or `plans/triage/hold/` should be moved to `plans/triage/implemented/`.

**Move or delete plan files whose DB status has changed:**
- If a plan file exists in `plans/triage/active/` but the DB status is now `onhold` → move it to `plans/triage/hold/`.
- If a plan file exists in `plans/triage/hold/` but the DB status is now `open` → move it back to `plans/triage/active/`.
- If a plan file exists in `plans/triage/active/` or `hold/` but the DB status is now `resolved` → add the `IMPLEMENTED-` prefix and move it to `plans/triage/implemented/`.
- If the DB row no longer exists → delete the plan file.

**Verify implemented fixes in code:** For plan files that describe a code change, check whether the change is already present in the codebase (e.g. grep for the relevant function/pattern). If the fix is confirmed implemented but the DB is still `onhold`, note it to the user — it may need to be formally resolved.
