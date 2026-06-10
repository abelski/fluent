# SEO — fluent.lt Google Search Console maintenance

## Context
- **GSC property**: `https://fluent.lt/` (use this in all GSC URLs and inspection forms)
- **Sitemap source**: `https://fluent-qhk8.onrender.com/sitemap.xml` (fetch this to get current URLs)
- **Production URL prefix**: `https://fluent.lt` (replace `https://fluent-qhk8.onrender.com` when submitting to GSC)
- **Daily indexing request limit**: ~10 per property per day

---

## Step 1 — Fetch current sitemap URLs

Use Playwright to fetch `https://fluent-qhk8.onrender.com/sitemap.xml` and extract all `<loc>` URLs.
Replace the render.com hostname with `fluent.lt` in every URL before using them in GSC.

---

## Step 2 — Open Google Search Console

Navigate to: `https://search.google.com/search-console?resource_id=https://fluent.lt/`

If the user is not logged in, wait for them to log in before continuing.

---

## Step 3 — Check sitemap status

Navigate to: `https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Ffluent.lt%2F`

Report:
- Sitemap URL
- Status (Успешно / error)
- Last processed date
- Number of discovered pages

---

## Step 4 — Inspect key URLs and collect status

Check only the **main section pages** (skip individual articles — they are too numerous):
- `https://fluent.lt/`
- `https://fluent.lt/pricing/`
- `https://fluent.lt/programs/`
- `https://fluent.lt/dashboard/grammar/`
- `https://fluent.lt/dashboard/lists/`
- `https://fluent.lt/dashboard/articles/`
- Any `/programs/[key]/` pages from the sitemap

For each URL:
1. Enter the URL in the GSC inspection combobox and press Enter
2. Wait for results to load
3. Record the indexing status:
   - ✅ **Indexed** — "URL есть в индексе Google"
   - ⚠️ **Discovered, not indexed** — "Обнаружена, не проиндексирована"
   - ❌ **Not indexed** — "URL нет в индексе Google" (note the reason: noindex tag, redirect, etc.)

Show the user a status table after checking all URLs:

| URL | Status |
|-----|--------|
| ... | ... |

---

## Step 5 — Ask user consent before submitting indexing requests

**IMPORTANT: Always ask the user before submitting any indexing requests.**

Show the list of URLs that are NOT indexed and ask:
> "These N URLs are not indexed. Submit indexing requests for all of them? (yes/no)"

Only proceed if the user confirms.

---

## Step 6 — Submit indexing requests (with consent)

For each non-indexed URL the user approved:
1. Click "Запросить индексирование"
2. Wait ~35 seconds for the verification dialog to complete
3. Confirm "Отправлен запрос на индексирование" success dialog
4. Close the dialog and move to the next URL

Keep count — stop at 10 total requests per session (daily GSC limit).

---

## Step 7 — Final report

Print a summary:

| URL | Before | Action taken |
|-----|--------|--------------|
| https://fluent.lt/ | Indexed | Re-index requested |
| https://fluent.lt/programs/ | Not indexed | Index requested |
| ... | ... | ... |

Note: newly submitted URLs typically appear in Google Search within a few days to 2 weeks.
