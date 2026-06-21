---
name: smm
description: SMM scouting for fluent.lt — find active posts on X, Threads, and Reddit where you can promote the app. Searches for relevant conversations, presents opportunities with ready-to-paste reply text. Can type replies directly into the browser.
---

Find current conversations on X, Threads, and Reddit where fluent.lt can be promoted. Present each opportunity with a suggested reply. Never submit/post without explicit user approval.

## Rules

- No emojis in any generated text
- Never submit a reply without user approval — type it in, let user review, user hits send
- Screenshots go to `temp_files/screenshots/` (git-ignored)
- Use Playwright connected to Chrome via CDP (debug port 9222) — no AppleScript
- Always reuse the existing working tab — navigate it to new URLs, never open new tabs
- After loading a search results page, collect all post URLs then visit them one by one

## Setup — Chrome debug port

Chrome must be running with `--remote-debugging-port=9222`. Check first:
```bash
curl -s http://localhost:9222/json/version | python3 -m json.tool
```

If not running with the flag, tell the user to quit Chrome and relaunch:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 &
```

## Playwright CDP helpers

All page interactions use inline Python via bash heredoc. Base pattern:

```bash
python3 << 'EOF'
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    ctx = browser.contexts[0]
    page = ctx.pages[0]   # reuse existing tab

    page.goto("URL", wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)

    text = page.inner_text("body")
    print(text[:2000])
EOF
```

### Get post URLs from search results
```python
links = page.evaluate("""
    Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(h => h.includes('/post/'))
        .filter((v,i,a) => a.indexOf(v) === i)
        .slice(0, 15)
""")
import json; print(json.dumps(links))
```

### Check post — already replied + get text
```python
page.goto(post_url, wait_until="domcontentloaded")
page.wait_for_timeout(4000)
page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
page.wait_for_timeout(2000)
text = page.inner_text("body")
already = "artyrbelski" in text
print("ALREADY:", already)
print("TEXT:", text[:1500])
```

### Type a reply
```python
page.goto(post_url, wait_until="domcontentloaded")
page.wait_for_timeout(3000)

# click the reply area placeholder
reply_trigger = page.locator('text=Reply to').first
if reply_trigger.is_visible():
    reply_trigger.click()
else:
    page.locator('div[contenteditable="true"]').first.click()

page.wait_for_timeout(1000)
box = page.locator('div[contenteditable="true"]').last
box.click()
# fill handles Cyrillic natively — no clipboard tricks needed
box.fill(reply_text)
page.wait_for_timeout(500)
print("Typed:", box.inner_text()[:200])
```

If `.fill()` clears the field on a React input, fall back to:
```python
box.click()
page.keyboard.type(reply_text, delay=20)
```

## Phase 1 — Threads (primary platform)

Search URLs — run all of these each session:
- `https://www.threads.com/search?q=%D0%BB%D0%B8%D1%82%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9+%D1%8F%D0%B7%D1%8B%D0%BA&serp_type=default` — Russian learners
- `https://www.threads.com/search?q=%D0%B3%D1%80%D0%B0%D0%B6%D0%B4%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%BE+%D0%9B%D0%B8%D1%82%D0%B2%D1%8B&serp_type=default` — citizenship angle
- `https://www.threads.com/search?q=%D1%8D%D0%BA%D0%B7%D0%B0%D0%BC%D0%B5%D0%BD+%D0%BB%D0%B8%D1%82%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9&serp_type=default` — exam angle
- `https://www.threads.com/search?q=A2+%D0%BB%D0%B8%D1%82%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9&serp_type=default` — A2 level
- `https://www.threads.com/search?q=learn+Lithuanian&serp_type=default` — English learners
- `https://www.threads.com/search?q=Lithuanian+language&serp_type=default`

For each search: collect post URLs, then visit each, check already-replied, read text.

Skip posts that:
- artyrbelski has already replied to
- Are political arguments with no learning angle
- Have no learning/language/citizenship intent

Collect posts that are:
- Asking how to learn Lithuanian or where to find resources
- Struggling with vocabulary or grammar
- Preparing for A2 or citizenship exam
- Celebrating passing an exam (reply with next-step resource)
- About getting Lithuanian citizenship (commenters will need the exam path)
- Free courses announcements (complement with self-study tools)

## Phase 2 — X (x.com)

Check login status first — if "Sign in" is on the page, skip X entirely.

Search URLs:
- `https://x.com/search?q=learn%20Lithuanian&src=typed_query&f=live`
- `https://x.com/search?q=Lithuanian%20language&src=typed_query&f=live`

Extract tweet links:
```python
links = page.evaluate("""
    Array.from(document.querySelectorAll('a[href*="/status/"]'))
        .map(a => a.href)
        .filter((v,i,a) => a.indexOf(v) === i)
        .slice(0, 10)
""")
```

## Phase 3 — Reddit

Navigate to r/languagelearning Share Your Resources search:
```
https://www.reddit.com/r/languagelearning/search/?q=Share+Your+Resources&sort=new&restrict_sr=1
```

Find the most recent thread (within 7 days). Navigate to it and check:
```python
text = page.inner_text("body")
already = "fluent.lt" in text or "abelski" in text
```

Also check r/lithuania new posts for language learning threads.

## Phase 4 — Present and type replies

Present each opportunity:
```
[N] PLATFORM — AUDIENCE
@handle: "post quote (first 150 chars)"
Views: X | Date: ...
URL: https://...
Already replied: NO
REPLY:
---
reply text in Artur's voice
---
```

Save full list to `temp_files/smm-opportunities-<YYYY-MM-DD>.md`.

Ask user which numbers to act on. For each selected post:

1. Navigate the working tab to the post URL
2. Generate reply text following `~/.claude/skills/fluent-reply.md` voice rules
3. Type the reply using Playwright (handles Cyrillic natively, no pbcopy tricks)
4. Tell the user: "Reply typed in tab — please review and hit send."
5. Never submit automatically.

## Generating reply text

Voice is documented in `~/.claude/skills/fluent-reply.md`. Key rules:

- Lead with practical advice — fluent.lt comes mid-reply, not at the start
- Russian posts → Russian reply, English → English
- Flowing single paragraph, no line breaks, no hashtags
- No capital letters mid-sentence, no period at end
- `)` or `))` as emoticon, never emoji
- fluent.lt always lowercase, mentioned once
- Always add: "только пишите адрес в браузере тк тредс что-то портит" (RU) or "type the URL directly, Threads breaks links" (EN)
- Max 5 sentences, write like a real person texting

**Reddit "Share Your Resources"** — post, not reply, lead with fluent.lt directly:
> fluent.lt — бесплатные флешкарты и грамматика для тех кто учит литовский. Карточки привязаны к учебнику Sėkmės который используют в языковых школах. Там и другие материалы собираю. fluent.lt пишите адрес в браузере

## Notes

- Run weekly — Threads live searches change constantly
- Reddit "Share Your Resources" is posted monthly — always find the latest one
- Scroll before checking already-replied — content loads lazily
- Cross-check with `https://www.threads.com/search?q=fluent.lt&serp_type=default` to see all existing artyrbelski replies
