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
- All pages must be visually consistent
- All validation must be server-side
- Keep solutions as simple as possible; avoid over-engineering
- Think about performance
- After adding a new feature, add an autotest for it and run autotests to confirm everything works
- Do not push to git without an explicit directive from the user
- never use ANTHROPIC_API_KEY (we dont have it in our subscription)

# Required Post-Implementation Steps

1. Restart the local server and verify the basic flow works
2. Compare UI against the production site to ensure nothing was accidentally removed:
   - Navigation menu is intact
   - Header and footer are present
   - Login works
3. Run autotests
4. make sure that feature or change correctly working localy
