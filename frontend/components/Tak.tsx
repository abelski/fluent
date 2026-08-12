export type TakPose =
  | 'idle'
  | 'stonks'
  | 'grin'
  | 'talking'
  | 'hype'
  | 'galaxy'
  | 'sus'
  | 'fine'
  | 'lost';

interface TakProps {
  pose?: TakPose;
  size?: number;
  className?: string;
  /**
   * Badge treatment: body and eyes only — no limbs, no mouth, no float.
   * Used where TAK sits inside a control (the bug-report FAB, the landing
   * streak ring) rather than standing on his own, matching the prototypes'
   * inline FAB mascot.
   */
  bare?: boolean;
}

// TAK's colors are fixed brand constants — never themed to the surrounding page.
export const BODY = '#ec3013';
export const LIMB = '#201e1d';
export const EYE_BG = '#f3f2f2';

type EyeVariant = 'flat' | 'squint' | 'wide' | 'spark' | 'x';

interface PoseSpec {
  armL: string;
  armR: string;
  armSwing?: readonly [string, string];
  legL?: string;
  legR?: string;
  eyes: EyeVariant;
  mouth: string;
  mouthFill: string;
  /** Whole-figure animation. Celebration poses run faster than the resting float. */
  anim?: string;
  swingDur?: string;
  /** THIS IS FINE only — the sweat bead beside the head. */
  sweat?: boolean;
}

// Poses are ported from the `emotions` array in
// `design system/Tak Mascot Standalone.html` — same chevron-torso skeleton,
// pushed into recognizable reaction poses.
const POSES: Record<TakPose, PoseSpec> = {
  idle: {
    armL: 'rotate(-8 55 100)',
    armR: 'rotate(8 148 100)',
    eyes: 'flat',
    mouth: 'M72,132 h36 v5 h-36 z',
    mouthFill: LIMB,
  },
  talking: {
    armL: 'rotate(-8 55 100)',
    armR: 'rotate(8 148 100)',
    eyes: 'squint',
    mouth: 'M85,133 Q100,140 115,133',
    mouthFill: 'none',
  },
  stonks: {
    armL: 'rotate(-45 55 100)',
    armR: 'rotate(-60 148 100)',
    armSwing: ['-45 55 100;-65 55 100;-45 55 100', '-60 148 100;-80 148 100;-60 148 100'],
    eyes: 'squint',
    mouth: 'M85,133 Q100,140 115,133',
    mouthFill: 'none',
  },
  grin: {
    armL: 'rotate(-150 55 100)',
    armR: 'rotate(150 148 100)',
    armSwing: ['-150 55 100;-170 55 100;-150 55 100', '150 148 100;170 148 100;150 148 100'],
    legL: 'rotate(15 69 160)',
    legR: 'rotate(-15 101 160)',
    eyes: 'squint',
    mouth: 'M78,126 Q100,150 122,126 Z',
    mouthFill: LIMB,
    anim: 'tak-bounce 1s ease-in-out infinite',
    swingDur: '0.7s',
  },
  galaxy: {
    armL: 'rotate(120 55 100)',
    armR: 'rotate(-120 148 100)',
    armSwing: ['110 55 100;135 55 100;110 55 100', '-110 148 100;-135 148 100;-110 148 100'],
    eyes: 'spark',
    mouth: 'M82,130 Q100,148 118,130',
    mouthFill: 'none',
    anim: 'tak-pulse 1.4s ease-in-out infinite',
    swingDur: '1s',
  },
  hype: {
    armL: 'rotate(160 55 100)',
    armR: 'rotate(-160 148 100)',
    armSwing: ['140 55 100;175 55 100;140 55 100', '-140 148 100;-175 148 100;-140 148 100'],
    legL: 'rotate(-10 69 160)',
    legR: 'rotate(10 101 160)',
    eyes: 'spark',
    mouth: 'M78,126 Q100,148 122,126 Z',
    mouthFill: LIMB,
    anim: 'tak-bounce 0.6s ease-in-out infinite',
    swingDur: '0.5s',
  },
  sus: {
    armL: 'rotate(-8 55 100)',
    armR: 'rotate(8 148 100)',
    eyes: 'squint',
    mouth: 'M88,133 h24 v4 h-24 z',
    mouthFill: LIMB,
    // The Among Us "sus" pause — deliberately frozen, the only motionless pose.
    anim: 'none',
  },
  fine: {
    armL: 'rotate(-4 55 100)',
    armR: 'rotate(4 148 100)',
    armSwing: ['-4 55 100;-16 55 100;-4 55 100', '4 148 100;16 148 100;4 148 100'],
    eyes: 'flat',
    mouth: 'M85,133 Q100,131 115,133',
    mouthFill: 'none',
    anim: 'tak-shake 0.6s ease-in-out infinite',
    swingDur: '0.6s',
    sweat: true,
  },
  lost: {
    armL: 'rotate(75 55 100)',
    armR: 'rotate(-75 148 100)',
    armSwing: ['75 55 100;95 55 100;75 55 100', '-75 148 100;-95 148 100;-75 148 100'],
    legL: 'rotate(5 69 160)',
    legR: 'rotate(-5 101 160)',
    eyes: 'x',
    mouth: 'M85,134 h30 v3 h-30 z',
    mouthFill: LIMB,
    anim: 'tak-wobble 1.2s ease-in-out infinite',
    swingDur: '1.1s',
  },
};

function Eyes({ variant }: { variant: EyeVariant }) {
  if (variant === 'squint') {
    return (
      <>
        <path d="M68,100 Q77,92 86,100" fill="none" stroke={LIMB} strokeWidth={4} strokeLinecap="round" />
        <path d="M94,100 Q103,92 112,100" fill="none" stroke={LIMB} strokeWidth={4} strokeLinecap="round" />
      </>
    );
  }
  if (variant === 'wide') {
    return (
      <>
        <circle cx={77} cy={97} r={14} fill={EYE_BG} />
        <circle cx={79} cy={97} r={8} fill={LIMB} />
        <circle cx={103} cy={97} r={14} fill={EYE_BG} />
        <circle cx={105} cy={97} r={8} fill={LIMB} />
      </>
    );
  }
  if (variant === 'spark') {
    return (
      <>
        <circle cx={77} cy={97} r={15} fill={EYE_BG} stroke={LIMB} strokeWidth={2.5} />
        <circle cx={79} cy={94} r={7} fill={BODY} />
        <circle cx={103} cy={97} r={15} fill={EYE_BG} stroke={LIMB} strokeWidth={2.5} />
        <circle cx={105} cy={94} r={7} fill={BODY} />
      </>
    );
  }
  if (variant === 'x') {
    return (
      <>
        <line x1={70} y1={90} x2={86} y2={106} stroke={LIMB} strokeWidth={4} />
        <line x1={86} y1={90} x2={70} y2={106} stroke={LIMB} strokeWidth={4} />
        <line x1={96} y1={90} x2={112} y2={106} stroke={LIMB} strokeWidth={4} />
        <line x1={112} y1={90} x2={96} y2={106} stroke={LIMB} strokeWidth={4} />
      </>
    );
  }
  return (
    <>
      <rect x={68} y={95} width={18} height={18} fill={EYE_BG} />
      <rect x={94} y={95} width={18} height={18} fill={EYE_BG} />
      <rect x={74} y={101} width={8} height={8} fill={LIMB} />
      <rect x={100} y={101} width={8} height={8} fill={LIMB} />
    </>
  );
}

// TAK — Fluent's mascot. One per page, always these colors, always animated.
// Replaces decorative emoji only; never a functional icon (locks, checkmarks, arrows).
// Prefer PageMascot over rendering this directly — it owns the standard size and bubble.
export default function Tak({ pose = 'idle', size = 44, className, bare = false }: TakProps) {
  const p = POSES[pose];
  const height = Math.round(size * 1.2);
  const anim = p.anim ?? 'tak-float 2.6s ease-in-out infinite';
  const swingDur = p.swingDur ?? '1.8s';

  if (bare) {
    return (
      <svg
        width={size}
        height={height}
        viewBox="0 0 200 240"
        className={className}
        aria-hidden="true"
        data-testid="tak-mascot"
        data-pose="bare"
      >
        <polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill={BODY} />
        <rect x={68} y={95} width={18} height={18} fill={EYE_BG} />
        <rect x={94} y={95} width={18} height={18} fill={EYE_BG} />
        <rect x={74} y={101} width={8} height={8} fill={LIMB} />
        <rect x={100} y={101} width={8} height={8} fill={LIMB} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 200 240"
      className={className}
      aria-hidden="true"
      data-testid="tak-mascot"
      data-pose={pose}
    >
      <g style={{ animation: anim, transformOrigin: '100px 130px' }}>
        <polygon points="55,70 115,70 148,115 115,160 55,160 88,115" fill={BODY} />
        <g transform={p.armL}>
          <rect x={25} y={92} width={40} height={12} fill={LIMB} />
          {p.armSwing && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values={p.armSwing[0]}
              dur={swingDur}
              repeatCount="indefinite"
              additive="sum"
            />
          )}
        </g>
        <g transform={p.armR}>
          <rect x={138} y={92} width={40} height={12} fill={LIMB} />
          {p.armSwing && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values={p.armSwing[1]}
              dur={swingDur}
              repeatCount="indefinite"
              additive="sum"
            />
          )}
        </g>
        <rect x={63} y={160} width={12} height={45} fill={LIMB} transform={p.legL} />
        <rect x={95} y={160} width={12} height={45} fill={LIMB} transform={p.legR} />
        <Eyes variant={p.eyes} />
        <path
          d={p.mouth}
          fill={p.mouthFill}
          stroke={p.mouthFill === 'none' ? LIMB : 'none'}
          strokeWidth={p.mouthFill === 'none' ? 2.5 : 0}
          strokeLinecap="round"
        />
        {p.sweat && (
          <path
            d="M135,80 Q142,90 135,98 Q128,90 135,80 Z"
            fill={EYE_BG}
            stroke={LIMB}
            strokeWidth={1.5}
          />
        )}
      </g>
    </svg>
  );
}
