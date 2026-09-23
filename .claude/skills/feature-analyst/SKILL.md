---
name: feature-analyst
description: Plan a feature from a confirmed idea file (plans/ideas/) — write a PRD-compatible plan to plans/improvements/active/, have a cold agent review it, get user approval, implement on a feat/<N>-<slug> branch via ralph-implement, let the user test locally, then merge to main on their confirmation.
---

You are a feature analyst. Your job is to plan before writing any code. Follow these phases strictly.

## Phase 1 — Load the idea

`$ARGUMENTS` should be a confirmed idea file, `plans/ideas/idea_<N>_<slug>.md`. It holds all the
business context (problem, scope, decisions, precedents) — don't re-ask what it already settles.

- No idea file given, or `status` isn't `confirmed` → stop and run
  `Skill(skill: "brainstorm", args: <the request>)` instead. Every feature starts there.
- Reuse the idea's `N` and `slug` for everything below. Read its precedent plans; mirror their
  structure where they fit.
- Only technical ambiguities the idea can't answer (and the code can't) go to `AskUserQuestion`.

## Phase 2 — Write the plan (in planning mode)

Call the `EnterPlanMode` tool to enter planning mode, then explore the codebase thoroughly to understand the affected files, existing patterns, and dependencies.

Create the plan file at `plans/improvements/active/plan_<N>_<slug>.md` (create `plans/improvements/active/` and `plans/improvements/implemented/` if they don't exist).

The plan MUST start with YAML frontmatter:

```yaml
---
kind: feature
status: draft
iteration: 0
max_iterations: <N>
suggested_model: <sonnet | opus | haiku | fable>
suggested_effort: <low | medium | high | xhigh | max>
confirmed_model: null
confirmed_effort: null
---
```

- `max_iterations` = `clamp((Implementation items + Validation items) * 2, 8, 30)`.
- `suggested_model`/`suggested_effort` are your judgment call based on the nature of the work: a
  mechanical, well-patterned change (e.g. "mirror an existing router/page for a new one") suggests
  a cheaper/faster tier (`haiku` or `sonnet`, `low`/`medium`); something touching auth, payments,
  DB migrations, or genuinely novel design suggests a stronger tier (`opus`, `high`+). State your
  one-line reason in the Context section below — `ralph-implement` will show it to the user if it
  needs to reconcile this against their current session settings.

Then these sections, in order:

### Context
Link the idea file (`Idea: plans/ideas/idea_<N>_<slug>.md`) first. Why this is being built, current behaviour, relevant existing files/patterns found during
exploration. Include your one-line `suggested_model`/`suggested_effort` rationale here.

### Goals
Bulleted list of the explicit, user-facing outcomes this plan delivers.

### Non-Goals
Bulleted list of what's explicitly out of scope — bounds the implementer, prevents scope creep.

### Requirements
Functional requirements, plus a fixed subsection restating the standing constraints that always
apply in this repo:

```markdown
### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. Mark this N/A if the plan is backend/data-only.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.
```

### Implementation
A numbered checklist of every change required, ordered by dependency. Each item should name the file(s) touched and what changes. Use GitHub-flavoured markdown checkboxes:

```markdown
## Implementation

- [ ] 1. `backend/routers/foo.py` — add `POST /foo` endpoint, validate payload server-side
- [ ] 2. `backend/models.py` — add `Foo` SQLModel table
- [ ] 3. `frontend/app/dashboard/foo/page.tsx` — new page component
- [ ] 4. `frontend/lib/api.ts` — add `createFoo()` helper
```

### Validation
A checklist of how to verify the feature works end-to-end after implementation:

```markdown
## Validation

- [ ] Backend unit: `pytest backend/tests/test_foo.py`
- [ ] Playwright autotest added: `frontend/tests/foo.spec.ts`
- [ ] Smoke: navigate to `/dashboard/foo`, verify heading visible
- [ ] Edge case: submit empty form → server returns 422
- [ ] Auth gate: unauthenticated request returns 401
- [ ] News post written and published via /news-writer
```

### Definition of Done
The mechanically-verifiable subset of Validation — literal shell commands only, excluding manual/human-only steps and the news-post step. These get re-run together as the final gate right before the plan is marked done:

```markdown
## Definition of Done

​```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
​```
```

### Cold review

After writing the file, spawn a **fresh** reviewer that sees none of your reasoning — only the
files:

```
Agent(subagent_type: "general-purpose", description: "Cold plan review", run_in_background: false,
  prompt: "Review the plan plans/improvements/active/plan_<N>_<slug>.md against its idea file
  plans/ideas/idea_<N>_<slug>.md and the repo rules in CLAUDE.md. Read the code the plan touches.
  Report, ranked: (1) idea requirements the plan misses or contradicts, (2) wrong file/function
  names or steps that won't work against the real code, (3) missing tests or Definition-of-Done
  checks (RU+EN, 375px, screenshots for UI), (4) over-engineering — anything simpler that does the
  job. Do not edit files. Be concrete: file, line, what to change.")
```

Do not pass it your conversation, summaries or reasoning — the point is a reader with no
context. Fix what's valid in the plan; list what you rejected and why.

### Approval

Show the user the full plan content in chat plus the review findings (fixed / rejected), then use the `AskUserQuestion` tool to ask:

- Question: "Plan saved to `plans/improvements/active/plan_<N>_<slug>.md`. Ready to proceed?"
- Options: "Approve — start implementation", "Revise — I have corrections"

If the user selects "Revise", ask a follow-up `AskUserQuestion` for their corrections, update the plan file, show the revised plan, and ask for approval again. Repeat until approved. Stay in planning mode throughout all revisions.

When the user selects "Approve", flip the plan file's frontmatter `status: draft` → `status: approved` before moving to Phase 3.

## Phase 3 — Confirm implementation start

When the user approves the plan:

1. Call `ExitPlanMode` to leave planning mode.
2. Use the `AskUserQuestion` tool to confirm:
   - Question: "This will modify production code files via a bounded, self-correcting loop (up to <max_iterations> retry attempts on validation failures before the plan is marked blocked for review). Proceed with implementation?"
   - Options: "Yes — implement now", "No — let me reconsider"

If the user selects "No", stop and use `AskUserQuestion` to ask what they want to change.

On "Yes", create the feature branch **before the first code edit**. The idea and plan files were
written on `main` and are still uncommitted — they carry into the branch:

```bash
git checkout main && git pull --ff-only   # skip pull if no remote access; never push
git checkout -b feat/<N>-<slug>
git add plans/ideas/idea_<N>_<slug>.md plans/improvements/active/plan_<N>_<slug>.md
git commit -m "plan: #<N> <slug>"
```

If `main` has unrelated uncommitted changes, stop and ask the user — don't carry them along.

## Phase 4 — Implement via ralph-implement

Delegate implementation entirely to the shared implementer loop:

```
Skill(skill: "ralph-implement", args: "plans/improvements/active/plan_<N>_<slug>.md")
```

`ralph-implement` owns all further checkbox flipping, validation retries, iteration/blocked-state bookkeeping, and the final Definition-of-Done gate. Do not duplicate any of that logic here.

- If it reports `status: done` — proceed to Phase 5.
- If it reports `status: blocked` — relay its `## Blocked` section to the user verbatim and stop. Do not attempt to silently finish the plan yourself.

## Phase 5 — User tests locally

Once `ralph-implement` reports the plan done:

1. Commit the work on the branch (`feat(<area>): <summary> (#<N>)`).
2. Make sure the local server is up (one instance per side — check before starting) and tell the
   user the URLs to try, plus the screenshots path.
3. `AskUserQuestion`: "#<N> is ready on `feat/<N>-<slug>`. Test it locally. Result?" — options
   "Confirm — merge to main", "Request changes".
4. On "Request changes": ask what, add the changes as new unchecked items to the plan's
   `## Implementation` / `## Validation`, set `status: in_progress`, re-run
   `Skill(skill: "ralph-implement", args: <plan path>)`, commit, and ask again. Repeat until confirmed.

## Phase 6 — Close out and merge (only after the user confirms)

1. Move files:
   - `plans/improvements/active/plan_<N>_<slug>.md` → `plans/improvements/implemented/IMPLEMENTED-plan_<N>_<slug>.md`
   - `plans/ideas/idea_<N>_<slug>.md` → `plans/ideas/implemented/idea_<N>_<slug>.md`
2. Append the `#<N>` entry to `documentation/CHANGELOG.md`. Commit.
3. Merge: `git checkout main && git merge --no-ff feat/<N>-<slug>`. On conflict, resolve (the
   CHANGELOG is the usual one — keep both rows) and tell the user what you resolved.
4. **Never push.** Tell the user: "Merged to main. Push when ready: `git push`".
5. `AskUserQuestion`: "Publish a news post about #<N>?" — "Yes" runs `/news-writer`, "No" skips.
   Skip the question for internal-only changes (tooling, refactors, docs).

These steps live here, not in `ralph-implement` — that skill is pipeline-agnostic and callable
standalone, so it never commits, merges, publishes or moves files.

## Notes

- All validation must be server-side (never frontend-only)
- Keep solutions simple — no over-engineering
- Follow existing code conventions in this repo (FastAPI + Next.js static export, JWT auth, SQLModel ORM)
- Never push. Merge to `main` only after the user confirms in Phase 5.
