---
number: 58
slug: seo-content-gaps
status: draft
---

# Idea #58 — SEO content gaps: articles for queries we show up for but don't win

## Problem
Search engines already show fluent.lt for many beginner queries, but mostly on page 2 or lower,
and on a few cases no page of ours matches the query at all. Data from GSC (last 3 months, pulled
2026-10-03) and Yandex Webmaster (same day):

| Cluster | Queries (impressions, avg position) | What we have today |
| --- | --- | --- |
| Greetings / polite phrases | GSC: «добрый вечер на литовском» 10 / 11.1, «доброе утро на литовском» 8 / 11.8, «привет на литовском» 3 / 11.0, «привет по литовски» 3 / 11.3, «доброе утро по литовски» 3 / 11.3, «добрый вечер по литовски» 2 / 11.0, «добрый день на литовском» 1 / 34. Yandex: «спасибо по литовски» 55 shows, «привет по литовски» 42, «как по литовски привет» 18 | No dedicated page. Google shows whatever is closest. |
| Cases | «сколько падежей в литовском языке» 7 / 12.0, «литовские падежи» 1 / 9, «падежи в литовском» 1 / 10, «падежи литовского языка» 1 / 11 | `lithuanian-cases-explained` exists, but the number of cases is not in its title or first paragraph. |
| Days and months | «дни недели на литовском» 3 / 8.7, «birzelis на русском» 1 / 64 | No page. |
| Numbers / counting | «цифры на литовском» 60 / 8.7 (1 click), «числа на литовском» 24 / 8.7 (0 clicks), «счет на литовском» 4 / 8.8, «счет по литовски» 4 / 9.5 | `numbers-01-basics` ranks but is rarely clicked; «счёт» is not in its title. |
| Sėkmės textbook | «sekmes» 9 / 11.8, «sekmes audio» 3 / 7.7, «sėkmės» 1 / 9, «sekmės» 1 / 23 | `/programs/sekmes/` exists; it doesn't mention audio. |
| Regitra | «20 вопросов в регитре» 5 / 9.4 | `regitra-vocabulary` exists; no section matching that query. |

The audience is Russian-speaking beginners in Lithuania looking for basic phrases. Page 2 gets
almost no clicks, so these impressions are wasted today.

## Desired outcome
Each cluster above has a page that answers the query directly, in title and first paragraph.
Success = these queries move to page 1 (position ≤ 10) and start getting clicks, tracked by
`/seo` in `documentation/seo-log.md`.

## Scope
- In:
  - **New article: greetings and polite phrases** (labas, labas rytas, laba diena, labas vakaras,
    ačiū, prašau, atsiprašau, iki, sudie…), RU + EN body, audio, linking to `/dashboard/phrases/`.
    Biggest expected gain.
  - **New article: days of the week and months**, fits the `numbers-*` series.
  - **Edit `lithuanian-cases-explained`:** «7 падежей» in `title_ru` and the first paragraph
    (the first 160 chars of `body_ru` are the meta description, see `documentation/seo.md`).
  - **Edit `numbers-01-basics`:** add «счёт» to title/first paragraph without losing «цифры».
  - **Edit `/programs/sekmes/`:** mention the audio.
  - **Edit `regitra-vocabulary`:** a section matching «20 вопросов в регитре».
- Out (non-goals):
  - English-language SEO (~30 queries like «lithuanian phrases», «slang», «sayings», «cheers»,
    «tongue twisters» at positions 40–60). The cause is RU-only URLs with no `hreflang`; that
    is `idea_48_full-english-coverage` (plan 48c), not this idea.
  - Opening practice tests to Google (`Disallow: /dashboard/practice/` in `backend/main.py`).
    Quiz pages carry little text; articles are the better lever.
  - New word lists — lists are already indexed via `/programs/`.
  - The 3 articles Google wrongly treats as copies of `www.747live.bet` — handled separately,
    see `documentation/seo-log.md` 2026-10-03 and `temp_files/seo-casino-canonical/`.

## Decisions
- **Content over features** — no code change is needed for the core of this idea; it is articles
  and edits to existing articles. Code only if the sėkmės program page text lives in code.
- **Publishing route** — articles go in as admin-import `.md` files (`_parse_markdown_article`
  format); the user imports them at `/dashboard/admin/articles` and redeploys (the page HTML is
  built at deploy time, see `documentation/articles-seo.md`). Claude cannot write to prod.
- **Lithuanian check** — the user (or a native speaker) reviews the Lithuanian examples before
  publishing.

## Open questions
- Order: greetings first is the recommendation. One article per deploy, or all at once?
- Does the greetings article overlap too much with `/dashboard/phrases/`? Possible answer: the
  article is the search landing page and links to the phrase list for practice.

## Precedents
- `plans/improvements/implemented/plan_37_seo-quick-wins.md` — title/first-paragraph rewrites
  for `numbers-01-basics` and `is-lithuanian-hard-to-learn`, and the character-budget technique
  for the 160-char description.
- `documentation/articles-seo.md` — how an article reaches Google, publish-then-deploy order.
- `documentation/seo-log.md` — baseline numbers to measure against.
