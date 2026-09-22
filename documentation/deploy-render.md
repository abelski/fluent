# Deploy on Render

How production is actually built and started. Confirmed 2026-09-22 from the deploy log of
`9718f38` (Render → service `fluent` → Events → Deploy).

- **One service**, `fluent` (project FLUENT.lt, Python 3, Oregon). Custom domain `fluent.lt`.
- **Auto-deploy from `main`**: every push to `main` builds and deploys (~2 min). Nothing else
  triggers a build.
- **Build Command:**
  `npm --prefix frontend install && npm --prefix frontend run build && pip install -r requirements.txt`
  - The Next.js static export (`frontend/out`, gitignored) is built here on every deploy, and
    `backend/main.py` serves it. So an article published after the last deploy has no pre-rendered
    page until the next deploy (`documentation/articles-seo.md`).
  - `next build` type-checks; ESLint is not configured, so no lint step runs.
  - **Gotcha:** the dashboard's Build Command field showed only `pip install -r requirements.txt`
    (the tail of the command). Read the deploy log, not the field.
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`. That is the **root**
  `main.py`, which loads `backend/main.py`.
- **`render.yaml` is not used.** Its commands differ from the live ones (it still had a
  `seed.py` step until #40). Don't edit it expecting an effect.
- **Python on Render is 3.14** (the runtime default), not the local `.venv` version.
- **Schema:** no migrations run. `create_all()` on startup creates new tables, never new columns.
- **Rollback:** Events → a previous "Deploy live" → **Rollback** redeploys that commit.
