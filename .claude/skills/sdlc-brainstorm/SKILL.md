---
name: sdlc-brainstorm
description: First step of every feature — turn a raw idea into a confirmed idea file (plans/ideas/idea_<N>_<slug>.md) holding all business context. Finds precedents in past plans, grills the user via the productivity-grilling skill, writes the file, asks for confirmation, then hands off to sdlc-feature-analyst. Use when the user brings a new feature idea, says "brainstorm", or wants to start a feature.
---

Turn the idea in `$ARGUMENTS` into an idea file the user confirms. No code, no plan, no branch —
this step only captures **what and why**. The **how** is `sdlc-feature-analyst`'s job.

Idea files are written on `main`, uncommitted. The feature branch is created later, at
implementation (`sdlc-feature-analyst` Phase 3), so a dropped or parked idea never leaves a dead
branch behind; the untracked file rides into the branch on `git checkout -b`. If the tree is clean
and you're not on `main`, switch to it first. See `documentation/plan-implement-workflow.md`.

## Step 1 — Assign the change number

`N` = highest number in `documentation/CHANGELOG.md`, `plans/**/plan_<N>_*`, and
`plans/ideas/idea_<N>_*` + 1. Pick a short kebab-case `slug`. This `N` is reused for the plan
file, the branch and the CHANGELOG entry.

## Step 2 — Find precedents

Search `plans/improvements/implemented/`, `plans/triage/implemented/`, `plans/ideas/` and
`documentation/CHANGELOG.md` for past work touching the same page, model, endpoint or pattern
(grep the key nouns of the idea). Pick up to 3 closest. For each, note what it did and what can be
reused (endpoint shape, component, test, a decision already made). Use them as the default
recommended answers in Step 3 — don't make the user re-decide something a precedent settled.

## Step 3 — Grill

`Skill(skill: "productivity-grilling", args: <the idea + precedents found>)`. Cover at least: the problem and
who has it, desired outcome, scope and non-goals, free vs. Premium, RU + EN copy, mobile, which
pages/surfaces, edge cases, how we'll know it worked. Facts from code/DB are yours to look up, not
questions. Stop when the frontier is empty.

## Step 4 — Write the idea file

`plans/ideas/idea_<N>_<slug>.md` (English, per repo rule):

```markdown
---
number: <N>
slug: <slug>
status: draft
---

# Idea #<N> — <title>

## Problem
Who has it, what hurts today, why now.

## Desired outcome
What the user sees/gets when this is done.

## Scope
- In: ...
- Out (non-goals): ...

## Decisions
Every settled question from grilling: **Q** — answer (one line each).

## Precedents
- `plans/.../plan_<X>_...md` — what it did, what we reuse.

## Success check
How we'll know it works (observable, not "users like it").

## Open questions
Anything deliberately left for sdlc-feature-analyst. Empty is fine.
```

## Step 5 — Confirm

Show the file in chat. `AskUserQuestion`: "Idea #<N> saved to `<path>`. Confirmed?" —
options "Confirm — build the plan", "Revise". On revise: take corrections, update, ask again.

On confirm: set `status: confirmed`, then
`Skill(skill: "sdlc-feature-analyst", args: "plans/ideas/idea_<N>_<slug>.md")`.
