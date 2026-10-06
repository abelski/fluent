# SEO / search-engine pushes — current behavior

## Purpose
Tells Bing and Yandex (via IndexNow) about new and edited pages so they are crawled without waiting
for a sitemap re-read. Pushes happen at deploy time, once a page is prerendered in the build.
Backed by: `backend/indexnow.py`, `push_indexnow_on_new_build` in `backend/main.py`,
`backend/scripts/indexnow_push_all.py`.

## Scenarios

```gherkin
Scenario: IndexNow key is served
  Given INDEXNOW_KEY is configured
  When a crawler requests /indexnow-key.txt
  Then it gets the key as plain text with HTTP 200
  And without INDEXNOW_KEY the same request returns 404
```

```gherkin
Scenario: first push ever
  Given no push state is stored yet
  When a new build starts on production and 90 seconds have passed
  Then every sitemap URL whose page is in the build is sent in one request, and the state is saved
  And a restart of the same build sends nothing
```

```gherkin
Scenario: a publish or article edit is sent on the next deploy
  Given an article is published or edited (RU, and its /en/ twin where it exists)
  When a new build starts for the first time and the article's page is in the build
  Then its URLs are sent to IndexNow in one request
  And an article whose page is not in the build yet is neither sent nor recorded, so the next build sends it
```

```gherkin
Scenario: a new word program URL is sent on the next deploy
  Given a public word program appears in sitemap.xml
  When a new build starts and its page /programs/<key>/ is in the build
  Then its URL is sent to IndexNow
  And edits to existing programs are not detected (use the full push)

Scenario: phrase program pages are never sent
  Given /dashboard/phrases/<id>/ is not prerendered (only the `_` placeholder exists, whose
    canonical is /dashboard/phrases/)
  When a new build starts
  Then phrase program URLs are not sent, since their canonical points to the phrases index
```

```gherkin
Scenario: full push
  Given a maintainer runs scripts/indexnow_push_all.py with INDEXNOW_KEY and --yes
  When it runs
  Then every URL of the live sitemap is sent in a single request and the status is printed
  And the database and stored push state are not touched
```

```gherkin
Scenario: no pings outside production
  Given the app runs locally, in tests, or without INDEXNOW_KEY or RENDER
  When it starts
  Then no request is sent to IndexNow
```

```gherkin
Scenario: a failed push never breaks startup and is retried on the next build
  Given IndexNow is unreachable or answers with a status other than 200/202
  When the startup push runs
  Then startup is unaffected, the failure is logged, and the push state is not saved
  And the next new build tries again
```
