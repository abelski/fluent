'use client';

export type StarLevel = 1 | 2 | 3;

/**
 * Complexity selector — a three-stop pill the user cycles through.
 *
 * The knob and the track dots are driven by one STOPS table so they cannot
 * drift apart. They previously did: the dots were laid out with
 * `justify-between px-2.5` while the knob was positioned from its own set of
 * offsets, leaving the knob 3px inside the first and last dot.
 *
 * Geometry follows the design-system prototype: a borderless 44x24 track with
 * 3px padding and an 18px knob, so the knob sits flush in the track at each end.
 *
 * The knob is clipped to TAK's chevron-torso silhouette (same polygon as
 * `TakChevron`, renormalized to percentages of its own box) instead of a
 * circle. It stays `bg-ink`, not TAK's red — TAK's red is a brand constant
 * reserved for TAK himself, so this borrows the shape motif only.
 *
 * The concave notch on the shape's left side means only the right ~64.5% of
 * the box is ever unclipped, and that band shifts as it goes — there's no
 * single spot big enough to hold 2-3 star glyphs without them clipping into
 * each other, and even a small font-glyph dot (`•`) reads as a blurry blob at
 * this scale. Explicit 2.5px circle elements hold a crisp, legible shape
 * where a glyph doesn't, so the knob shows those and the fuller `★` rendering
 * is reserved for the hover tooltip below, where there's room for it.
 */
const STOPS: { knobLeft: string }[] = [
  { knobLeft: '3px' },
  { knobLeft: 'calc(50% - 9px)' },
  { knobLeft: 'calc(100% - 21px)' },
];

interface Props {
  value: StarLevel;
  onChange: (next: StarLevel) => void;
  /** Visible label rendered before the control, e.g. "Сложность:" */
  label: string;
  /** One description per level, shown in the hover tooltip. */
  levelLabels: [string, string, string];
  testId?: string;
}

export default function StarLevelToggle({ value, onChange, label, levelLabels, testId }: Props) {
  const stop = STOPS[value - 1];

  return (
    // items-center keeps the label and pill on a shared centre line; the whole
    // group is aligned against neighbouring text by the parent.
    <div className="flex items-center gap-2" data-testid={testId}>
      <span className="text-[13px] text-muted leading-none">{label}</span>
      <div className="relative group flex items-center">
        <button
          onClick={() => onChange((value === 3 ? 1 : value + 1) as StarLevel)}
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={1}
          aria-valuemax={3}
          role="slider"
          data-testid="star-toggle"
          data-star-level={value}
          className="relative block w-11 h-6 p-[3px] rounded-full bg-[#f2f3f3] transition-colors"
        >
          <span
            className="absolute top-1/2 -translate-y-1/2 h-[18px] w-[18px] bg-ink transition-all duration-300 ease-out flex items-center justify-end gap-[1px] pr-[2px]"
            style={{
              left: stop.knobLeft,
              clipPath: 'polygon(0% 0%, 64.5% 0%, 100% 50%, 64.5% 100%, 0% 100%, 35.5% 50%)',
            }}
          >
            {Array.from({ length: value }, (_, i) => (
              <span key={i} className="h-[2.5px] w-[2.5px] shrink-0 rounded-full bg-white" />
            ))}
          </span>
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity z-50">
          {'★'.repeat(value)} — {levelLabels[value - 1]}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}
