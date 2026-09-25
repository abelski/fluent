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

## Metadata is always Russian, regardless of the UI language toggle

`generateMetadata` sources `title`/`description` from `title_ru`/`body_ru` unconditionally — never
`_en` — regardless of which language a visitor's toggle is set to. This isn't a bug to fix in the
metadata function itself: the site publishes **one static URL per article** (no `/en/` route, no
`hreflang`), so Google only ever crawls and indexes one language version of the `<title>` and
description for a given page. An English-language query is therefore always competing on a
Russian snippet. `ArticleContent.tsx` does swap the *visible body* by `lang` client-side (see
`documentation/articles-seo.md`'s "only the Russian version is indexed"), but that swap happens
after the page has already loaded — Google's crawler and snippet only ever see the RU build-time
version. Serving real English search intent would need separate `/en/` article URLs with
`hreflang` — a real feature, out of scope for a low-effort pass, recorded here so it isn't
re-discovered from scratch.

## Search engines registered (#51)

- **Google Search Console** — verified via `verification.google` in `frontend/app/layout.tsx`.
- **Bing Webmaster Tools** — imported from GSC (no tag needed; Bing re-checks GSC ownership via
  read-only OAuth). Sitemap imported too. Bing's index also feeds ChatGPT search, so this is the
  cheapest lever for AI-assistant visibility.
- **Yandex Webmaster** — verified via `verification.yandex` meta tag in `frontend/app/layout.tsx`.
  Chose the meta tag over DNS TXT because it needs no registrar access. Its "Google Tag" option
  needs Google Tag Manager, which the site doesn't use (plain GA). Removing the tag un-verifies it.
