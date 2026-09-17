---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: null
suggested_effort: null
confirmed_model: claude-sonnet-5
confirmed_effort: medium
---

# Plan #34 — Browser extension visual redesign

## Context

The mascot-driven redesign (Inter font, flat `border-line` cards, `emerald-600`/`ink`/`muted`
tokens, TAK mascot) shipped across the 5 top-nav dashboard pages and is documented as the source
of truth in `documentation/design system/Component Library (as-built).html`. That doc says
outright (line ~196): **"~18 other files (admin, pricing, premium, settings, articles,
**extension**) still use the older `border-gray-900` heavy-border style ... intentionally left
untouched — they were never given a design pass."**

`temp_files/redesign extention/Fluent Extension.dc.html` is a leftover prototype mockup showing
what an extension redesign could look like (TAK marks the save affordance, a popup with stats).
It predates the shipped design system and uses a different, retired visual language (Archivo/serif
fonts, 2px black borders, its own `--color-accent` tokens) — **not** to be copied verbatim. Its
useful part is the *interaction* idea (TAK is the save button; the popup shows real stats), not its
CSS.

This plan brings the actual browser extension (`extension/`: popup, options, on-page save
card/icon) onto the shipped token palette and the real `Tak.tsx` mascot, dropping every ad-hoc hex
color found in that folder. Scope is the extension only — **not** `frontend/app/extension/page.tsx`
(the marketing page), per explicit user choice.

## What exists today (fact-finding, already done)

- `extension/popup.html`/`popup.js`: ad-hoc colors `#006A44`, `#10b981`, `#FFB81C`; old badge/button
  styles.
- `extension/options.html`/`options.js`: same ad-hoc `#006A44`, plus neutrals not on any token.
- `extension/content.js` (569 lines, single IIFE, closed shadow DOM, **zero shared CSS** — every
  color is a literal hex per `Object.assign(el.style, ...)`): states are collapsed icon
  (`showIcon`, ~81–113), expanded card (`showCard` ~127–279) with translation/error sub-states,
  gloss inputs, footer branching on connect/premium status (`renderFooter` ~353–531: not-connected
  → connect button `#006A44`; free → `#FFB81C` upgrade button; premium/admin → list picker + red
  `#C1272D` add button). No dedicated "saved" card/badge — success is just a button-text swap
  ("Added!"). No undo state exists (mockup's "Undo" button has no backing state — dropped).
- `extension/background.js`: message API is `translate`, `addWord`, `getStatus`, `getLists`,
  `connect`. **No stats fields exist anywhere** — no per-site count, no CEFR "N to A2", no streak.
- `backend/routers/extension.py`: only `translate`, `words` (add), `info`, `download`. No stats.
- **But** `GET /me/stats` already exists (`backend/routers/words.py:1209`, used by the main
  dashboard's `StatsBar.tsx`) and returns `known`, `learning`, `total_studied`, `streak`,
  `due_review`, `mistakes`, `grammar_lessons_passed`, `practice_exams_completed` — real, already-
  tested data. **Reusing this** (a new `getStats` proxy message in `background.js`, mirroring the
  existing `getLists` proxy) covers "words saved" and "due for review" honestly. The mockup's
  "saved from this site" and "N to A2 CEFR progress" have **no backing data anywhere** — dropped
  from scope rather than invented.
- Extension UI has no i18n (the "lang" setting in `options.html` is the *translation* target
  language, not a UI locale) — it's English-only by design. No RU/EN check applies. It's also not
  a responsive web surface (fixed-width Chrome popup + a content-script overlay on arbitrary
  pages) — no 375px mobile check applies; verification is Chromium desktop screenshots instead.

## Design decisions

1. **One shared theme file**, `extension/theme.js` — hex constants matching the real tokens
   (`ink #16181c`, `muted #8a8f98`, `line #d9d9d9`, `faint #b0b4ba`, `destructive #c2504a`,
   `emerald600 #0f9d68`, `emerald700 #0c7d54`) plus TAK's fixed brand colors copied from
   `frontend/components/Tak.tsx` (`BODY #ec3013`, `LIMB #201e1d`, `EYE_BG #f3f2f2`) and a
   `takBareSVG(size)` helper that reproduces `Tak.tsx`'s `bare` mode (body polygon + eyes only, no
   limbs/mouth/float — the exact variant its own doc comment says is "for use inside a control").
   Included via a plain `<script src="theme.js">` before `popup.js`/`options.js`, and added to
   `content_scripts` in `manifest.json` right before `content.js` so `content.js` can use the same
   globals. One file, no build step, no new dependency.
2. **Every ad-hoc color is replaced by a token, no new colors invented**:
   - `#006A44` (connect button, icon bg, title text) → `emerald600`.
   - `#10b981` (stressed-syllable underline) → `emerald600`.
   - `#FFB81C` (upgrade button) → `emerald600` — same slot as the premium "Add" button (mutually
     exclusive states, never shown together), and matches `PremiumOfferCard.tsx`'s own CTA color
     (`bg-emerald-600`), so this also fixes an inconsistency instead of inventing a new gold.
   - `#C1272D` (add button) → `emerald600` — no other primary CTA in the app is red; red is
     `destructive` and this isn't a destructive action.
   - Neutrals (`#111827`, `#6b7280`, `#374151`, `#e5e7eb`, `#d1d5db`) → `ink`/`muted`/`line`
     respectively.
3. **Buttons**: `rounded-[10px]`, no shadow, `text-sm font-semibold` sizing translated to the
   popup's px scale — primary `emerald600`/`emerald700` hover, secondary white + `line` border,
   ghost = text-only `muted`/`ink`, matching the documented button spec.
4. **Cards**: `border-line`, `rounded-[14px]` (outer) / `12px` (nested), matching the doc.
   **Deliberate deviation, to record in the component library's deviation table**: the *floating*
   on-page icon and card in `content.js` keep their `box-shadow` (unlike in-app flat cards) —
   they render on top of arbitrary, unpredictable page backgrounds (dark sites, busy sites), so
   they need their own elevation to read as floating UI at all; an in-app card never has this
   problem because it always sits on the app's own white page.
5. **Badges/pills** (premium/free/admin tag in the popup): `rounded-full`, borderless filled per
   the doc's pill rule (not the old outlined `.badge` classes) — filled `emerald600`-tint for
   premium/admin, filled `line-soft`/`muted` for free.
6. **Font**: keep `system-ui` in the extension (not Inter). Another deliberate deviation: a content
   script injecting a web font onto arbitrary third-party pages adds latency and can hit page CSP;
   the popup/options pages are small, chrome-only surfaces where a system font is an acceptable,
   simpler choice than bundling font files into the extension zip. Record this too.
7. **Popup stats**: new `getStats` message type in `background.js` (mirrors `getLists`'s existing
   proxy pattern) calling `GET /me/stats`. Popup shows `known + learning` as "words saved", and a
   "Review N words" primary button only when `due_review > 0` (no button for a zero count — avoids
   a dead CTA). Streak shown as a small secondary line. No per-site count, no CEFR line — not
   invented.
8. **TAK usage**: `takBareSVG` for the on-page collapsed icon (replacing the green "f." circle),
   the popup header (replacing the plain "f." wordmark dot), and the options page header. A single
   CSS bounce keyframe (mirroring `tak-bounce` naming from `frontend/app/globals.css`) plays once on
   the "Added!" button-text swap in `content.js`'s footer — no new animated walking-limb SVG, since
   `bare` mode is exactly the "icon inside a control" case this is.

No backend changes (`/me/stats` already exists and is already tested).

## Implementation

- [x] Create `extension/theme.js` with the token hex constants listed above and a `takBareSVG(size)`
      helper reproducing `Tak.tsx`'s `bare` mode (body polygon + eyes, no limbs/mouth).
- [x] Add `theme.js` to `manifest.json`'s `content_scripts.js` array (before `content.js`) and bump
      the manifest `version` (extension convention: any `extension/` change bumps it).
- [x] Restyle `extension/popup.html` + `popup.js` onto the tokens/button spec; add the `getStats`
      call, the "words saved" stat, and a "Review N words" button shown only when `due_review > 0`.
- [x] Add a `getStats` message type to `extension/background.js` that proxies `GET /me/stats`
      (mirror the existing `getLists` proxy pattern).
- [x] Restyle `extension/options.html` + `options.js` onto the tokens (no behavior change).
- [x] Restyle `extension/content.js`: replace every ad-hoc hex across `showIcon`, `showCard`,
      `makeGlossInput`, `renderAccentedInto`, `makeButton`, `renderFooter` with theme tokens; swap
      the collapsed icon and card-header mark for `takBareSVG`; add one CSS bounce keyframe that
      plays on the "Added!" button-text swap. Keep `box-shadow` on the floating icon/card
      (deliberate deviation, already justified above — do not strip it to match flat in-app cards).
- [x] Update `documentation/design system/Component Library (as-built).html`: remove "extension"
      from the "never given a design pass" list (~line 196-198), and add both deliberate deviations
      (floating-overlay shadow, extension keeps `system-ui` not Inter) to the deviations table.
- [x] Append a `#34` entry to `documentation/CHANGELOG.md`.
- [x] Write a throwaway Playwright script (e.g. under `temp_files/screenshots/plan_34_extension-redesign/capture.mjs`)
      that: (a) opens `popup.html` and `options.html` directly via `file://` with `chrome.runtime`/
      `chrome.storage` stubbed inline, screenshotting not-connected / free / premium(with and
      without due_review) / options states; (b) loads the real unpacked extension via
      `chromium.launchPersistentContext` with `--load-extension`/`--disable-extensions-except`
      against a trivial local static test page, screenshotting the collapsed icon, the expanded
      card in each connection state, and the "Added!" bounce. All screenshots saved into
      `temp_files/screenshots/plan_34_extension-redesign/`.

## Validation

- [x] `node --check extension/background.js && node --check extension/content.js && node --check extension/options.js && node --check extension/popup.js && node --check extension/theme.js`
- [x] `cd backend && python -m pytest tests/test_extension.py -q`
- [x] `cd backend && python -m pytest -q`
- [x] `cd frontend && npm run build`
- [x] `node temp_files/screenshots/plan_34_extension-redesign/capture.mjs` (must exit 0 and leave
      screenshot files in `temp_files/screenshots/plan_34_extension-redesign/`)
- [x] Manual: open the produced screenshots and visually confirm tokens/TAK mark are applied
      correctly in every state (no literal command — human review, left for the user). Reviewed
      by the orchestrating session: popup (not-connected/free/premium-due/premium-nodue), options
      page, and on-page icon/card (free/premium/added) all show correct tokens, TAK bare mark, and
      state-appropriate CTAs.

## Definition of Done

- [x] `node --check extension/background.js && node --check extension/content.js && node --check extension/options.js && node --check extension/popup.js && node --check extension/theme.js`
- [x] `cd backend && python -m pytest tests/test_extension.py -q` — 52 passed
- [x] `cd backend && python -m pytest -q` — 573 passed
- [x] `cd frontend && npm run build` — succeeded
- [x] `node temp_files/screenshots/plan_34_extension-redesign/capture.mjs` — exit 0, 12 PNGs written
- [x] `grep -c '#[0-9a-fA-F]\{6\}' extension/popup.js extension/options.js extension/content.js` reports 0 for each (every ad-hoc hex moved into `theme.js`)
- [x] Screenshots reviewed for: collapsed icon, expanded card in all 3 connection states,
      saved-confirmation bounce, popup in all 4 states (not-connected / free / premium×due-or-not),
      options page — saved under `temp_files/screenshots/plan_34_extension-redesign/`. RU/EN check
      does not apply (extension UI has no i18n, English-only by design) and 375px mobile check does
      not apply (fixed-width Chrome popup + desktop-only content script) — both are N/A for this
      surface, not skipped.
- [x] CHANGELOG.md has a `#34` entry; component library doc updated (extension removed from
      "not redesigned" list, both deviations recorded).
