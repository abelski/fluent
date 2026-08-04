# Fluent — Lithuanian Word Helper (Chrome extension)

Select a Lithuanian word on any page to see its English (and, when available,
Russian) translation, and add it straight into a "From internet" list in your
Fluent account. Translation is free for any logged-in Fluent user; adding a
word to your vocabulary is a Premium feature.

Plain JS, Manifest V3, no build step, no external libraries. All network
calls happen in `background.js`; the content script only draws UI.

## Load unpacked (V1 distribution — no Chrome Web Store listing yet)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the Fluent icon to the toolbar if you'd like quick access to the popup.

## Dev toggle (Production vs Local dev)

Right-click the extension icon → **Options** (or open it from the popup's
"Backend settings" link) and choose:

- **Production** — `https://fluent.lt` (default)
- **Local dev** — `http://localhost:8000`

Switching clears the saved connection, because production and local dev use
different JWT secrets — a token from one is rejected by the other.

The same **Options** page also has a **Translation language** setting
(English / Russian / Both, default English) controlling which language(s)
the popup card shows for words not already in Fluent's dictionary; changing
it does not affect your saved connection.

**Local dev note:** the extension's "Local dev" mode polls
`http://localhost:8000` for the token. If you run the frontend as a separate
Next.js dev server on `:3000`, the JWT ends up stored under whichever origin
you actually logged in from. To keep things simple, log in by hitting
`http://localhost:8000` directly (not `:3000`) so the token lands on the
origin the extension is polling.

## How it works

- **Connect**: opens/focuses a tab at the configured backend's `/dashboard`
  and polls `localStorage.fluent_token` every 2 seconds (up to 90s). Once
  found, the token is validated against `/api/me/quota` and stored in
  `chrome.storage.local`.
- **Select a word** (or select + `Ctrl`/`Cmd` + double-click to skip the
  floating icon): a small "f." icon appears near the selection. Click it to
  see the translation and, if you're Premium, a list picker (defaults to
  "From internet"; pick any of your other personal lists) plus an
  **Add to learn** button.
- **Any 401** from the backend (expired/invalid token) clears the stored
  token everywhere; the UI falls back to "Connect Fluent".

## Manual smoke checklist

1. Load unpacked (see above). Open **Options**, select **Local dev**.
2. Start the local backend (`http://localhost:8000`) and log in there.
3. Click the extension icon → **Connect Fluent** → a tab opens at
   `/dashboard`. Within ~90s the popup should flip to "Connected" with your
   email.
4. On any normal web page, select a word that exists in Fluent's public word
   lists (e.g. a common word like "namas"). The floating icon should appear;
   clicking it shows the DB translation instantly (`source: "db"`).
5. Select a Lithuanian word that's *not* in the DB. The card should show a
   short "Translating…" spinner, then a translation from MyMemory
   (`source: "mymemory"`, no Russian translation).
6. Hold `Ctrl` (or `Cmd` on macOS) and double-click a word — the translation
   card should open directly, without the intermediate icon.
7. If your test account is Premium/admin, click **Add to learn** — it should
   create (or reuse) a personal list titled **"From internet"**, visible at
   `/dashboard/lists`.
8. Repeat step 7 on the same word — the button/response should indicate
   "Already in your list" and the word count in `/dashboard/lists` should
   not increase.
9. On a non-Premium account, the card's footer should read **"Upgrade to
   add"** and open `/dashboard` on click instead of adding the word.
10. Click **Disconnect** in the popup — the popup should show "Connect
    Fluent" again, and a new word lookup should prompt to connect.

## Known limitations (V1)

- No Chrome Web Store packaging yet — load-unpacked only.
- No automated (Playwright) test for the extension UI itself; all business
  logic lives server-side and is covered by `backend/tests/test_extension.py`.
- MyMemory's free tier is a shared anonymous quota; heavy usage may see
  translations fail. The DB lookup, in-memory cache, and strict input
  validation all reduce calls to it.
