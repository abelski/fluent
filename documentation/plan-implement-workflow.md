# Plan → implement workflow (sdlc-feature-analyst / sdlc-triage + sdlc-ralph-implement)

This documents the shared "plan then implement" mechanism behind two pipelines in this repo:

- **Feature pipeline**: `/sdlc-feature-analyst` → `plans/improvements/active/` → `implemented/`
- **Bugfix pipeline**: `/sdlc-triage` → `/sdlc-fix-issue-from-triage` → `plans/triage/active/` → `implemented/`

Both delegate the actual implementation loop to one shared, pipeline-agnostic skill:
`.claude/skills/sdlc-ralph-implement/SKILL.md`, which spawns `.claude/agents/sdlc-ralph-implementer.md`
subagents to do the mechanical work.

Written down here (per CLAUDE.md's instruction) so a future session doesn't have to re-derive
the design reasoning from scratch.

## End-to-end flow

**Feature:**
1. `/sdlc-brainstorm "<idea>"` — assign change number `N`, search `plans/*/implemented/` + CHANGELOG
   for precedents, run `/productivity-grilling` with the precedents as default answers, write
   `plans/ideas/idea_<N>_<slug>.md` (problem, outcome, scope, decisions, precedents, success
   check). User confirms → `status: confirmed`.
2. `/sdlc-feature-analyst <idea file>` — write `plans/improvements/active/plan_<N>_<slug>.md`
   (frontmatter + Context/Goals/Non-Goals/Requirements/Implementation/Validation/Definition of
   Done). A **cold** `general-purpose` agent reviews it, given only the two file paths — no
   conversation, no summary — so it catches what the author's own context hides. Valid findings
   get fixed; user approves → `status: approved`.
3. Branch `feat/<N>-<slug>` from `main`; the uncommitted idea + plan files carry over.
   `Skill(sdlc-ralph-implement, args: <path>)` — implements, runs the code-review gate
   (`sdlc-ralph-reviewer`), validates, retries, gates on Definition of Done. Reports `done` or
   `blocked`. If the plan has a `## UAT verification` section, `sdlc-uat-tester` then checks it
   black-box (up to `max_uat_rounds`).
4. On `done`: work stays uncommitted, user reviews and tests locally → "Request changes" (new plan items, re-run
   sdlc-ralph-implement) or "Confirm".
5. On confirm: plan → `plans/improvements/implemented/IMPLEMENTED-...`, idea →
   `plans/ideas/implemented/`, CHANGELOG entry, the user commits, then Claude runs
   `git merge --no-ff` into `main`. Never pushed —
   the user pushes. Then ask whether to run `/news-writer`.

**Where these skills come from (#49):** they are synced from the template repo
`abelski/moonlight_ai` (formerly `claude_bootstrap`) via `/bootstrap-sync`, and use its prefixed
names (`sdlc-*`, `helper-*`, `productivity-*`) so a sync matches files one-to-one. The local copies
are the template text *merged* with Fluent specifics (plan dirs, RU+EN/375px/screenshot DoD,
Neon `mistake_report` triage, news post, "user commits, Claude merges") — so they will always diff
against the template. Port template changes in by hand; never overwrite. Skipped from the template:
its generic `plans/plan_<slug>.md` layout.

**Why specs are updated at close-out (#50):** `specs/<component>.md` used to have no caller, so
specs went stale silently (e.g. the admin "paid" filter, 6dd5ef8, never reached `specs/admin.md`).
Now the spec is part of the contract from the start: every idea file has a `## Proposed spec`
(Gherkin scenarios marked New/Changed/Removed, per `specs/<component>.md`), and every triage plan a
`## Spec impact`. Close-out has a spec gate before anything moves to `implemented/`
(`sdlc-feature-analyst` Phase 6 step 0, `sdlc-fix-issue-from-triage` Step 5.2): `sdlc-spec-writer`
updates each affected spec from the code, then each proposed scenario is checked against it. If
what shipped differs from the proposal, the idea is corrected to match. Chosen over "just run the
spec writer at the end" because a proposal written up front is something to check against — the
writer alone can only describe the code, not notice that a promised scenario never shipped.
Changes made outside those flows follow the CLAUDE.md rule instead.

**Why idea and plan files are written on `main`, not the branch (#47):** the user chose to create
the branch only at implementation, so an idea that's dropped or parked never leaves a dead branch
behind. The files stay uncommitted on `main` until then and ride into the branch on
`git checkout -b`.

**Why a separate idea file (#47):** business context (why, for whom, what's out of scope) used to
live only in the chat that ran `/sdlc-feature-analyst`. The plan is about *how*; the idea file keeps the
*what/why* so the cold reviewer and later sessions can check the plan against it.

**Bugfix:**
1. `/sdlc-triage` — fans out parallel `Plan` agents over unresolved DB issues, writes the same
   frontmatter+checkbox schema (`kind: bugfix`) to `plans/triage/active/issue-<N>-<slug>.md`,
   `status: draft`.
2. `/sdlc-fix-issue-from-triage <N>` — locates the plan, flips `draft → approved` (there's no separate
   approval UI here — invoking the skill on a specific issue *is* the approval), delegates to
   `Skill(sdlc-ralph-implement, args: <path>)`.
   Before delegating it creates branch `fix/<N>-<slug>` from `main`.
3. On `done`: sdlc-fix-issue-from-triage stages the local server, does a browser-based smoke check,
   then asks the user to confirm resolution — only then does it update the DB row, send the
   reporter notification, and move the file to `plans/triage/implemented/IMPLEMENTED-...`, commit and merge the branch into
   `main` (never push). On
   `blocked`: relays `## Blocked`.

`sdlc-ralph-implement` itself never touches the database, never notifies anyone, never publishes a
news post, and never moves a plan file between directories — all of that is pipeline-specific and
owned by the caller. This is deliberate: it keeps the shared engine reusable and means a bare
`/sdlc-ralph-implement <path>` invocation (e.g. resuming a stuck plan from a cold session) never has a
surprising side effect outside what it's actually responsible for.

## Frontmatter schema (identical for both `kind`s)

```yaml
---
kind: feature | bugfix
status: draft | approved | in_progress | blocked | done
iteration: 0
max_iterations: <N>          # clamp(total_checklist_items * 2, min=8, max=30)
suggested_model: sonnet | opus | haiku | fable
suggested_effort: low | medium | high | xhigh | max
confirmed_model: null        # filled in once, on first approved→in_progress transition
confirmed_effort: null
---
```

- **`max_iterations`**: `total_checklist_items` is the count of `- [ ]` boxes across
  Implementation/Fix-plan + Validation/Tests when the plan is first written. The `×2, min 8, max
  30` constants are a judgment call, not derived from hard data — reasoned as "roughly one
  attempt + one retry per item," with a floor protecting tiny plans and a ceiling forcing a human
  checkpoint instead of unsupervised runaway retries. Revisit these constants if real usage shows
  plans are getting blocked too early or burning too many retries without ever reaching the cap.
- **`iteration`**: bumps once on `approved → in_progress` (marks "an attempt is underway"), then
  once per Validation/Tests retry attempt, persisted *before* each retry so a crash mid-retry
  resumes with the correct count. It does not count Implementation/Fix-plan items — those are
  done in a single fast pass, not iteration-by-iteration (see "Why one pass, not one iteration
  per checklist item" below).
- **`status: draft`**: not yet approved by a human. `sdlc-ralph-implement` refuses to act on a draft
  plan and bounces it back to whichever skill authored it.
- Note the plan's own `status` field is unrelated to `plans/triage/hold/` (which reflects the
  *production DB row's* `onhold` status, managed by `/sdlc-triage` Step 7) — a plan can be `blocked`
  in its frontmatter (implementation loop exhausted its retry budget) while its DB issue is still
  `open`, or vice versa. Check both if a triage plan seems stuck.

## Why native adaptation, not the literal ralph-wiggum plugin

Anthropic's [ralph-wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
implements the technique via a `Stop` hook: `/ralph-loop` writes `.claude/ralph-loop.local.md`
(frontmatter: `iteration`, `max_iterations`, `completion_promise`), and the hook intercepts every
attempt to end a turn, re-feeding the *identical* prompt until a literal `<promise>TEXT</promise>`
tag is seen or `max_iterations` is hit. It works because each Ralph "iteration" is normally a
fresh, stateless `claude -p` process — only files and git history persist across iterations.

We deliberately did not install that. This repo has zero hooks anywhere in `.claude/settings.json`
today, and a global `Stop` hook would intercept exit from *any* activity in this one multi-purpose
Claude Code session — SMM scouting, SQL queries, SEO, news posts — not just feature/bugfix work.
Forgetting to cancel an active loop would hijack the next unrelated conversation.

Instead:
- Loop state lives directly in the plan file's own frontmatter — the plan file *is* the Ralph
  state file, trivially resumable from a cold session by just pointing at it.
- Completion is detected mechanically (grep for remaining `- [ ]`, re-run the literal
  `## Definition of Done` commands) rather than trusting a self-reported promise string.
- `/loop` + `ScheduleWakeup` (already built into this harness, no new infrastructure) are reached
  for only when a plan is genuinely large or resuming across a session boundary — never wrapped
  around every plan unconditionally.
- No auto-commits: CLAUDE.md says "Only create commits when requested by the user." Unlike
  original Ralph's reliance on git history as part of its self-reference, this design leans
  entirely on the plan file's own checkbox/frontmatter state as persistent memory.

## Why one pass, not one iteration per checklist item

`sdlc-ralph-implement` does the entire remaining Implementation/Fix-plan section in a single
`sdlc-ralph-implementer` subagent call, not one subagent per checklist item. The bounded retry/loop
machinery is reserved for (a) a failing Validation/Tests command and (b) resuming a plan whose
`status` was already `in_progress`/`blocked` before the current invocation started.

This matches how every real plan in `plans/improvements/implemented/` actually played out at
design time (5-13 Implementation items, always completed in one sitting, never interrupted
mid-pass) — Ralph's per-item-granularity discipline exists to compensate for the *statelessness*
of its original bash-loop form; that problem doesn't apply the same way inside one continuous
session where nothing has actually been forgotten. Treating every item as its own loop-turn would
add real scheduler overhead for work that already completes correctly in one pass, which CLAUDE.md's
"avoid over-engineering" instruction argues against.

## Model / effort suggestion and reconciliation

The planner (`sdlc-feature-analyst` or the `Plan` agents `/sdlc-triage` fans out) picks `suggested_model`
and `suggested_effort` per plan from the nature of the work — mechanical/well-patterned changes
suggest a cheaper/faster tier, novel/high-risk changes (auth, payments, migrations) suggest a
stronger one — with a one-line reason recorded in the plan's Context/Root cause section.

`effort` uses the same `low/medium/high/xhigh/max` vocabulary as the existing `code-review` skill
— the only precedent for "effort level" already in this repo. It's a prompt-scaling convention,
not a hidden model API parameter: the `Agent` tool only exposes `model` as an override, so true
effort tuning happens through instructions injected into the `sdlc-ralph-implementer` subagent's
prompt (trust-and-move-on at low/medium, re-read-the-diff-once at high, flag-uncertainty-for-
independent-reverification at xhigh/max) rather than a model-level setting.

`sdlc-ralph-implement` reconciles suggested vs. actual **once per plan**, at the first
`approved → in_progress` transition: if the current session's model matches `suggested_model` and
no conflicting effort was explicitly requested, it proceeds silently — no question asked. If
either differs, one `AskUserQuestion` ("use suggested / use current session settings / choose
other") resolves it, and the answer is persisted into `confirmed_model`/`confirmed_effort` so
every later retry or resume reads those fields and never re-asks.

## Token optimization

- **Subagent isolation per pass**: the orchestrator (`sdlc-ralph-implement`) never reads full file
  contents or test logs itself — it delegates to `sdlc-ralph-implementer` and keeps only its concise
  summary plus the plan file's own checkbox/frontmatter state. Large diffs/test output never
  accumulate in the orchestrator's context.
- **One subagent per pass, not per item** (see above) — avoids multiplying round-trip overhead.
- **Model/effort tiering** — cheaper/faster tier by default for mechanical work; ask-once-
  persist-forever reconciliation avoids repeatedly interrupting the user or re-deciding on every
  retry.
- **Stable orchestrator prompt** — `sdlc-ralph-implement`'s own instructions don't change shape between
  invocations, which benefits from this session's prompt caching, mirroring Ralph's "same prompt
  every time" principle. The `## Blocked` section is replaced, not appended, across repeated
  block/resume cycles, so it doesn't grow unbounded.
- **`/loop`/`ScheduleWakeup` used sparingly** — only for genuinely large or cross-session work; a
  short `delaySeconds` near the 60s floor only because each firing does real work, never to poll
  idly or keep a cache warm.
- **`/sdlc-triage`'s existing parallel `Plan`-agent fan-out is unchanged** — it was already isolated
  and parallelized well; this redesign only touched the plan file *format* it writes and the
  *implementation* side, not the initial triage/planning fan-out itself.

## Gotchas to verify, not assume

- **`/loop` invoked programmatically from inside another skill (sync vs. background)** — not
  independently verifiable from documentation alone. `sdlc-ralph-implement` is written to degrade
  gracefully (finish inline, tell the user to manually re-invoke later) if it doesn't behave as
  expected. *Update this section with the real observed behavior once it's actually been
  exercised in practice.*
- **`ScheduleWakeup`'s `delaySeconds` is clamped to `[60, 3600]`** and the *same* `/sdlc-ralph-implement
  <path>` prompt must be passed back unchanged each firing for the loop to keep repeating
  correctly — don't reword it between wakeups.
- **No auto-commits anywhere in this flow** (`sdlc-ralph-implement`, `sdlc-ralph-implementer`, both pipeline
  wrappers) — CLAUDE.md forbids it without an explicit user directive; don't add commit logic
  here even though it would make the design closer to original Ralph's git-history-based memory.
- **`sdlc-ralph-implementer` deliberately has no `Agent` tool** — it cannot recursively spawn further
  loops or subagents. All iteration/retry control lives in `sdlc-ralph-implement`, the orchestrator,
  not the worker.
- **Two different "status" fields can both apply to a triage plan** — the plan's own frontmatter
  `status` (draft/approved/in_progress/blocked/done, owned by this workflow) is unrelated to the
  production DB row's `status` (open/onhold/resolved, owned by `/sdlc-triage` Step 7's cleanup pass).
  A plan can be frontmatter-`blocked` while its DB issue is still `open`.
- **`backend/.env` ships with `DEV=true`**, which makes `backend/main.py`'s catch-all route
  (`serve_frontend`) 307-redirect every full-page request to `FRONTEND_URL` (`localhost:3000`,
  the `next dev` server) instead of serving the built static export from `frontend/out/`. That's
  the right mode for interactive local dev, but it silently breaks the "Definition of Done"
  Playwright gate: `sdlc-fix-issue-from-triage` Step 3 explicitly requires the *static export*, not
  DEV mode, and a plain `uvicorn main:app --port 8000` inherits `DEV=true` from `.env` and fails
  ~15 unrelated tests that assert `toHaveURL(/localhost:8000.../)` after an auth redirect. Start
  the backend with `DEV=false .venv/bin/python -m uvicorn main:app --port 8000` for any
  Definition-of-Done / smoke-test run, and rebuild the export first (`cd frontend && npm run
  build`) if source has changed since `frontend/out/` was last generated — first discovered while
  validating issue #155 (2026-08-16), whose full-suite run went from 15 failing (DEV mode +
  stale export) to 7 failing (all pre-existing, unrelated to that issue) once both were fixed.
