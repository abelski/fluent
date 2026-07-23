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
 * Geometry: 64x28 track with a 1px border → 62px padding box; 24px knob inset
 * 2px, so its centres land at 14px / 50% / (100% - 14px).
 */
const STOPS: { knobLeft: string; dotLeft: string }[] = [
  { knobLeft: '2px', dotLeft: '14px' },
  { knobLeft: 'calc(50% - 12px)', dotLeft: '50%' },
  { knobLeft: 'calc(100% - 26px)', dotLeft: 'calc(100% - 14px)' },
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
      <span className="text-sm text-gray-400 leading-none">{label}</span>
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
          className="relative block w-16 h-7 rounded-full bg-gray-100 border border-black transition-colors"
        >
          <span className="absolute inset-0 pointer-events-none">
            {STOPS.map((s, i) => (
              <span
                key={i}
                className="absolute top-1/2 w-0.5 h-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300"
                style={{ left: s.dotLeft }}
              />
            ))}
          </span>
          <span
            className="absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-gray-900 shadow-sm transition-all duration-300 ease-out flex items-center justify-center text-white text-[7px] leading-none tracking-tighter"
            style={{ left: stop.knobLeft }}
          >
            {'★'.repeat(value)}
          </span>
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
          {'★'.repeat(value)} — {levelLabels[value - 1]}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}
