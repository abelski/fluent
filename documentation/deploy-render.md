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

## Pinned Python dependencies (#41, 2026-09-22)

`backend/requirements.txt` used to say `sqlmodel>=0.0.22`, `fastapi>=…` and so on, so **every
Render build installed whatever was newest that day**, while the local `.venv` (and so the test
suite) stayed on old versions. On 2026-09-22 the deploy of `c405090` pulled `sqlmodel` 0.0.46,
which:

- rejects naive datetimes on write ("Datetime values must have timezone information…"), so the
  OAuth callback failed on `user.last_login = now` and **nobody could log in**;
- returns aware (UTC) datetimes from `timestamp without time zone` columns, so
  `is_premium_active` crashed comparing them with naive `now` (`GET /api/me/stats` → 500).

Fixed by a Render rollback, then pinning every direct dependency to the versions the 2026-09-17
build ran (`sqlmodel==0.0.42`). Rules now:

- **Bump a dependency on purpose, never by accident.** Change the pin, `pip install -r
  requirements.txt` locally, run the full suite, then deploy.
- **The local `.venv` must match the pins** (`pip install -r backend/requirements.txt`), or the
  tests prove nothing about production.
- Upgrading `sqlmodel` past 0.0.42 means moving the app to timezone-aware datetimes first (or
  annotating fields as `NaiveDatetime`): the codebase stores naive UTC everywhere.
