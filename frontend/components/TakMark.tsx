import { BODY, LIMB, EYE_BG } from './Tak';

interface TakMarkProps {
  size?: number;
  className?: string;
}

// TAK's torso + face, cropped tight to the polygon's bounding box (same crop
// as TakChevron) rather than Tak's padded 0-240 canvas — this is the "TAK
// mark" from the primary lockup in `documentation/design system/Fluent Logo.html`, which
// sizes to the shape's own silhouette, not the mascot's full standing frame.
// Used for the header logo only; every other icon call site uses `Tak bare`.
export default function TakMark({ size = 19, className }: TakMarkProps) {
  return (
    <svg
      width={size}
      height={Math.round(size * (90 / 93))}
      viewBox="55 70 93 90"
      className={className}
      aria-hidden="true"
    >
      <polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill={BODY} />
      <rect x={68} y={95} width={18} height={18} fill={EYE_BG} />
      <rect x={94} y={95} width={18} height={18} fill={EYE_BG} />
      <rect x={74} y={101} width={8} height={8} fill={LIMB} />
      <rect x={100} y={101} width={8} height={8} fill={LIMB} />
    </svg>
  );
}
