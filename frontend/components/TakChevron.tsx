import { BODY } from './Tak';

interface TakChevronProps {
  size?: number;
  className?: string;
  /** Which way the mark points. Mirrors the same geometry via CSS, no second path. */
  direction?: 'right' | 'left';
}

// TAK's torso is a chevron/pennant shape (see Tak.tsx's "chevron-torso skeleton"
// comment). This crops the viewBox tight to just that polygon's bounding box
// (x:55-148, y:70-160) so it reads as a small arrow glyph instead of a mostly
// empty character canvas at inline text sizes.
export default function TakChevron({ size = 11, className, direction = 'right' }: TakChevronProps) {
  return (
    <svg
      width={size}
      height={Math.round(size * (90 / 93))}
      viewBox="55 70 93 90"
      className={className}
      aria-hidden="true"
      style={direction === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill={BODY} />
    </svg>
  );
}
