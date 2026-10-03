---
number: 58
slug: seo-content-gaps
status: confirmed
---

# Idea #58 — SEO content gaps: articles for queries we show up for but don't win

## Problem
Search engines already show fluent.lt for many beginner queries, but mostly on page 2 or lower,
and for some queries no page of ours matches at all. Data from GSC (last 3 months, pulled
2026-10-03) and Yandex Webmaster (same day):

| Cluster | Queries (impressions, avg position) | What we have today |
| --- | --- | --- |
| Greetings / polite phrases | GSC: «добрый вечер на литовском» 10 / 11.1, «доброе утро на литовском» 8 / 11.8, «привет на литовском» 3 / 11.0, «привет по литовски» 3 / 11.3, «доброе утро по литовски» 3 / 11.3, «добрый вечер по литовски» 2 / 11.0, «добрый день на литовском» 1 / 34. Yandex: «спасибо по литовски» 55 shows, «привет по литовски» 42, «как по литовски привет» 18. EN (GSC): «basic lithuanian phrases» 2 / 41, «cheers in lithuanian» 2 / 48.5, «lithuanian cheers» 1 / 47, «prost auf litauisch» 2 / 50, «kaip sekasi» 2 / 49 | No dedicated page; no greetings phrase list (only the two Sėkmės textbook phrase programs, 181 + 377 phrases). |
| Days and months | «дни недели на литовском» 3 / 8.7, «birzelis на русском» 1 / 64 | No article. Word list «Mėnesiai» / «Months» (id 237, last list of the Sėkmės program, 12 words, 21 learners) has months only; the 7 weekday words exist (ids 3238–3244, accented) in Sėkmės ch. 4 list 190. |
| Cases | «сколько падежей в литовском языке» 7 / 12.0, «литовские падежи» 1 / 9, «падежи в литовском» 1 / 10, «падежи литовского языка» 1 / 11 | `lithuanian-cases-explained` exists; «их семь» is already in the first paragraph (= meta description), but not in `title_ru`. |
| Numbers / counting | «цифры на литовском» 60 / 8.7 (1 click), «числа на литовском» 24 / 8.7 (0 clicks), «счет на литовском» 4 / 8.8, «счет по литовски» 4 / 9.5 | `numbers-01-basics` ranks but is rarely clicked; «счёт» is not in its title. |
| Sėkmės textbook | «sekmes» 9 / 11.8, «sekmes audio» 3 / 7.7, «sėkmės» 1 / 9, «sekmės» 1 / 23 | `/programs/sekmes/`: description is the generic «Программа изучения литовского языка уровня A1. Тематические наборы слов и упражнения.» — no mention of audio. |
| Regitra | «20 вопросов в регитре» 5 / 9.4 — the pre-drive check questions asked before the practical exam | `regitra-vocabulary` has no section on them. Official list: regitra.lt «Patikrinimo prieš važiavimą klausimai». |

The audience is Russian-speaking beginners in Lithuania looking for basic phrases, plus a small
English-speaking tail. Page 2 gets almost no clicks, so these impressions are wasted today.

## Desired outcome
Each cluster has a page that answers the query directly, in title and first paragraph, and the
two new articles hand the reader a list to study right away. The queries above move to page 1
(position ≤ 10) and start getting clicks.

## Proposed spec
No behaviour change: this idea is content (articles, a phrase program, a word list, text edits)
entered through existing admin features. `specs/articles.md`, `specs/phrases.md` and
`specs/lists.md` already describe how these are created, shown and gated; nothing in them
changes. Premium gating of phrase audio (`specs/phrases.md`, "Phrase pronunciation audio is
premium-gated") applies to the new phrase program unchanged.

## Scope
- In — **batch 1** (one deploy, after the #48c check):
  - **New article: greetings and polite phrases.** labas, labas rytas, laba diena, labas vakaras,
    sveiki, ačiū, prašau, atsiprašau, iki, viso gero, plus sections **«How are you»** (`kaip
    sekasi`, `kaip gyvuoji`) and **«Cheers / toast»** (`į sveikatą`). RU body + EN body; the EN
    version targets the EN queries above (it gets its own `/en/` URL via #48c).
  - **New phrase program «Приветствия и вежливость» / «Greetings and polite phrases»**
    (~20 phrases, the ones in the article), created in admin, RU + EN translations. The article
    links to it as its call to action.
  - **New article: days of the week and months** (RU + EN), in the `numbers-*` series style.
  - **Word list 237:** add the 7 existing weekday words (ids 3238–3244) and rename it to
    «Mėnesiai ir savaitės dienos» / «Months and days of the week». The article links to it.
- In — **batch 2** (one deploy, 2–3 weeks after batch 1):
  - `lithuanian-cases-explained`: «7 падежей» in `title_ru` (body already says it).
  - `numbers-01-basics`: «счёт» in title / first paragraph without losing «цифры».
  - `/programs/sekmes/`: description mentions the audio.
  - `regitra-vocabulary`: section «20 вопросов перед экзаменом по вождению» — the official
    pre-drive check questions **and the Lithuanian answer phrases** the candidate says (LT
    question + LT answer phrase + RU translation of both), taken only from the regitra.lt list.
- Out (non-goals):
  - English SEO beyond what the EN body of the two new articles covers («lithuanian slang»,
    «sayings», «proverbs», «tongue twisters»): EN twins for other pages are #48d, gated on the
    #48c check.
  - Free phrase audio for the new program — same Premium rule as every program.
  - Opening practice tests to Google (`Disallow: /dashboard/practice/`).
  - The 3 articles Google treats as copies of `www.747live.bet` (`documentation/seo-log.md`
    2026-10-03, draft refresh in `temp_files/seo-casino-canonical/`).

## Decisions
- **Rollout** — two batches: new pages first, then edits to existing pages 2–3 weeks later, so
  each effect shows separately in GSC. Nothing ships before the ~24 Oct #48c RU-traffic check.
- **Greetings EN version** — written for EN queries, not a plain translation: includes «How are
  you» and «Cheers» sections, which also go into the RU version.
- **Greetings call to action** — a new dedicated phrase program (~20 phrases), not a link to the
  Sėkmės program.
- **Greetings program access** — same rules as every phrase program: study within the free
  limit, audio Premium-only. No code exception.
- **Days and months list** — extend the existing «Mėnesiai» list (237) with the 7 existing
  weekday words, don't create a new one; rename to «Mėnesiai ir savaitės dienos» / «Months and
  days of the week». Learners' progress is kept (progress is per word); the 21 learners of that
  list see it grow from 12 to 19 words.
- **Regitra section** — include it: the 20 pre-drive questions plus the Lithuanian phrases to answer them, sourced only from the official regitra.lt list.
- **Publishing route** — articles go in as admin-import `.md` files (`_parse_markdown_article`
  format); the user imports them at `/dashboard/admin/articles` and deploys. Phrase program and
  list changes are made in admin. Claude cannot write to prod (memory: article publishing is the
  user's step).
- **Lithuanian check** — the user reviews the Lithuanian examples before publishing.

## Precedents
- `plans/improvements/implemented/plan_37_seo-quick-wins.md` — title/first-paragraph rewrites
  for `numbers-01-basics` and `is-lithuanian-hard-to-learn`, and the 160-char description budget
  technique. Reused for batch 2.
- `documentation/articles-seo.md` — how an article reaches Google; publish-then-deploy order.
- `plans/improvements/implemented/IMPLEMENTED-plan_48c_en-seo.md` — an article gets an `/en/`
  URL only if `title_en` and `body_en` are non-empty; both new articles must have them.

## Success check
Tracked with `/seo` in `documentation/seo-log.md`, 3–4 weeks after each batch:
- Batch 1: the greetings queries (RU, and the EN ones on the `/en/` URL) and «дни недели на
  литовском» reach position ≤ 10 and get clicks; both new articles are indexed (RU + EN).
- Batch 2: «сколько падежей…», «цифры/числа/счёт на литовском», «sekmes», «20 вопросов в
  регитре» move up vs the 2026-10-03 baseline above, and CTR on `numbers-01-basics` rises.
- Enrollments in the new greetings program (admin data) show the article converts readers.

## Open questions
- Exact phrase list for the greetings program (~20) — settled while writing the article.
