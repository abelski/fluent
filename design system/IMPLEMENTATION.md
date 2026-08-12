# Design system → code mapping

> **Start with `Component Library (as-built).html`** — principles, colour tokens, logo rules and
> component specs live there. This file is the companion lookup: prototype value → Tailwind token →
> file. The prototypes in `prototypes/` remain the source of truth for *visual* decisions; this
> records *where* each decision lives in code so the two do not drift.

## Files

| File | Use it for |
|---|---|
| `Component Library (as-built).html` | Principles, tokens, logo, components, deliberate deviations |
| `prototypes/*.html` | Approved visual intent (extract the `__bundler/template` script to read) |
| `IMPLEMENTATION.md` (this file) | Value → token → file mapping |
| `frontend/tailwind.config.js` | Token definitions |
| `frontend/tests/design-system-parity.spec.ts` | Automated guard |

## Tokens — `frontend/tailwind.config.js`

The prototypes use raw hex in inline styles. In code they are Tailwind theme colors:

| Prototype value | Tailwind class | Role |
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
  The prototypes' wordmark is a `<span>` so it never inherited this; ours is a `<Link>`, so
  `Header.tsx` sets `text-ink` on it and greens only the trailing dot.
- `.page` — the shared content container: `max-width:1180px; margin:0 auto; padding-bottom:80px`.
  The navbar deliberately sits **outside** it and is full-bleed.
- `.row-hover:hover` — `#fafbfa`.
- `@keyframes tak-float` — the prototypes name it `takFloat`; the app uses kebab-case. When copying
  prototype markup, translate `animation:takFloat …` → `animation: tak-float …`.

## Logo

`22px / 700 / -0.02em`, wordmark `#16181c`, trailing dot `#0f9d68`, Inter. Never 28px, and the
letters are never green — see the component library's Logo section for the `<a>`-inheritance trap.

## Shell components

| Prototype element | File |
|---|---|
| navbar (full-bleed, `18px 32px`, no sticky/blur/shadow) | `frontend/components/Header.tsx` |
| nav tab pills + segmented RU/EN | `frontend/components/Header.tsx` |
| footer (transparent on the gradient, 1180px, 13px) | `frontend/components/Footer.tsx` |
| "Нашёл ошибку?" FAB | `frontend/components/MistakeButton.tsx` |
| TAK mascot (SVG poses) | `frontend/components/Tak.tsx` |
| Page mascot (bubble + standard size + mood) | `frontend/components/PageMascot.tsx` |
| Mascot mood scale | `frontend/lib/mascotMood.ts` |
| Top-nav page shell (`.page` container, no blur/shadow) | `frontend/app/dashboard/components/PageShell.tsx` |
| Hero stat card | `frontend/app/dashboard/components/ProgressStatCard.tsx` |

The tab strip scrolls horizontally (prototype `.navtabs`) but stays desktop-only; below `sm` the
hamburger dropdown takes over. The prototypes have no hamburger, but they were only drawn at desktop
width — the mobile menu is a deliberate app-only affordance.

## TAK

`Tak.tsx` implements nine poses. Four are the originals (`idle`, `talking`, `stonks`, `grin`); the
five mood poses — `hype`, `galaxy`, `sus`, `fine`, `lost` — are ported verbatim (limb rotations, eye
shapes, mouth paths, animation timings) from the `emotions` array in
`design system/Tak Mascot Standalone.html`. Each pose can override the whole-figure animation via
`anim` and the limb swing via `swingDur`; keyframes (`tak-float`, `tak-bounce`, `tak-shake`,
`tak-pulse`, `tak-wobble`) live in `frontend/app/globals.css`. `sus` is deliberately motionless.

Extract the source poses with:

```
python3 -c "import re,json;s=open('design system/Tak Mascot Standalone.html').read();print(json.loads(re.search(r'__bundler/template\"[^>]*>(.*?)</script>',s,re.S).group(1)))"
```

**Render `PageMascot`, not `Tak`.** `PageMascot.tsx` owns the standard 128px size, the speech bubble
and the mood→pose mapping, and every page uses exactly one. Raw `Tak` is only for the two `bare`
icon call sites.

`Tak` also takes a `bare` prop — body and eyes only, no limbs, mouth or float. That is the
treatment the prototypes use for a mascot sitting *inside a control*: the bug-report FAB
(`MistakeButton.tsx`) and the landing streak ring (`LandingClient.tsx`). Both are exempt from the
size rule and the one-mascot-per-page rule. Do not use the full mascot there.

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
😊/😢; it now renders `<PageMascot phrase="Valio!" mood={…} />`. Functional icons (locks,
checkmarks, arrows) are *not* replaced.

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
- Type is Inter throughout — the prototypes use no second display face, so `font-headline` (Manrope)
  is not applied on the redesigned pages.
- Breakpoints follow the prototype media queries: 3→2 columns at `1000px`, →1 column at `860px`
  (`min-[860px]:` / `min-[1000px]:` / `max-[860px]:`), not Tailwind's default `sm`/`md`.

## Deliberate deviations from the prototypes

- **Mobile hamburger** — kept (see above).
- **FAB label on mobile** — hidden below `sm`, leaving the mascot as a round icon button. The
  prototype keeps the label at 13px; the app hides it to protect the tap target on narrow screens.
- **Mood 0 renders `talking`, not `IDLE`** — every page mascot now carries a bubble, so the neutral
  state should look like he is speaking. `idle` is kept for the bubble-less `bare` call sites.
- **Grammar's 3-card stat grid collapsed into one `ProgressStatCard`** — matches the hero-card
  pattern Слова/Фразы already used. The standalone "tip" card's encouragement copy moved into the
  hero's milestone caption rather than being dropped.
- **Secondary label contrast** — the prototypes set the stage label / part-of-speech hint at
  `#b0b4ba`, and the app had drifted lighter still to `gray-300` `#d1d5db`. Both were reported
  unreadable, so these labels use `#5b6067` (the design system's own darker secondary, from its
  chips), which clears WCAG AA at small caps sizes.

## Parity guard

`frontend/tests/design-system-parity.spec.ts` asserts the gradient, the brand green, the full-bleed
navbar, the 1180px container, the segmented language pill, and the absence of decorative blur blobs.
The container and blur-blob checks run across all 5 top-nav pages (`NAV_PAGES` in that spec) — add a
new top-nav page's URL there when one is added, so the shell can't silently drift again.
