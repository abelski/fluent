# Design system → code mapping

> **Start with `Component Library (as-built).html`** — principles, colour tokens, logo rules and
> component specs live there, and it is the source of truth for *visual* decisions. This file is
> the companion lookup: value → Tailwind token → file, so the two do not drift.

## Files

| File | Use it for |
|---|---|
| `Component Library (as-built).html` | Principles, tokens, logo, components, deliberate deviations |
| `IMPLEMENTATION.md` (this file) | Value → token → file mapping |
| `frontend/tailwind.config.js` | Token definitions |
| `frontend/tests/design-system-parity.spec.ts` | Automated guard |

## Tokens — `frontend/tailwind.config.js`

The original redesign mockups used raw hex in inline styles (now retired — see the component
library). In code they are Tailwind theme colors:

| Mockup value | Tailwind class | Role |
|---|---|---|
| `#0f9d68` | `emerald-600` (re-pointed) | accent green — words surface, primary CTAs, links |
| `#0c7d54` | `emerald-700` (re-pointed) | accent green hover |
| `#9333ea` | `purple-600` (stock) | phrases accent — phrase practice surface |
| `#16181c` | `ink` | body text, dark CTAs |
| `#8a8f98` | `muted` | secondary text |
| `#9a9fa6` | `muted-nav` | inactive nav/footer text |
| `#b0b4ba` | `faint` | captions, counts |
| `#ececec` | `line` | card borders, header rule |
| `#f1f1f1` | `line-strong` | panel header separator |
| `#f4f4f4` | `line-soft` | table row separator |
| `#c2504a` | `destructive` | destructive actions |

`emerald-600/700` are **re-pointed** to the brand green rather than introducing a `brand-*` name, so
the ~100 existing `emerald-600` call sites pick up the correct color with no migration. The rest of
the emerald scale is stock.

Values used inline as arbitrary Tailwind (no token): `#f2f3f3` (chip/track fill), `#fafbfa` (row
hover), `#fdf6e3`/`#f0e0a8`/`#8a6d1d` (warning), `#e9f6ee` (green tint), `#fdeceb`/`#c2504a` (red
tint), `#eef1ef` (progress track).

## Global rules — `frontend/app/globals.css`

- `body` — the page wash `linear-gradient(180deg,#eef4f1 0%,#f6f8f7 320px,#f7f8f8 100%)`.
  The middle stop is a fixed `320px`, so it must stay on `body` with `background-attachment: fixed`;
  putting it on a wrapper clips the ramp on short pages.
- `a` / `a:hover` — accent green. **Any link that should not be green needs an explicit text color.**
  The original mockup's wordmark was a `<span>` so it never inherited this; ours is a `<Link>`, so
  `Header.tsx` sets `text-ink` on it and greens only the trailing dot.
- `.page` — the shared content container: `max-width:1180px; margin:0 auto; padding-bottom:80px`.
  The navbar deliberately sits **outside** it and is full-bleed.
- `.row-hover:hover` — `#fafbfa`.
- `@keyframes tak-float` — the original mockup named it `takFloat`; the app uses kebab-case
  (`animation:takFloat …` → `animation: tak-float …`).

## Logo

`22px / 900 / -0.055em`, wordmark `#16181c`, Inter. Never 28px, and the letters are never green —
see the component library's Logo section for the `<a>`-inheritance trap. Weight/tracking follow
the primary lockup in `Fluent Logo.html`, scaled down from its 96px reference.

`TakMark` (`frontend/components/TakMark.tsx`) — TAK's torso + face cropped tight to the polygon's
bounding box, not `Tak`'s padded canvas — sits before the text (`gap-1`), followed by a round
`5px` dot. Both the mark and the dot are TAK's fixed orange `#ec3013` (`BODY`, exported from
`Tak.tsx`), not the site's green accent — the one deliberate exception, see the component
library's "Deliberate deviations" table.

`frontend/public/favicon.svg` uses the same bare-mark coordinates as `Tak.tsx`, on a rounded
`#f3f2f2` tile — previously an unrelated flag-colored "f." mark.

## Shell components

| Component | File |
|---|---|
| navbar (full-bleed, `18px 32px`, no sticky/blur/shadow) | `frontend/components/Header.tsx` |
| nav tab pills + segmented RU/EN | `frontend/components/Header.tsx` |
| footer (transparent on the gradient, 1180px, 13px) | `frontend/components/Footer.tsx` |
| "Нашёл ошибку?" FAB | `frontend/components/MistakeButton.tsx` |
| TAK mascot (SVG poses) | `frontend/components/Tak.tsx` |
| TAK chevron (decorative arrow mark) | `frontend/components/TakChevron.tsx` |
| TAK mark (tight-cropped logo icon) | `frontend/components/TakMark.tsx` |
| Page mascot (bubble + standard size + mood) | `frontend/components/PageMascot.tsx` |
| Mascot mood scale | `frontend/lib/mascotMood.ts` |
| Top-nav page shell (`.page` container, no blur/shadow) | `frontend/app/dashboard/components/PageShell.tsx` |
| Hero stat card | `frontend/app/dashboard/components/ProgressStatCard.tsx` |
| Complexity selector (chevron-clipped knob) | `frontend/app/dashboard/components/StarLevelToggle.tsx` |

The tab strip scrolls horizontally (mockup `.navtabs`) but stays desktop-only; below `1000px` the
hamburger dropdown takes over — not Tailwind's `sm` (640px). At 640-999px the 5 Russian nav labels
plus the language toggle and avatar/name don't fit on one line and wrapped into a broken second
row before this was widened; see "Deliberate deviations" below. The original mockups had no
hamburger, but they were only drawn at desktop width — the mobile menu is a deliberate app-only
affordance.

## TAK

`Tak.tsx` implements nine poses. Four are the originals (`idle`, `talking`, `stonks`, `grin`); the
five mood poses — `hype`, `galaxy`, `sus`, `fine`, `lost` — are ported verbatim (limb rotations, eye
shapes, mouth paths, animation timings) from the `emotions` array in
`documentation/design system/Tak Mascot Standalone.html`. Each pose can override the whole-figure animation via
`anim` and the limb swing via `swingDur`; keyframes (`tak-float`, `tak-bounce`, `tak-shake`,
`tak-pulse`, `tak-wobble`) live in `frontend/app/globals.css`. `sus` is deliberately motionless.

Extract the source poses with:

```
python3 -c "import re,json;s=open('documentation/design system/Tak Mascot Standalone.html').read();print(json.loads(re.search(r'__bundler/template\"[^>]*>(.*?)</script>',s,re.S).group(1)))"
```

**Render `PageMascot`, not `Tak`.** `PageMascot.tsx` owns the standard 128px size, the speech bubble
and the mood→pose mapping, and every page uses exactly one. Raw `Tak` is only for the two `bare`
icon call sites; the navbar logo uses `TakMark` instead (see Logo above), not `Tak bare`.

`Tak` also takes a `bare` prop — body and eyes only, no limbs, mouth or float. That is the
treatment used for a mascot sitting *inside a control*: the bug-report FAB
(`MistakeButton.tsx`) and the landing streak ring (`LandingClient.tsx`). Both are exempt from the
size rule and the one-mascot-per-page rule. Do not use the full mascot there.

`TakChevron.tsx` reuses TAK's torso polygon (the "chevron-torso skeleton") cropped tight to just
that shape, as a small standalone arrow mark — see the component library's TakChevron section.

`Tak` must not set inline `display`/`flex-shrink` — inline styles outrank utility classes, so a
`hidden sm:block` sibling would still render. Scale a single instance with `w-*`/`h-*` classes
instead of rendering one mascot per breakpoint.

### Mood

`lib/mascotMood.ts` is a plain hook, not a context — mood is per session and every consumer already
owns the mascot's render, so a provider would be over-engineering. `useMascotMood()` returns
`{ mood, recordAnswer(correct), reset() }`; `mood` starts at 0, moves ±1 per answer and clamps to
±3. A question timeout counts as wrong. Nothing is persisted: leaving the session or reloading
returns TAK to neutral, and pages outside a session pass no `mood` at all.

Wired into `QuizSession.tsx` (five answer handlers + the timeout effect), `PhraseSession.tsx`
(assemble / MCQ / type / syllable / forgot / timeout) and `app/dashboard/grammar/page.tsx`
(`checkAnswer`, reset in `startLesson`). Done screens pass `Math.max(mood, 1)` so a passed lesson
never shows a sad TAK.

Decorative emoji are **retired** in favour of TAK. The session-summary screen previously rendered
😊/😢; it now renders `<PageMascot phrase="Valio!" mood={…} />`. Decorative link/pagination arrows
are retired in favour of `TakChevron` the same way. Functional icons (locks, checkmarks, dropdown
carets) are *not* replaced — see the component library's Emoji & arrow policy.

## PageShell — the 5 top-nav dashboard pages

`PageShell.tsx` wraps Слова, Фразы, Грамматика, Практика and Статьи in the same shell: `.page`
(1180px), no decorative blur, no drop shadow. Historically only `/dashboard/grammar` and
`/dashboard/lists` used this — `design-system-parity.spec.ts` protected it there first, with tests
named "page content is constrained to the 1180px container" and "decorative blur blobs are gone".
Фразы/Практика/Статьи were on an older 896px/blur/shadow shell and have been migrated onto
`PageShell`; that older shell is retired, don't reintroduce it.

Two orderings, not one: Слова/Фразы/Практика put the hero `ProgressStatCard` *above* the title
(card → banner → title+subtitle → content) — guarded by `tests/stats-card-alignment.spec.ts`
("stats card is rendered above the page title"). Грамматика keeps title+subtitle → banner → hero →
content instead, because its beta-notice banner reads better directly under the title. Both are
intentional; don't introduce a third ordering. Every page ends the same way: main content → the
"browse all" link (`text-emerald-600 hover:text-emerald-700`). The mascot renders inside the hero's
`icon` prop; on
pages where the hero can be absent in a common state (Грамматика/Практика with no enrolled
content), the mascot falls back to beside the title so exactly one is always visible. Статьи has no
hero at all, so its mascot always sits beside the title.

## Conventions worth keeping

- Cards are flat: `border border-line rounded-[14px]`, **no drop shadow**, no accent-colored border.
- Buttons carry no shadow. Primary `bg-emerald-600 hover:bg-emerald-700`; dark `bg-ink`.
- Chips/badges are borderless filled pills, not outlined.
- Type is Inter throughout — the original mockups used no second display face, so `font-headline`
  (Manrope) is not applied on the redesigned pages.
- Breakpoints: 3→2 columns at `1200px`, →1 column at `860px` (`min-[860px]:` / `min-[1200px]:` /
  `max-[860px]:`), not Tailwind's default `sm`/`md`. (Card-grid columns specifically — see "3-column
  card grids" below for why 1200px, not the originally planned 1000px.)

## Deliberate deviations from the original mockups

- **Mobile hamburger** — kept (see above).
- **Hamburger breakpoint moved from `sm` (640px) to `1000px`** — `frontend/components/Header.tsx`
  used Tailwind's default `sm:hidden`/`hidden sm:flex` to switch between the hamburger and the
  full desktop tab strip. From 640-999px the logo, 5 nav pills, language toggle and avatar/name
  don't fit on one line, and the container's `flex-wrap` let the language toggle + avatar silently
  wrap onto an orphaned second row instead of the hamburger taking over. Moved every `sm:`
  variant tied to that toggle (`nav`, the hamburger button, the mobile dropdown, and the row's own
  gap/padding) to `min-[1000px]:`/`max-[1000px]:` — measured live, wrapping started below ~915px,
  1000px leaves margin for longer names.
- **FAB label on mobile** — hidden below `sm`, leaving the mascot as a round icon button. The
  mockup kept the label at 13px; the app hides it to protect the tap target on narrow screens.
- **Mood 0 renders `talking`, not `IDLE`** — every page mascot now carries a bubble, so the neutral
  state should look like he is speaking. `idle` is kept for the bubble-less `bare` call sites.
- **Grammar's 3-card stat grid collapsed into one `ProgressStatCard`** — matches the hero-card
  pattern Слова/Фразы already used. The standalone "tip" card's encouragement copy moved into the
  hero's milestone caption rather than being dropped.
- **Secondary label contrast** — the original mockup set the stage label / part-of-speech hint at
  `#b0b4ba`, and the app had drifted lighter still to `gray-300` `#d1d5db`. Both were reported
  unreadable, so these labels use `#5b6067` (the design system's own darker secondary, from its
  chips), which clears WCAG AA at small caps sizes.
- **Logo gains a `bare` TAK badge** — previously text-only. A fourth `bare` icon exemption.
- **TAK's chevron shape reused outside the mascot (`TakChevron`)** — decorative link/pagination
  arrows now use it; functional carets stay plain glyphs, deliberately out of scope.
- **`StarLevelToggle` knob clipped to TAK's chevron, kept `bg-ink`** — shape motif only, not TAK's
  red, which stays a mascot-exclusive brand constant.
- **3-column card grids switch at `1200px`, not the originally planned `1000px`** — Слова's "my
  list" cards and Фразы' "my list" cards carry an `Редактировать`/edit button alongside `Учить`; at
  a 1000px viewport (container ≈936px, ~300px per card) that second button pushed the word-count
  label onto two lines. 1200px keeps each card ≥~350px wide, wide enough for both buttons on one
  line. Applies to `app/dashboard/lists/page.tsx` (all three list grids), `app/dashboard/phrases/page.tsx`
  (both list/chapter grids) and `app/dashboard/articles/ArticlesList.tsx` (which uses Tailwind's
  `sm`/`lg` defaults instead, since its cards carry no edit button and only need a title + tags +
  one action).

## Parity guard

`frontend/tests/design-system-parity.spec.ts` asserts the gradient, the brand green, the full-bleed
navbar, the 1180px container, the segmented language pill, and the absence of decorative blur blobs.
The container and blur-blob checks run across all 5 top-nav pages (`NAV_PAGES` in that spec) — add a
new top-nav page's URL there when one is added, so the shell can't silently drift again.
