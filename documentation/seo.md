# SEO gotchas

Findings from a GSC-driven CTR/indexing pass (#37, `plans/improvements/active/plan_37_seo-quick-wins.md`).
See also `documentation/articles-seo.md` for how an article reaches Google in the first place
(build-time static export, sitemap, redeploy timing) — this file is about content/metadata
*quality* once a page is already indexed.

## The H1-eats-the-description-budget pattern

`frontend/app/dashboard/articles/[slug]/layout.tsx`'s `generateMetadata` builds
`<meta name="description">` from the first 160 characters of `body_ru`. Every article's body
starts with its own `# Title` line (Markdown source, e.g. `content/articles/*.md`). Before #37,
the code stripped Markdown *symbols* (`#*\`[]`) but not the heading *text* — so the description
started by repeating the page's own `<title>`, then got cut off mid-sentence or mid-word once the
160-char budget ran out on the title repeat instead of the actual content. Fixed by stripping the
whole leading `# ...` line (`.replace(/^#.*\n+/, '')`) before the symbol-strip/slice, and
collapsing all whitespace (`\s+` → `' '`) so a Markdown line break doesn't become a raw `\n` in
the snippet.

**This is a raw character slice, not a sentence-aware truncation** — `slice(0, 160)` doesn't know
where a sentence ends, so a description can still end mid-word if the source text happens to run
past 160 characters at a bad spot. There's no code fix for this without adding truncation logic
the plan deliberately didn't ask for; instead, when rewriting an opening paragraph for SEO,
**craft its length so character 160 of the transformed text lands on a real word/sentence
boundary** — verify with the same transform the code applies, not by eye:

```python
import re
def transform(body_ru):
    s = re.sub(r'^#.*\n+', '', body_ru, count=1)
    s = re.sub(r'[#*`\[\]]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s
print(repr(transform(candidate_body)[:160].strip()))
```

Iterate the paragraph's wording until the printed slice ends cleanly (ideally on the paragraph's
own final period, with the paragraph length landing at ~158–160 characters so nothing from the
*next* paragraph or a Markdown `---` rule bleeds into the tail). This is how the `#37` rewrites of
`is-lithuanian-hard-to-learn` and `numbers-01-basics` were sized.

## English article twins (`/en/`, #48c)

Only articles have an English URL: `/en/dashboard/articles/` and `/en/dashboard/articles/<slug>/`.
Every other page still has one RU URL, and its metadata is Russian whatever the UI toggle says.

**Why articles only.** `hreflang` does not stop Google from clustering near-duplicates and picking
one canonical for the cluster. Programs, lists and phrases pages are mostly Lithuanian words, so
their RU and EN versions differ only in the translation column — Google could choose the EN twin
and drop the RU page from Russian results, which is all our traffic (we've already seen Google pick
a wrong canonical, `seo-log.md`). Articles carry full, different RU and EN prose, so clustering is
unlikely. Other pages get twins in a later plan only if RU traffic holds after ~3–4 weeks.

How it works:
- **Routes.** `app/en/dashboard/articles/` re-exports the RU index page and has its own `layout.tsx`
  metadata; `app/en/dashboard/articles/[slug]/` uses the shared helpers in
  `app/dashboard/articles/[slug]/articleSeo.tsx` (static params, metadata, page body + JSON-LD) with
  `lang='en'`. There is deliberately **no** `app/en/layout.tsx` with metadata, so nothing cascades.
- **Language.** `useLang` forces `en` on any `/en/` path on every render (so the static prerender
  is English), and on landing writes `fluent_lang='en'` only if nothing is stored — an explicit RU
  choice survives. `<html lang="ru">` is hardcoded in the root layout, so the post-build
  `scripts/en-html-lang.mjs` (part of `npm run build`) rewrites it to `en` in `out/en/**`.
- **Twin rule — exact match, never prefix.** `lib/localHref.ts` (`hasEnTwin`, `useLocalHref`) is the
  one place that decides which RU path has an `/en/` twin: `/dashboard/articles/` and
  `/dashboard/articles/<one segment>/`, query/hash kept. Prefix matching would hand `/en/` to paths
  without a twin and 404 them. Links to anything else (pricing, programs, grammar…) stay RU from EN
  pages; the UI stays EN there through `localStorage`. The Header toggle navigates to the twin on
  twin pages and reloads elsewhere; from any `/en/` page it always goes back to the RU path.
- **The path can't see the content gate.** `/dashboard/articles/<slug>/` matches the twin rule even
  for an article with no English body, whose `/en/` URL isn't prerendered — the backend would serve
  the `_` placeholder (index canonical, no `hreflang`, RU body) under an `/en/` URL. So: the list API
  returns `has_en` (computed in SQL in `routers/articles.py`, bodies stay out of the select) and the
  index links RU-only articles to their RU URL; the article page calls `markRuOnly(slug)` so
  `hasEnTwin` turns false for it and the toggle reloads instead of going to `/en/`.
  **Known limit:** a Markdown link inside an article body to a *different* RU-only article still gets
  `/en/` — the gate data isn't on that page and a fetch per link isn't worth it. All published
  articles have `body_en` today; when writing a RU-only article, link to it with a full RU URL
  (`https://fluent.lt/dashboard/articles/<slug>/`), which `localHref` leaves alone.
- **The alternates-replace trap.** Next replaces a child's `alternates` (and `openGraph`) wholesale
  instead of merging. So every EN metadata block sets its own `alternates` (self-canonical +
  `languages`) and `openGraph` (`en_US`, `/en/` url), and the `_` placeholders set their own
  `alternates: { canonical: <index> }` — otherwise they'd inherit the index's `hreflang` set.
- **Content gate.** An article gets an EN twin (build, `hreflang`, sitemap) only if `title_en` and
  `body_en` are both non-empty. Frontend: `hasEn` in `articleSeo.tsx`; backend: `_has_en` in
  `main.py`. Keep the two in sync.
- **Reciprocity, x-default = RU.** Both twins list the same three links (`ru`, `en`, `x-default` →
  RU), each including itself; the sitemap emits both `<url>` entries of a pair with the same set
  (`_sitemap_pair` in `main.py`). RU stays `x-default` to protect the current audience.
- **Encoding.** Six slugs contain Lithuanian letters. Next percent-encodes them (uppercase hex) in
  canonical/`hreflang`/og:url; the sitemap uses `urllib.parse.quote(slug, safe='')`, which gives
  the same bytes. This changed the RU article `<loc>` too (#48c): it used to emit the raw UTF-8
  slug, now it's percent-encoded, because the sitemap URL must match the page's canonical
  byte-for-byte or Google treats them as two URLs. Both sides are tested (`backend/tests/test_sitemap_hreflang.py`,
  `frontend/tests/en-seo-routes.spec.ts`).
- **RU pages must not change.** `frontend/scripts/seo-snapshot.mjs --diff <baseline>` fails on any
  RU title/description/canonical change and on `hreflang` added outside `/dashboard/articles/`.
- **Build fetch cache.** `next build` caches `fetch` results in `.next/cache/fetch-cache` across
  builds, so a local build can miss an article published since the last one. Delete that folder
  before a build whose output you compare against live data.

## Search engines registered (#51)

- **Google Search Console** — verified via `verification.google` in `frontend/app/layout.tsx`.
- **Bing Webmaster Tools** — imported from GSC (no tag needed; Bing re-checks GSC ownership via
  read-only OAuth). Sitemap imported too. Bing's index also feeds ChatGPT search, so this is the
  cheapest lever for AI-assistant visibility.
- **Yandex Webmaster** — verified via `verification.yandex` meta tag in `frontend/app/layout.tsx`.
  Chose the meta tag over DNS TXT because it needs no registrar access. Its "Google Tag" option
  needs Google Tag Manager, which the site doesn't use (plain GA). Removing the tag un-verifies it.
