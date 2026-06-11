---
name: smm
description: SMM scouting for fluent.lt — find active posts on X, Threads, and Reddit where you can promote the app. Searches for relevant conversations, presents opportunities with ready-to-paste reply text. Can type replies directly into the browser.
---

Find current conversations on X, Threads, and Reddit where fluent.lt can be promoted. Present each opportunity with a suggested reply. Never submit/post without explicit user approval.

## Rules

- No emojis in any generated text
- Never submit a reply without user approval — type it in, let user review, user hits send
- Screenshots go to `temp_files/screenshots/` (git-ignored)
- Use Chrome AppleScript (osascript) to read content and type replies in the user's main browser
- Always reuse existing tabs — never create new ones for scraping. Only navigate existing tabs to new URLs.
- After scraping, close tabs that are no longer needed
- Playwright is a fallback only if Chrome AppleScript fails

## Chrome AppleScript — known behaviours (learned from use)

**JavaScript return values:**
- AppleScript `execute tab javascript` returns `missing value` when the JS returns a string containing Cyrillic or other non-ASCII characters
- Workaround: use `JSON.stringify(...)` to return arrays/objects — those come back correctly
- For boolean checks (e.g. already-replied): `document.body.innerText.indexOf('artyrbelski') > -1` returns `true`/`false` strings correctly
- For post URLs: `JSON.stringify(Array.from(document.querySelectorAll('a')).map(a=>a.href).filter(...))` works reliably
- For body text: `document.body.innerText.slice(0, 600)` works if the slice contains mostly ASCII; Cyrillic slices return `missing value`

**Typing into browser fields:**
- Set clipboard via Python + pbcopy — handles UTF-8/Cyrillic reliably:
  ```bash
  python3 -c "import subprocess; subprocess.run(['pbcopy'], input='текст'.encode('utf-8'), check=True)"
  ```
- Click the reply field via JS: find element whose `innerText` starts with `Reply to `
- Then paste via System Events: `tell application "System Events" to keystroke "v" using command down`
- **Prerequisite:** VS Code must have Accessibility permission in System Settings > Privacy & Security > Accessibility (it's VS Code, not Terminal, because Claude Code runs inside VS Code)
- After pasting, verify by checking `document.querySelectorAll('[contenteditable=true]').length` (returns a number, no encoding issue)

**Already-replied check:**
- `document.body.innerText.indexOf('artyrbelski') > -1` can give false negatives if replies haven't loaded yet
- Always scroll once before checking: `window.scrollTo(0, document.body.scrollHeight)` + delay 3s
- Cross-reference against the fluent.lt Threads search to catch replies that may not load on the post page

## Phase 1 — Threads (primary platform)

Navigate the working tab to each search URL. Always use `set URL of tab N of window 1` — never `make new tab`.

Search URLs:
- `https://www.threads.com/search?q=%D0%BB%D0%B8%D1%82%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9+%D1%8F%D0%B7%D1%8B%D0%BA&serp_type=default` — Russian learners
- `https://www.threads.com/search?q=learn+Lithuanian&serp_type=default` — English learners
- `https://www.threads.com/search?q=Lithuanian+language&serp_type=default`

Get post URLs:
```bash
osascript -e 'tell application "Google Chrome" to execute tab 2 of window 1 javascript "JSON.stringify(Array.from(document.querySelectorAll(\"a\")).map(function(a){return a.href}).filter(function(h){return h.includes(\"/post/\")}).filter(function(v,i,a){return a.indexOf(v)===i}).slice(0,15))"'
```

For each post URL, check already-replied and get content:
```bash
osascript << APPL
tell application "Google Chrome"
  set URL of tab 2 of window 1 to "POST_URL"
  delay 4
  execute tab 2 of window 1 javascript "window.scrollTo(0, document.body.scrollHeight)"
  delay 2
  set already to execute tab 2 of window 1 javascript "document.body.innerText.indexOf('artyrbelski') > -1"
  set txt to execute tab 2 of window 1 javascript "document.body.innerText.slice(200, 700)"
  return (already as string) & "|||" & txt
end tell
APPL
```

Skip: political posts, posts already replied to by artyrbelski, posts with no learning intent.

Collect posts that are:
- Asking how to learn Lithuanian
- Asking for resources, courses, textbooks, apps
- Struggling with Lithuanian vocabulary or grammar
- Expressing intent to learn Lithuanian
- Complaining Duolingo has no Lithuanian

## Phase 2 — X (x.com)

```bash
osascript << 'EOF'
tell application "Google Chrome"
  set URL of tab 2 of window 1 to "SEARCH_URL"
  delay 4
  set content to execute tab 2 of window 1 javascript "JSON.stringify(Array.from(document.querySelectorAll('article')).map(function(a){return {text: a.innerText.slice(0,300), links: Array.from(a.querySelectorAll('a[href*=\"/status/\"]')).map(function(l){return l.href}).filter(function(v,i,a){return a.indexOf(v)===i})}}))"
  return content
end tell
EOF
```

Search URLs:
- `https://x.com/search?q=learn%20Lithuanian&src=typed_query&f=live`
- `https://x.com/search?q=Lithuanian%20language&src=typed_query&f=live`
- `https://x.com/search?q=%23languagelearning&src=typed_query&f=live`

## Phase 3 — Reddit

Navigate tab to Reddit (no login required):
1. `https://www.reddit.com/r/languagelearning/search/?q=Share+Your+Resources&sort=new&restrict_sr=1` — find the most recent weekly thread (within 7 days)
2. `https://www.reddit.com/r/lithuania/new/` — scan for language learning posts

## Phase 4 — Present and type replies

Present each opportunity:
```
[N] PLATFORM — AUDIENCE
@handle: "post quote"
URL: https://...
REPLY:
---
reply text in Artur's voice
---
```

Save full list to `temp_files/smm-opportunities-<YYYY-MM-DD>.md`.

Ask user which numbers to act on. For each selected post:

1. Navigate the working tab to the post URL
2. Generate reply text following `~/.claude/skills/fluent-reply.md` voice rules
3. Copy to clipboard via Python pbcopy (handles Cyrillic correctly):
   ```bash
   python3 -c "import subprocess; subprocess.run(['pbcopy'], input='''REPLY_TEXT'''.encode('utf-8'), check=True)"
   ```
4. Click the reply field:
   ```js
   var all = Array.from(document.querySelectorAll('*'));
   var el = all.find(function(e) { return e.innerText && e.innerText.trim().startsWith('Reply to '); });
   if (el) el.click();
   ```
5. Wait 2 seconds, then paste:
   ```applescript
   tell application "System Events" to keystroke "v" using command down
   ```
6. Tell the user: "Reply typed in tab — please review and hit send."
7. Never submit automatically.

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

**Reddit "Share Your Resources"** — post, not reply, can lead with fluent.lt directly:
> fluent.lt — бесплатные флешкарты и грамматика для тех кто учит литовский. Карточки привязаны к учебнику Sėkmės который используют в языковых школах. Там и другие материалы собираю. fluent.lt пишите адрес в браузере

## Notes

- Run weekly — X and Threads live searches change constantly
- Reddit "Share Your Resources" is posted weekly — always find the latest one
- The already-replied check via `indexOf('artyrbelski')` can miss replies that haven't loaded — cross-check with `https://www.threads.com/search?q=fluent.lt&serp_type=default` to see all existing artyrbelski replies
- VS Code needs Accessibility permission (System Settings > Privacy & Security > Accessibility) for keystroke paste to work
