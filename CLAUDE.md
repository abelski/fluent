# Project Overview

**Fluent** is a Lithuanian-language vocabulary and grammar learning app.

## Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | Next.js 14 (App Router, static export), Tailwind CSS        |
| Backend  | FastAPI (Python), serves REST API + static Next.js files    |
| Database | PostgreSQL via SQLModel ORM (Neon hosted)                   |
| Auth     | Google OAuth → JWT stored in `localStorage('fluent_token')` |
| Hosting  | Render (single service: backend + frontend)                 |

## Key Routes

- `/` — landing page
- `/dashboard` — main user dashboard
- `/dashboard/lists` — vocabulary lists
- `/dashboard/lists/[id]` — single list view
- `/dashboard/lists/[id]/study` — quiz/study session
- `/dashboard/vocabulary` — all learned vocabulary
- `/dashboard/grammar` — grammar exercises
- `/dashboard/practice` — practice sessions
- `/dashboard/review` — spaced repetition review
- `/dashboard/articles` — reading articles
- `/dashboard/admin` — admin panel

## Key Files

- `frontend/lib/api.ts` — `BACKEND_URL`, `getToken()`, `resolveListId()`
- `frontend/app/layout.tsx` — root layout
- `backend/main.py` — FastAPI app + static file resolver
- `backend/auth.py` — Google OAuth, JWT, redirect to `/dashboard?token=...`
- `backend/routers/` — API route handlers

## Static Export Notes

- Next.js runs as a static export (`output: 'export'`); dynamic segments use `_` as a placeholder
- `resolveListId()` in `lib/api.ts` reads the real ID from the URL at runtime

---

# Code Style

- **TypeScript:** Strict mode with proper type definitions
- **Components:** Function components with type annotations
- **Visualization:** Recharts library for data visualization
- **State management:** React hooks
- **API design:** All business logic lives server-side so the same backend can serve a future mobile app
- **Security:** Never log secrets or tokens

# Way of Working

- Plan before making changes
- Whenever plan mode (`EnterPlanMode`) is used in this repo, always persist the resulting plan into
  this project's `plans/` folder (e.g. `plans/improvements/active/plan_<slug>.md`), not just the
  harness's own scratch plan file — that scratch copy lives outside the repo and isn't visible to
  future sessions or other tools (like `ralph-implement`) that read plans from `plans/`.
- All pages must be visually consistent. In particular, the 5 top-nav dashboard pages — Слова
  (`/dashboard/lists`), Фразы (`/dashboard/phrases`), Грамматика (`/dashboard/grammar`), Практика
  (`/dashboard/practice`), Статьи (`/dashboard/articles`) — are one product surface, not five
  independent features. Before adding or restyling UI on any one of them, check how the other four
  already do it (shell, hero card, card borders/shadows, title/subtitle, "browse all" link color)
  and match that, rather than inventing a new pattern locally. See "PageShell" in the component
  library for the current shared shell.
- All validation must be server-side
- Keep solutions as simple as possible; avoid over-engineering
- Think about performance
- After adding a new feature, add an autotest for it and run autotests to confirm everything works
- Do not push to git without an explicit directive from the user
- never use ANTHROPIC_API_KEY (we dont have it in our subscription)
- Keep `documentation/design system/` updated whenever new UI components or patterns are introduced; treat it as the source of truth for visual/component decisions during development
- When you hit a non-obvious gotcha, constraint, or piece of investigative context (a broken/missing tool, an undocumented quirk, a workaround, "why this isn't just X") — write it down in `documentation/` instead of letting it live only in conversation. Re-deriving the same finding by re-exploring the codebase in a future session burns tokens for nothing; a short note prevents that.
- Document architecture decisions too, not just gotchas: whenever you choose one approach over a plausible alternative for a non-obvious reason (a tradeoff, a constraint from hosting/DB/auth, a rejected simpler option), write the decision and its "why" into `documentation/` next to the related feature. Future sessions should be able to tell *why* something is built the way it is without re-deriving it from the diff.
- Only ever run one local dev server per side (one `uvicorn`/backend process, one `next dev`/frontend process) at a time. Before starting a server, check whether one is already running (e.g. `ps aux | grep -E "uvicorn|next dev"` or the listening port) and reuse/restart it instead of spawning a duplicate — stale extra instances cause confusing port conflicts and stale-code symptoms.
- Give every feature or notable change a sequential number so change order stays legible across sessions (plan files, commits, and `documentation/` notes referencing it). Track the running counter and log in `documentation/CHANGELOG.md` — append an entry (`#N — date — short description`) whenever a feature/change is completed, and reuse that number when naming its plan file (e.g. `plans/improvements/active/plan_<N>_<slug>.md`).

# Design System — ALWAYS consult before writing UI

**Any** change that touches markup, styling, colour, spacing or a component — new or existing —
starts by reading the design system. Do not invent a pattern, pick a colour, or reach for a stock
Tailwind palette step without checking these first:

| File | What it is |
| --- | --- |
| `documentation/design system/Component Library (as-built).html` | **Read this first.** The visual source of truth: principles, colour tokens, logo rules, card/button/shell specs, TAK, deliberate deviations. Documents what shipped. |
| `documentation/IMPLEMENTATION.md` | Token/pattern → file mapping, so the component library and the code don't drift. |
| `frontend/tailwind.config.js` | The tokens themselves. |

The original prototype mockups that drove the redesign have been retired now that it shipped — the
component library above is the sole source of truth going forward, not a record of a separate
"approved" original.

Rules:

- Use the **named tokens** (`emerald-600`, `ink`, `muted`, `line`, `faint`, `destructive`, …), never a
  raw stock step like `gray-100` or `emerald-500` when a token exists.
- Cards are flat: `border border-line rounded-[14px]`, no shadow. Buttons carry no shadow.
- Inter only — do not add `font-headline` to redesigned pages.
- Green `#0f9d68` = words/global accent; purple `#9333ea` = phrases surface. Exception: the header
  logo's dot and the TAK icon beside it both use TAK's fixed orange `#ec3013`, so the mark reads as
  one accent color — see "Logo / wordmark" in the component library.
- Page content goes in `.page` (1180px); the navbar stays full-bleed.
- If a change must deviate from an established pattern, that is allowed — but record it in the
  "Deliberate deviations" table of the component library, with the reason.
- After changing shared shell or tokens, run `frontend/tests/design-system-parity.spec.ts`.
- When you introduce or change a shared component/pattern, **update the component library in the
  same change** — it is not a follow-up task.
- `design-system-parity.spec.ts` is the **executable** source of truth for the shared shell across
  the 5 top-nav pages, not just documentation to read — its `NAV_PAGES` list is what actually
  guards them from drifting apart again. Add a page's URL there when it joins that shell, and treat
  a failure in it as a real regression, not a test to relax.

# Required Post-Implementation Steps

1. Restart the local server and verify the basic flow works
2. Compare UI against the production site to ensure nothing was accidentally removed:
   - Navigation menu is intact
   - Header and footer are present
   - Login works
3. Run autotests
4. make sure that feature or change correctly working localy
5. For UI changes: verify against `documentation/design system/Component Library (as-built).html`, run
   `design-system-parity.spec.ts`, and update the component library if a shared component or
   pattern changed
