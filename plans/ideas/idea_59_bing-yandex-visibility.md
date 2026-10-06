---
number: 59
slug: bing-yandex-visibility
status: confirmed
---

# Idea #59 — Bing + Yandex visibility: IndexNow and a crawlable home page

## Problem
Bing and Yandex find our pages slowly and see almost nothing on the home page. Data from the
`/seo` run on 2026-10-06 (`documentation/seo-log.md`, last row):

- **Slow discovery.** Yandex has had `sitemap.xml` in its queue since 2026-09-25 (11 days, "up to
  1–2 weeks") and reports ~43 pages in search with 0 added / 0 removed this week. Bing has data
  only since 2026-10-01: 0 clicks, 2 impressions. Both engines support IndexNow; we don't use it,
  so new or changed pages wait for a recrawl.
- **Empty home page for crawlers.** `LandingClient` (`frontend/app/LandingClient.tsx`) returns
  `null` until the client-side token check resolves, so the static HTML of `/` holds only nav and
  footer — no heading, no text. Yandex runs little JavaScript, so for our biggest Yandex query,
  «литовский язык» (311 shows, 9 clicks / 2 weeks), the home page has nothing to rank on.
- **Wrong-language meta on `/`.** `<html lang="ru">`, but the title and description are English:
  "Fluent — Learn Lithuanian Online" / "Master Lithuanian vocabulary and grammar…". There is no
  `/en/` home twin (`https://fluent.lt/en/` → 404), unlike articles after #48c.
- **No region in Yandex.** Yandex Webmaster recommends setting the site region; our audience is
  Russian speakers living in Lithuania.

Bing's index also feeds ChatGPT search and Copilot (3 Copilot citations this week), so faster
Bing indexing has value beyond Bing search itself.

## Desired outcome
- Bing and Yandex hear about every new, changed or removed public page within minutes, without
  anyone resubmitting sitemaps by hand.
- A crawler fetching `/` gets a Russian page about learning Lithuanian: RU title and description,
  a heading and real text in the HTML. `/en/` is the English twin. Logged-in users still land on
  their own home (streak, leaderboard…) with no flash of the guest page.
- Yandex knows the site's region is Lithuania.

## Proposed spec

### specs/seo.md (new file — as built in #59a; see specs/seo.md)
**New**
```gherkin
Scenario: IndexNow key is served
  Given INDEXNOW_KEY is configured
  When a crawler requests /indexnow-key.txt
  Then it gets the key as plain text with HTTP 200
  And without INDEXNOW_KEY the same request returns 404
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

### specs/home.md
**Changed** — replaces "no token yet, auth check in flight"
```gherkin
Scenario: static HTML of home is the guest landing
  Given a crawler or any visitor without JavaScript requests /
  When the static-exported page is served
  Then the HTML contains the guest landing in Russian: hero heading, subtitle, feature cards
  And <title> is «Литовский язык онлайн — учите самостоятельно с нуля | Fluent»
  And the meta description is «Учите литовский язык самостоятельно: слова с произношением,
    падежи, фразы и статьи. Интервальное повторение, бесплатный старт.»
  And the page has hreflang links: ru → /, en → /en/, x-default → /

Scenario: signed-in user sees no flash of the guest landing
  Given a valid JWT is stored
  When the page loads
  Then the guest landing is never visible, not even for one frame
  And UserHome is shown once the auth check resolves
```

**New**
```gherkin
Scenario: English home twin
  Given a visitor or crawler requests /en/
  When the page is served
  Then it is the same home page in English: the guest landing in English in the HTML,
    <html lang="en">, English title and description ("Learn Lithuanian Online …")
  And canonical is /en/, with the same hreflang set as /
  And /en/ is listed in sitemap.xml
```

## Scope
- In — **#59a (ship now)**: IndexNow.
  - Key file at the site root, key from config/env (production only).
  - Auto-ping on any change to a sitemap URL: articles (create / update / delete, RU and `/en/`
    twins), public word programs, public phrase programs.
  - A full-push command for all sitemap URLs; run it once at rollout.
  - Check in Bing Webmaster (IndexNow tab) and Yandex Webmaster that the URLs arrived.
- In — **#59b (ship after the 2026-10-24 #48c RU-traffic check, alongside or after #58a)**:
  - Home `/` renders the guest landing into the static HTML; logged-in users get no flash.
  - RU title + description (above) on `/`.
  - New `/en/` home twin with EN title/description, hreflang both ways, added to the sitemap.
  - A short line naming the region on a public page (e.g. about-team: «для изучающих литовский
    в Литве»), as the proof Yandex asks for; then set region = Lithuania in Yandex Webmaster
    (rollout step, done by the user).
- Out (non-goals):
  - **Duplicate meta descriptions** (11 pages, 3 groups) — the user chose "leave for later":
    6 grammar articles whose description is the attribution line «Материал подготовлен на основе
    infkf.github.io/litsheets…» (įvardžiai, būdvardžiai, daiktavardžiai, dalyviai, skaitvardžiai,
    veiksmažodžiai); `/dashboard/phrases/`, `/11/`, `/12/` share one description (and `/12/` has
    the generic EN title "Fluent — Learn Lithuanian"); `/programs/a1_a2_basics/` and
    `/programs/lithuanian_daily_language/` share a template description.
  - Greetings article and other content gaps — already in #58a/#58b.
  - Yandex Business (not a local business), Google-specific changes (Google ignores IndexNow).
  - Removing Bing's auto-discovered `https://www.fluent.lt/sitemap.xml` — `www` 301s to the
    apex, harmless.

## Decisions
- **Home page** — server-render the guest landing + RU title, not only meta tags (Yandex barely runs JS).
- **EN home** — yes, `/en/` twin with hreflang, same pattern as #48c.
- **RU title/description** — Option A: «Литовский язык онлайн — учите самостоятельно с нуля | Fluent» / «Учите литовский язык самостоятельно: слова с произношением, падежи, фразы и статьи. Интервальное повторение, бесплатный старт.»
- **IndexNow triggers** — any sitemap URL change (articles, public word programs, public phrase programs), plus a full-push command.
- **Duplicate descriptions** — out of #59, later.
- **Yandex region** — Lithuania, part of #59b, with proof text on a public page; user sets it in Webmaster.
- **Timing** — split: #59a IndexNow now (changes no page); #59b home + region after the 2026-10-24 check so #48c stays measurable.
- **Free vs Premium** — not applicable; all of this is public/crawler-facing.

## Precedents
- `plans/improvements/implemented/*48c*` (EN SEO twins) — `/en/` route pattern, hreflang
  alternates, sitemap entries for twins; reuse for the `/en/` home.
- `specs/articles.md` "dashboard article list renders with SEO-friendly initial content" — data
  embedded at build time so crawlers get real HTML; same idea for the home guest landing.
- `plans/ideas/idea_58_seo-content-gaps.md` — the gating on the 2026-10-24 #48c check that
  #59b follows; greetings content lives there.

## Success check
- #59a: Bing Webmaster → IndexNow shows our URLs received; Yandex Webmaster shows them under
  IndexNow / re-crawl. Within 2 weeks: Yandex pages in search > 43; Bing impressions > 2 / week.
- #59b: `curl -s https://fluent.lt/` contains the RU H1 and «литовский язык» in `<title>`;
  `curl -s https://fluent.lt/en/` returns 200 with the EN page. Within 4 weeks of #59b: Yandex
  «литовский язык» clicks up from 9 / 2 weeks, and `/` shows as the landing page for it.
- Logged-in smoke: no guest-landing flash (screenshot sequence), RU + EN, desktop + 375px.

## Open questions
- How to hide the guest landing for logged-in users without a flash (e.g. an inline head script
  that reads the token and sets a class before paint) — sdlc-feature-analyst.
- Where the IndexNow key lives (env var on Render vs. generated file) and how "public program"
  is defined for the ping trigger — sdlc-feature-analyst.
- Whether #59a and #59b get separate plan files (like #58a/#58b) — sdlc-feature-analyst.
