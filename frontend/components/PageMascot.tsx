import Tak from './Tak';
import { moodPhrase, moodPose, MOOD_NEUTRAL } from '../lib/mascotMood';

interface PageMascotProps {
  /** The page's own phrase, shown while TAK is at neutral mood. */
  phrase: string;
  /** -3..+3. Defaults to neutral — only session screens track a mood. */
  mood?: number;
  /** px. Defaults to the standard 128; callers should not normally pass this. */
  size?: number;
  className?: string;
}

/** The one standard mascot size. Every page uses this. */
export const MASCOT_SIZE = 128;

// TAK + a comic speech bubble — the single reusable page mascot.
// Exactly one of these per rendered screen; pose and phrase follow `mood`.
export default function PageMascot({
  phrase,
  mood = MOOD_NEUTRAL,
  size = MASCOT_SIZE,
  className,
}: PageMascotProps) {
  // Bubble tail and head overlap are proportional so the bubble keeps pointing
  // at TAK's head if a call site ever scales him.
  const tailLeft = Math.round(size * 0.33);
  const overlap = Math.round(size * 0.22);

  return (
    <div className={className} data-testid="page-mascot" data-mood={mood}>
      <div className="relative bg-white border border-gray-100 rounded-xl px-4 py-2 font-bold text-sm w-fit">
        {moodPhrase(mood, phrase)}
        <span
          className="absolute -bottom-2 rotate-45 w-3.5 h-3.5 bg-white border-r border-b border-gray-100"
          style={{ left: tailLeft }}
        />
      </div>
      <span className="block" style={{ marginTop: -overlap }}>
        <Tak pose={moodPose(mood)} size={size} className="block" />
      </span>
    </div>
  );
}
