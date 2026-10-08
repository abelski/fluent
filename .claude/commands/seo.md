# SEO — fluent.lt search health: progress, issues, indexing

Checks Google Search Console, Bing Webmaster Tools and Yandex Webmaster, compares with the last
run, and fixes indexing gaps (with consent).

Modes (from `$ARGUMENTS`):
- *(empty)* or `full` — Steps 1–8.
- `progress` — Steps 1–4 and 8 only (numbers + issues, no URL inspection).
- `index` — Steps 5–7 only (URL inspection + indexing requests).
- Anything else (e.g. a reminder text like "check sitemap + inspect 3 URLs") — do what it asks,
  **plus Steps 3–4 (Bing + Yandex) every time**. They take ~2 minutes and a narrow run without
  them leaves the log row half empty.

## Context
- **Properties**: GSC `https://fluent.lt/`, Bing `https://fluent.lt/`, Yandex `https:fluent.lt:443`.
  All three verified — see "Search engines registered" in `documentation/seo.md`.
- **Sitemap**: `https://fluent.lt/sitemap.xml` (generated live by `backend/main.py`).
- **Progress log**: `documentation/seo-log.md` — one row per run. Read the last row first; every
  number you report is compared against it.
- **Daily GSC indexing request limit**: ~10 per property per day.
- **Browser**: use the `helper-do-in-my-chrome` skill (the user's real, logged-in Chrome). If a
  login wall appears, stop and ask the user to log in. Never touch passwords.
- These dashboards are heavy SPAs: plain `browser_click` often times out. Read with
  `browser_evaluate(() => document.body.innerText)` after a 3–5 s wait, and click by text via
  `browser_evaluate` when a ref click times out.
- **GSC tricks (learned 2026-09-25):**
  - Performance URL params: `&num_of_days=28&metrics=CLICKS%2CIMPRESSIONS%2CPOSITION` shows
    position; `&breakdown=page` opens the Pages tab. Read rows from `table tbody tr`.
  - URL inspection has no deep link — type into the combobox "Проверка всех URL на ресурсе…".
  - For a "Страница является копией" page, the inspection shows **"Каноническая страница,
    выбранная Google"** — always record it. A foreign domain there is an issue (see log 2026-09-25).
  - Request indexing reliably with `browser_run_code_unsafe` (Playwright `page` API): fill the
    combobox, poll body text until "URL есть/нет в индексе Google", click the *visible*
    "Запросить индексирование" button, poll for "Отправлен запрос на индексирование". Click
    "Закрыть" before the next URL, or the old dialog's text gives a false OK.
  - Step 5 shortcut: collect example URLs from every Page-indexing reason, diff against the
    sitemap — anything in the sitemap not in those lists is indexed. Inspect only the rest.
  - (2026-10-06) If an old inspection dialog is still open, its overlay intercepts clicks on the
    combobox. Press Escape, reload `search-console?resource_id=https://fluent.lt/`, then
    `locator('input[aria-label^="Проверка всех URL"]').fill(url, { force: true })` + Enter.
    `getByRole('combobox', { name })` does not match it — use the aria-label selector.
  - The "/search-console/inspect?resource_id=…" URL without an `id` redirects to Overview.
- **Bing tricks (learned 2026-10-06):** all pages work as deep links with `?siteUrl=https://fluent.lt/`
  — `searchperf`, `aiperformance`, `sitemaps`. Read one `browser_run_code_unsafe` call that
  `goto`s each and returns `document.body.innerText` after ~6 s. In Search Performance click
  `getByText('30 D', { exact: true })`. Bing also auto-discovered `https://www.fluent.lt/sitemap.xml`
  — `www` 301s to the apex, so it's harmless, not an issue.
- **Yandex tricks (learned 2026-10-06):** deep links under
  `https://webmaster.yandex.com/site/https:fluent.lt:443/` — `dashboard/`, `diagnosis/checklist/`,
  `indexing/sitemap/` — read the same way (~7 s wait). The dashboard has clicks (last 2 weeks),
  top queries with shows/clicks, recent search updates (added/removed) and the problems block.
  It does not show a "pages in search" number directly — get it from Индексирование → Страницы в
  поиске, or mark it as an estimate in the log.

---

## Step 1 — Baseline

1. Read the last row of `documentation/seo-log.md` (create the file with the header from Step 8 if
   missing — then this run is the baseline).
2. Fetch `https://fluent.lt/sitemap.xml` (`curl -s`) and count `<loc>` entries.

---

## Step 2 — Google Search Console

**Performance** — `https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Ffluent.lt%2F`
(default range: last 3 months; also switch to "last 28 days" for the headline numbers).
Record: clicks, impressions, avg CTR, avg position (28 d). From the Queries tab: top 10 queries by
impressions. From the Pages tab: top 5 pages by clicks.

**Page indexing** — `https://search.google.com/search-console/index?resource_id=https%3A%2F%2Ffluent.lt%2F`
Record: indexed count, not-indexed count, and every reason row ("Why pages aren't indexed") with
its page count. Open each reason with a non-zero count and list its example URLs.

**Sitemaps** — `https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Ffluent.lt%2F`
Record: status, last read date, discovered pages.

**Other issues** — check the Overview page for Core Web Vitals (mobile/desktop poor/needs-work
counts), HTTPS, and any Manual actions / Security issues. Anything non-zero is an issue.

---

## Step 3 — Bing Webmaster Tools

- **Search Performance** `https://www.bing.com/webmasters/searchperf?siteUrl=https://fluent.lt/` —
  clicks, impressions, CTR (last 1 month).
- **AI Performance** (BETA, left menu) — citations in Copilot / AI answers. This is the only
  dashboard showing AI-assistant visibility; always record it, even if zero.
- **Sitemaps** `https://www.bing.com/webmasters/sitemaps?siteUrl=https://fluent.lt/` — status,
  URLs discovered.
- **Site Scan / Recommendations** — list any errors/warnings with counts.
- **IndexNow** (left menu) — URLs received via IndexNow (#59a); record the count in the log Notes.

---

## Step 4 — Yandex Webmaster

- **Сводка** `https://webmaster.yandex.com/site/https:fluent.lt:443/dashboard/` — pages in search,
  ИКС, and the problems block.
- **Диагностика** `https://webmaster.yandex.com/site/https:fluent.lt:443/diagnosis/checklist/` —
  every problem (fatal / critical / possible / recommendation).
- **Sitemap** `https://webmaster.yandex.com/site/https:fluent.lt:443/indexing/sitemap/` — status.
- **Запросы** (Эффективность → Поисковые запросы) — shows, clicks for the last 2 weeks.
- **IndexNow** — Yandex has no IndexNow menu item (checked 2026-10-08). Proxy: Индексирование → Статистика обхода → "Последние 30 изменений", new URLs going "N/a → 200" right after a deploy (#59a). Record it in the log Notes.

---

## Step 5 — Inspect key URLs (GSC)

Check only the **main section pages** plus anything Step 2 flagged:
- `https://fluent.lt/`, `/pricing/`, `/programs/`, `/dashboard/grammar/`, `/dashboard/lists/`,
  `/dashboard/articles/`, `/dashboard/phrases/`, `/extension/`
- Every `/programs/[key]/` page from the sitemap

For each: enter it in the GSC inspection box, press Enter, wait, record:
- ✅ **Indexed** — "URL есть в индексе Google"
- ⚠️ **Discovered / crawled, not indexed** — "Обнаружена/Просканирована, не проиндексирована"
- ❌ **Not indexed** — note the reason (noindex, redirect, canonical, 404…)

---

## Step 6 — Ask consent before indexing requests

**Always ask first.** Show the non-indexed URLs and ask:
> "These N URLs are not indexed. Submit indexing requests for them? (max 10/day)"

---

## Step 7 — Submit indexing requests (with consent)

For each approved URL: click "Запросить индексирование", wait ~35 s, confirm "Отправлен запрос на
индексирование", close. Stop at 10 per session.

In Bing, the same URLs can be sent via URL Submission (Configuration → Submit URLs) — ask first too.

---

## Step 8 — Report and log

Append one row to `documentation/seo-log.md` (columns below; `—` for anything not checked):

```
| Date | GSC clicks 28d | GSC impr 28d | GSC avg pos | GSC indexed / not | Bing clicks | Bing impr | Bing AI citations | Yandex pages in search | Sitemap URLs | Open issues | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

Then show the user, short:
1. **Progress** — each number vs the last row (`↑ +12`, `↓ −3`, `=`). Say plainly if nothing moved.
2. **Issues** — table: engine | issue | pages affected | new since last run? | suggested fix.
   Suggest fixes in repo terms (file paths). Do not fix code here — a fix goes through
   `/sdlc-triage` or `/sdlc-brainstorm` on its own branch.
3. **Top queries** — new ones since last run, and queries with high impressions but position >10
   (cheapest wins: improve that page's title/description or write an article for it).
4. **Actions taken** — indexing requests sent (URL, engine).

The log file is the only thing this command writes to the repo. Tell the user it changed; they
commit it.
