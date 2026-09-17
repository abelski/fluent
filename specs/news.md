# News — current behavior

## Purpose
Short bilingual announcement posts that admins author and the public reads. There is no dedicated
news page anywhere under `/dashboard/` — posts are read on the top-level landing page (`/`), both
for logged-out visitors and for logged-in users who land back on `/` (a "continue studying" view),
via a shared `NewsSection` component. Authoring happens through the admin dashboard's Content →
News tab. The public read endpoint is cached since it's hit on every landing-page load; admin
endpoints are always read fresh.
Backed by: `backend/routers/news.py` (mounted at `/api`, so routes are `/api/news` and
`/api/admin/news/*`). Frontend: no `frontend/app/dashboard/` page — consumption is in
`frontend/app/LandingClient.tsx`'s `NewsSection`; authoring is in
`frontend/app/dashboard/admin/page.tsx`'s "news" content tab (see `specs/admin.md`).

## Scenarios

```gherkin
Scenario: A visitor loads the landing page
  Given no authentication is required
  When the page fetches GET /api/news?limit=20
  Then published posts are returned ordered by published_at descending, offset/limit applied
  And the result is served from cache when warm, tagged so any write invalidates it
```

```gherkin
Scenario: The news section renders with posts available
  Given the API returned one or more posts
  When NewsSection renders
  Then it shows the localized title/body (RU or EN based on current language) for up to the first
    3 posts, with a "show more" toggle revealing the rest
  And a body longer than 120 characters is truncated with a "Read more" expander per-post
```

```gherkin
Scenario: The news section has nothing to show
  Given the API returned zero posts, or the fetch failed
  When NewsSection would render
  Then it renders nothing (returns null) rather than an empty-state placeholder
```

```gherkin
Scenario: An admin lists all news posts
  Given an authenticated user with is_admin = true
  When they GET /api/admin/news
  Then every post — published or not — is returned ordered by published_at descending
```

```gherkin
Scenario: A non-admin calls a news admin endpoint
  Given an authenticated user with is_admin = false, or no token
  When they call any /api/admin/news* endpoint
  Then the request is rejected (403 "Forbidden" if authenticated-but-not-admin; unauthorized
    otherwise)
```

```gherkin
Scenario: An admin creates a post
  Given an admin caller with non-empty title_ru and title_en
  When they POST /api/admin/news with title_ru, title_en, optional body_ru/body_en,
    optional published_at, and a published flag (defaults true)
  Then a NewsPost row is created, defaulting published_at to now if omitted, and its id is returned
```

```gherkin
Scenario: An admin creates a post missing a required title
  Given an admin caller
  When title_ru or title_en is empty or only whitespace
  Then the request is rejected with 400 "title_ru and title_en are required"
```

```gherkin
Scenario: An admin edits an existing post
  Given an existing post id and an admin caller
  When they PUT /api/admin/news/{id} with the same required fields as create
  Then every field is overwritten, except published_at falls back to the existing value if the
    request omits it
  Then a 404 is returned if the post id doesn't exist
```

```gherkin
Scenario: An admin unpublishes or republishes a post
  Given an existing post and an admin caller
  When they PUT /api/admin/news/{id} with published=false (or true)
  Then the post's published flag is updated, which controls whether GET /api/news will ever
    return it — there is no separate "hide" mechanism
```

```gherkin
Scenario: An admin deletes a post
  Given an existing post id and an admin caller
  When they DELETE /api/admin/news/{id}
  Then the row is permanently removed
  Then a 404 is returned if the post id doesn't exist
```
