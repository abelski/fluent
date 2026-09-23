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

# Plan #35 — Extension redesign: pixel-match Fluent Extension.dc.html

## Context

Plan #34 restyled the extension onto the *site's* shipped tokens (`emerald-600`/`ink`/`muted`).
The user rejected that: they want the extension to look **exactly** like
`temp_files/redesign extention/Fluent Extension.dc.html`, a separate, self-contained mockup that
uses its own "modernist" design system (`temp_files/redesign extention/_ds/modernist-.../styles.css`)
— Archivo font, sharp `0px` corners, a red/black/off-white palette — not the site's tokens at all.

This plan **supersedes #34's color/font choice only**. The plumbing #34 built stays: `getStats`
proxy in `background.js`, the theme.js/manifest wiring pattern, the screenshot-based verification
approach. What changes is every visual value, plus two structural pieces the mockup depicts that
#34 didn't build (a real "level" pill instead of a free/premium pill, a distinct saved-confirmation
view instead of a button-text swap) and one piece the mockup depicts that we're deliberately not
replicating in full (see decisions below).

Confirmed with the user along the way:
- **"Saved from this site" stat** (mockup) → replaced with **overall words saved** (user's explicit
  call — no per-site tracking exists, and the user doesn't want it built for this).
- **"N to A2" CEFR progress** → real, not dropped: `GET /api/admin/settings/cefr-thresholds` already
  exists (public, no auth) with real thresholds (A1=500, A2=1000, B1=2000...), so this combines
  with `/api/me/stats`'s word count honestly.
- **"repeats tomorrow"** (mockup's saved-confirmation subtext) → dropped. Confirmed via
  `backend/routers/extension.py:646-745`: adding a word creates no `UserWordProgress`/schedule row
  at all — there's no next-review date to report. Replaced with the real ordinal ("154th word
  saved"). **Correction caught during validation**: the first implementation pass computed this
  (and the popup's headline "words saved" stat) from `/me/stats`'s `known+learning` — but since
  adding a word creates no `UserWordProgress` row either, that number never actually moves when
  you save one via the extension; it would show the same stale figure forever until the word is
  studied elsewhere. Fixed to sum `word_count` across `GET /me/word-lists` (already fetched via
  the existing `getLists` proxy) instead — unfiltered by study status, so it increments the
  instant a word is saved. Used consistently for the popup's headline stat, the CEFR progress bar,
  and the saved-confirmation ordinal.
- **Undo button** (mockup's saved-confirmation) → **skipped**, user's explicit call, even though a
  real delete endpoint exists (`DELETE /me/word-lists/words/{id}`) that would have made it honest.
- **"Highlight saved words on this page"** button (mockup's toolbar) → **repurposed**, user's
  explicit call: today's `content.js` has no page-scanning/highlighting feature at all (that would
  be a real net-new feature: fetch the user's full saved-word list, walk the page's text nodes,
  mark matches — out of scope for a redesign). The button stays visually but points at
  `/dashboard/vocabulary` instead, with its label changed to match what it actually does (keeping
  the old label pointing at a different action would be dishonest UI).
- **"⌥ S" shortcut hint** (mockup's collapsed badge) → made real rather than dropped: a small
  `Alt+S`-on-selection keydown handler is added to `content.js` (mirrors the existing
  Escape/scroll/blur dismiss-listeners already there) so the hint isn't decorative.

## Design tokens (from the mockup's own design-system file)

Source: `temp_files/redesign extention/_ds/modernist-baf80e94-d797-4d36-8636-0dbceeb03c72/styles.css`.

- `bg: #f3f2f2`, `surface: #eae9e9`, `text: #201e1d`, `accent: #ec3013`, `accentHover(600): #dd2b0f`,
  `accentActive(700): #ae1800`, `divider: rgba(32,30,29,0.4)`, `neutral300: #d7d3d3`,
  `neutral800: #444141`, `shadowLg: 0 12px 32px rgba(45,43,43,0.22)`.
- **Radius: `0px` everywhere** (`--radius-sm/md/lg` are all `0` in the source file) — sharp corners,
  not the site's rounded cards. This also means the earlier "keep box-shadow as a deliberate
  deviation from flat cards" note from #34 is moot: this design system *itself* specifies
  `box-shadow: var(--shadow-lg)` on elevated surfaces (its own `.dialog`/`.elev-lg` classes) —
  following the mockup exactly already includes the shadow, nothing to flag as a deviation there.
- **Font: Archivo**, weight 400 body / 800 headings+buttons (`--font-heading-weight: 800`).
  Convenient coincidence worth noting: `accent #ec3013` / `text #201e1d` / `bg #f3f2f2` are the
  *exact same hex values* as `Tak.tsx`'s `BODY`/`LIMB`/`EYE_BG` — this mockup's palette and TAK's
  fixed brand colors were clearly designed together, even though the shipped site later diverged
  onto `emerald-600`/`ink`. No new colors needed for TAK at all.
- **Font delivery differs by context, not by look** (implementation detail, not a visual deviation):
  `popup.html`/`options.html` are pages we fully control, opened rarely, on click — they load Archivo
  the same way the mockup does, a plain `<link>` to Google Fonts. `content.js` runs inside arbitrary
  third-party pages, where a remote font `<link>` would be subject to *that* page's CSP and adds
  network latency on every page visit — so it bundles two local `.woff2` files instead (already
  fetched and verified real Google Fonts files, latin + latin-ext subsets, ~33KB each, sitting in
  this session's scratchpad, covers weights 400/800 in one file each), referenced via
  `chrome.runtime.getURL()` inside the shadow root's own `<style>`, declared in
  `manifest.json`'s `web_accessible_resources` (required in MV3 for a page-context CSS `url()` to
  reach an extension-bundled file, even from inside a shadow root the content script created).

## Files touched

- `extension/fonts/archivo-latin.woff2`, `extension/fonts/archivo-latin-ext.woff2` — new, copied in
  from the scratchpad download.
- `extension/theme.js` — replace every token with the palette above; keep `takBareSVG`; add
  `takFloatSVG(size)` (idle floating full body, mirrors mockup's `takFloat` keyframe) and
  `takWaveSVG(size)` (arms-up celebration, mirrors mockup's arm `animateTransform` wiggle) —
  same polygon/rect coordinates as `Tak.tsx`, just the two additional poses the mockup uses.
- `extension/manifest.json` — add `web_accessible_resources` for `fonts/*.woff2`; bump version.
- `extension/popup.html` / `popup.js` — rebuild to mockup's "02 — Toolbar" layout exactly: header
  (TAK float mark + "fluent" wordmark + an outline **level** pill — real, computed from
  `known+learning` against the CEFR thresholds, replacing the free/premium pill #34 had; premium
  gating doesn't belong here at all, it only ever affected the on-page *add* action, not
  stats/review), stat block (big total + progress bar + "N to `<next level>`", hidden once the user
  is already at the top level), a 2-column row (**total words saved** | **due for review** — the
  left cell per the user's "just show overall saved words" call, replacing "saved from this site"),
  then 3 buttons in the mockup's exact order: primary "Review N words" (hidden, falls back to the
  next button as primary, when `due_review` is 0 — never a dead CTA), secondary "Open my
  vocabulary" (repurposed/relabeled Highlight button → `/dashboard/vocabulary`), ghost "Open
  fluent.lt →" (base site root). Disconnect + Backend-settings stay as small muted text links below
  the three — necessary chrome the mockup doesn't depict, styled to match its typographic
  conventions rather than invented.
- `extension/background.js` — add a `getCefrThresholds` proxy for
  `GET /api/admin/settings/cefr-thresholds` (mirrors the existing `getLists`/`getStats` proxy
  pattern).
- `extension/options.html` / `options.js` — restyle only (tokens/font), no structural change.
- `extension/content.js`:
  - Inject the two bundled fonts via `@font-face` + `chrome.runtime.getURL()` in the shadow root's
    style, alongside the existing `tak-bounce`-style keyframe injection point.
  - Collapsed state → a compact pill (was a bare 24px dot): TAK nod icon + "Save" label + a real
    "⌥S" hint, backed by a new `Alt+S`-on-active-selection keydown listener alongside the existing
    Escape/scroll/blur listeners.
  - Expanded card → mockup's exact "Add card" layout: 2px `text`-colored border, `0` radius,
    `shadow-lg`, TAK float icon in the header, Archivo throughout, stressed syllable in `accent`
    with an underline (was `emerald600`), `.input`/`.btn-primary` styling per the tokens above.
    Structure/logic (translate → gloss inputs → list picker → footer branch on
    connect/premium/admin) is unchanged from #34 — only the CSS values move.
  - Saved state → **new**, replacing the old button-text swap: TAK wave/hype icon + "Saved!" +
    the real ordinal ("Nth word saved", from a follow-up `getStats` call) for a genuinely new word,
    or "Already saved" + its location for the `already_added` case — one visual shape for both,
    single "Open list" button, no Undo.
- `documentation/design system/Component Library (as-built).html` — replace #34's two deviation
  rows (floating-shadow, system-ui-not-Inter — both now moot per above) with **one** corrected
  entry: the extension uses its own self-contained palette/font matching
  `temp_files/redesign extention/Fluent Extension.dc.html` pixel-for-pixel, not the site's
  `ink`/`muted`/`emerald-600` tokens, per explicit user direction (Plan #35) — record the hex values
  and why (a pre-existing, previously-unbuilt mockup the user wanted matched exactly, not
  reconciled with the site's later, different redesign).
- `documentation/CHANGELOG.md` — append `#35`, noting it supersedes #34's token choice.
- New screenshot script + folder: `temp_files/screenshots/plan_35_extension-mockup-match/capture.mjs`
  (adapted from #34's script — same Playwright approach, updated for the new states: level pill
  instead of free/premium pill in the popup, new collapsed-pill shape, new saved-confirmation
  layout; still needs to mock both a free and a premium user for the on-page card's
  Upgrade-vs-Add footer states, since that distinction still exists there, just not in the popup).

## Implementation

- [x] Copy the two Archivo `.woff2` files from the scratchpad into `extension/fonts/`.
- [x] Rewrite `extension/theme.js`: new palette constants, `0` radius, Archivo; keep `takBareSVG`;
      add `takFloatSVG(size)` and `takWaveSVG(size)`.
- [x] Update `extension/manifest.json`: `web_accessible_resources` for `fonts/*.woff2`; bump version.
- [x] Add `getCefrThresholds` proxy to `extension/background.js` (mirrors `getStats`).
- [x] Rebuild `extension/popup.html` + `popup.js` per the layout above (level pill, stat block +
      progress bar, 2-column row, 3-button footer + small Disconnect/settings links).
- [x] Restyle `extension/options.html` + `options.js` onto the new tokens (no structural change).
- [x] Rewrite `extension/content.js`: bundled-font injection, collapsed pill + real `Alt+S`
      listener, expanded card restyle, new distinct saved-confirmation view (no Undo).
- [x] Update the Component Library doc: replace #34's two deviation rows with the one corrected
      entry described above.
- [x] Append a `#35` CHANGELOG entry.
- [x] Write `temp_files/screenshots/plan_35_extension-mockup-match/capture.mjs` (adapt #34's script)
      covering: popup (not-connected, connected+low-level+due, connected+high-level+no-due),
      options page, on-page collapsed pill, expanded card (free + premium), saved-confirmation
      (new word + already-added).

## Validation

- [x] `node --check extension/background.js && node --check extension/content.js && node --check extension/options.js && node --check extension/popup.js && node --check extension/theme.js`
- [x] `cd backend && python -m pytest tests/test_extension.py -q`
- [x] `cd backend && python -m pytest -q`
- [x] `cd frontend && npm run build`
- [x] `node temp_files/screenshots/plan_35_extension-mockup-match/capture.mjs` (must exit 0 and
      leave screenshot files in `temp_files/screenshots/plan_35_extension-mockup-match/`)
- [x] Manual: open the produced screenshots and visually compare against
      `temp_files/redesign extention/Fluent Extension.dc.html` state by state (no literal command —
      human review, done by the orchestrating session, not skipped). Reviewed all 9: popup (3
      states — level pill/progress bar/2-col row correct, top-level state correctly hides the
      progress bar and promotes "Open my vocabulary" to primary instead of a dead "Review 0"),
      options page, collapsed pill, expanded card (free + premium — correct Upgrade-vs-Add
      button), saved-confirmation (new word shows the wave pose + ordinal-or-fallback text;
      already-added shows the location, no ordinal claim). Sharp corners, 2px black border,
      Archivo, red accent, shadow-lg on floating elements — all match the mockup.

## Definition of Done

- [x] `node --check extension/background.js && node --check extension/content.js && node --check extension/options.js && node --check extension/popup.js && node --check extension/theme.js`
- [x] `cd backend && python -m pytest tests/test_extension.py -q` — 52 passed
- [x] `cd backend && python -m pytest -q` — 573 passed
- [x] `cd frontend && npm run build` — succeeded
- [x] `node temp_files/screenshots/plan_35_extension-mockup-match/capture.mjs` — exit 0, 9 PNGs
- [x] Screenshots reviewed against the mockup for: popup (3 states), options page, collapsed pill,
      expanded card (free + premium), saved-confirmation (new + already-added) — saved under
      `temp_files/screenshots/plan_35_extension-mockup-match/`. No RU/EN check applies (extension UI
      has no i18n, English-only) and no 375px check applies (fixed-width Chrome popup + desktop
      content-script overlay) — both N/A for this surface, not skipped.
- [x] CHANGELOG.md has a `#35` entry (corrected post-hoc to describe the real `getLists`-based word
      count, not the originally-planned `known+learning`); component library doc's deviation table
      has the one corrected entry (not the two moot ones from #34).
