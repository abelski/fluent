// Shared design tokens for the extension UI — pixel-matches
// `temp_files/redesign extention/Fluent Extension.dc.html`'s own "modernist"
// design system (`_ds/modernist-.../styles.css`), NOT the site's
// ink/muted/emerald tokens (see Plan #35 — supersedes Plan #34's choice).
// Plain global object, no build step, no modules: included via
// <script src="theme.js"> before popup.js/options.js in popup.html/
// options.html, and as the first entry in manifest.json's content_scripts.js
// so content.js can use the same globals.
const FLUENT_THEME = {
  bg: '#f3f2f2', // --color-bg
  surface: '#eae9e9', // --color-surface
  text: '#201e1d', // --color-text
  accent: '#ec3013', // --color-accent
  accentHover: '#dd2b0f', // --color-accent-600
  accentActive: '#ae1800', // --color-accent-700
  divider: 'rgba(32, 30, 29, 0.4)', // --color-divider: color-mix(#201e1d 40%, transparent)
  muted: 'rgba(32, 30, 29, 0.55)', // .text-muted: color-mix(#201e1d 55%, transparent)
  neutral300: '#d7d3d3', // --color-neutral-300
  neutral800: '#444141', // --color-neutral-800
  shadowLg: '0 12px 32px rgba(45, 43, 43, 0.22)', // --shadow-lg
  fontFamily: "'Archivo', system-ui, sans-serif",
  // `accent`/`text`/`bg` above are the exact same hex values as Tak.tsx's
  // fixed BODY/LIMB/EYE_BG brand constants — a deliberate coincidence (this
  // mockup's palette and TAK were designed together) — so the SVG helpers
  // below reuse these same three fields rather than a separate "tak" set.
};

// Reproduces Tak.tsx's `bare` mode: body polygon + eyes only, no limbs, no
// mouth, no float animation — "for use inside a control" per that
// component's own doc comment. Used for static marks (popup/options header,
// on-page translation card title). Returns a static SVG markup string (safe
// for innerHTML — no user input involved).
function takBareSVG(size) {
  const height = Math.round(size * 1.2);
  return (
    `<svg width="${size}" height="${height}" viewBox="0 0 200 240" aria-hidden="true">` +
    `<polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill="${FLUENT_THEME.accent}" />` +
    `<rect x="68" y="95" width="18" height="18" fill="${FLUENT_THEME.bg}" />` +
    `<rect x="94" y="95" width="18" height="18" fill="${FLUENT_THEME.bg}" />` +
    `<rect x="74" y="101" width="8" height="8" fill="${FLUENT_THEME.text}" />` +
    `<rect x="100" y="101" width="8" height="8" fill="${FLUENT_THEME.text}" />` +
    `</svg>`
  );
}

// Idle floating full body — mirrors the mockup's header mark and expanded
// "Add card" icon (`Fluent Extension.dc.html`, `takFloat` keyframe): fixed
// idle arms, flat eyes, flat mouth, whole figure floats. Same
// polygon/rect coordinates as Tak.tsx's `idle` pose. Caller must ensure the
// `tak-float` keyframe (see content.js/popup.html/options.html) is injected
// into whatever style scope this SVG renders into.
function takFloatSVG(size) {
  const height = Math.round(size * 1.2);
  return (
    `<svg width="${size}" height="${height}" viewBox="0 0 200 240" aria-hidden="true">` +
    `<g style="animation:tak-float 2.6s ease-in-out infinite;transform-origin:100px 130px;">` +
    `<polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill="${FLUENT_THEME.accent}" />` +
    `<g transform="rotate(-8 55 100)"><rect x="25" y="92" width="40" height="12" fill="${FLUENT_THEME.text}" /></g>` +
    `<g transform="rotate(8 148 100)"><rect x="138" y="92" width="40" height="12" fill="${FLUENT_THEME.text}" /></g>` +
    `<rect x="63" y="160" width="12" height="45" fill="${FLUENT_THEME.text}" />` +
    `<rect x="95" y="160" width="12" height="45" fill="${FLUENT_THEME.text}" />` +
    `<rect x="68" y="95" width="18" height="18" fill="${FLUENT_THEME.bg}" />` +
    `<rect x="94" y="95" width="18" height="18" fill="${FLUENT_THEME.bg}" />` +
    `<rect x="74" y="101" width="8" height="8" fill="${FLUENT_THEME.text}" />` +
    `<rect x="100" y="101" width="8" height="8" fill="${FLUENT_THEME.text}" />` +
    `<rect x="72" y="132" width="36" height="5" fill="${FLUENT_THEME.text}" />` +
    `</g>` +
    `</svg>`
  );
}

// Arms-up celebration — mirrors the mockup's saved-confirmation icon: native
// SVG <animateTransform> wiggles each arm (no CSS keyframe needed for that
// part), squint eyes, grin mouth, whole figure floats faster than idle.
// Same polygon/rect coordinates as Tak.tsx's `grin` pose eyes/mouth; legs
// stay straight and the body-level animation is `tak-float` at 1.4s, exactly
// as the mockup has it (not Tak.tsx's own `tak-bounce`-driven grin/hype).
function takWaveSVG(size) {
  const height = Math.round(size * 1.2);
  return (
    `<svg width="${size}" height="${height}" viewBox="0 0 200 240" aria-hidden="true">` +
    `<g style="animation:tak-float 1.4s ease-in-out infinite;transform-origin:100px 130px;">` +
    `<polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill="${FLUENT_THEME.accent}" />` +
    `<g transform="rotate(-150 55 100)">` +
    `<rect x="25" y="92" width="40" height="12" fill="${FLUENT_THEME.text}" />` +
    `<animateTransform attributeName="transform" type="rotate" values="-150 55 100;-170 55 100;-150 55 100" dur="0.7s" repeatCount="indefinite" additive="sum" />` +
    `</g>` +
    `<g transform="rotate(150 148 100)">` +
    `<rect x="138" y="92" width="40" height="12" fill="${FLUENT_THEME.text}" />` +
    `<animateTransform attributeName="transform" type="rotate" values="150 148 100;170 148 100;150 148 100" dur="0.7s" repeatCount="indefinite" additive="sum" />` +
    `</g>` +
    `<rect x="63" y="160" width="12" height="45" fill="${FLUENT_THEME.text}" />` +
    `<rect x="95" y="160" width="12" height="45" fill="${FLUENT_THEME.text}" />` +
    `<path d="M68,100 Q77,92 86,100" fill="none" stroke="${FLUENT_THEME.text}" stroke-width="4" stroke-linecap="round" />` +
    `<path d="M94,100 Q103,92 112,100" fill="none" stroke="${FLUENT_THEME.text}" stroke-width="4" stroke-linecap="round" />` +
    `<path d="M78,126 Q100,150 122,126 Z" fill="${FLUENT_THEME.text}" />` +
    `</g>` +
    `</svg>`
  );
}
