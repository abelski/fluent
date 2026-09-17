# Articles — current behavior

## Purpose
The Articles function serves bilingual (RU/EN) reading content — learning materials, adaptation
guides, and blog posts — authored and edited by admins as Markdown. Public visitors and students
browse a filterable list and read individual articles; a subset of published articles can also be
pinned to the site-wide footer navigation, which is fetched independently of the articles dashboard
page on every page load. Admins get full CRUD plus Markdown export/import for moving articles
between environments. It is called by the Next.js dashboard articles pages and the global Footer
component over the REST API, plus the admin panel's article editor.
Backed by: `backend/routers/articles.py`, `frontend/app/dashboard/articles/`.

## Scenarios

```gherkin
Scenario: public article list
  Given any caller, authenticated or not
  When GET /articles is called with no category filter
  Then every published article not pinned to the footer is returned, summary fields
    only (no body), newest first
```

```gherkin
Scenario: filtering the article list by category
  Given a caller passes ?category= with one of learning_materials/adaptation/blog
  When GET /articles is called
  Then only published, non-footer articles in that category are returned
  And an unrecognized category value returns 400
```

```gherkin
Scenario: footer-pinned articles
  Given any caller, on any page (the footer renders site-wide, not just on the
    articles dashboard page)
  When GET /footer-articles is called
  Then only published articles flagged show_in_footer are returned (slug + titles
    only), ordered oldest first
```

```gherkin
Scenario: reading a single article
  Given a slug for a published article
  When GET /articles/{slug} is called
  Then the full article (both language bodies, tags, category, timestamps) is returned
  And a slug that doesn't exist, or belongs to an unpublished article, returns 404
    even though the row may already be warmed in the shared read cache
```

```gherkin
Scenario: admin lists and reads all articles
  Given an authenticated admin
  When GET /admin/articles or GET /admin/articles/{slug} is called
  Then unpublished (draft) articles are included, and a non-admin caller is rejected
    with 403
```

```gherkin
Scenario: admin creates an article
  Given an authenticated admin submitting slug, title_ru, title_en and category
  When POST /admin/articles is called
  Then slug, title_ru and title_en must all be non-empty (400 otherwise), category
    must be one of learning_materials/adaptation/blog (422 otherwise), and a slug
    that already exists is rejected with 409
```

```gherkin
Scenario: admin updates an article
  Given an authenticated admin submitting a full article body (PUT, not a partial patch)
  When PUT /admin/articles/{slug} is called
  Then every field is overwritten from the request body and updated_at is refreshed
  And renaming the slug is allowed unless the new slug collides with a different
    existing article (409)
  And an invalid category is rejected with 422; a missing article slug returns 404
```

```gherkin
Scenario: admin deletes an article
  Given an authenticated admin
  When DELETE /admin/articles/{slug} is called
  Then the article is permanently removed, and a missing slug returns 404
```

```gherkin
Scenario: admin exports an article as Markdown
  Given an authenticated admin and an existing slug
  When GET /admin/articles/{slug}/export is called
  Then a downloadable .md file is returned containing YAML-style frontmatter
    (slug, title_ru, title_en, tags, category, published) followed by the Russian
    body, an "---EN---" separator, then the English body
```

```gherkin
Scenario: admin imports an article from Markdown
  Given an authenticated admin uploads a UTF-8 .md file in the export format above
  When POST /admin/articles/import is called
  Then an existing article with a matching slug is updated in place (title/body/tags/
    category/published/updated_at); no matching slug creates a new article instead
  And a file missing the frontmatter block, or missing slug/title_ru/title_en,
    is rejected with 400
  And a file that isn't valid UTF-8 is rejected with 400
  And a category outside the valid set is silently coerced to "blog" rather than
    rejecting the import
```

```gherkin
Scenario: dashboard article list renders with SEO-friendly initial content
  Given a visitor loads /dashboard/articles
  When the static-exported page is served
  Then the article list embedded at build time is shown immediately (for crawlers
    and first paint), then replaced by a fresh client-side fetch of /api/articles
  And the category tabs (Все/all, learning_materials, adaptation, blog) filter the
    already-loaded list client-side via a ?category= URL query parameter, with no
    extra network request per tab switch
```

```gherkin
Scenario: dashboard article detail page resolves the real slug at runtime
  Given the static export serves /dashboard/articles/_/ for every article (the
    dynamic segment is a fixed "_" placeholder in the exported HTML)
  When a visitor opens an article's real URL
  Then the page reads the actual slug from window.location at runtime and fetches
    that article; a build-time-known slug is instead fetched and inlined ahead of
    time (with per-article JSON-LD metadata) so crawlers see real content
  And a slug with no matching published article renders a "not found" state with a
    link back to the article list, rather than a broken page
```
