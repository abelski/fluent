export type TakPose = 'idle' | 'stonks' | 'grin' | 'talking';

interface TakProps {
  pose?: TakPose;
  size?: number;
  className?: string;
  /**
   * Badge treatment: body and eyes only — no limbs, no mouth, no float.
   * Used where TAK sits inside a control (the bug-report FAB) rather than
   * standing on his own, matching the prototypes' inline FAB mascot.
   */
  bare?: boolean;
}

// TAK's colors are fixed brand constants — never themed to the surrounding page.
const BODY = '#ec3013';
const LIMB = '#201e1d';
const EYE_BG = '#f3f2f2';

interface PoseSpec {
  armL: string;
  armR: string;
  armSwing?: readonly [string, string];
  legL?: string;
  legR?: string;
  eyes: 'flat' | 'squint';
  mouth: string;
  mouthFill: string;
  /** Celebration poses animate faster than the resting float. */
  floatDur?: string;
  swingDur?: string;
}

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
    floatDur: '2s',
    swingDur: '0.7s',
  },
};

function Eyes({ variant }: { variant: 'flat' | 'squint' }) {
  if (variant === 'squint') {
    return (
      <>
        <path d="M68,100 Q77,92 86,100" fill="none" stroke={LIMB} strokeWidth={4} strokeLinecap="round" />
        <path d="M94,100 Q103,92 112,100" fill="none" stroke={LIMB} strokeWidth={4} strokeLinecap="round" />
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
export default function Tak({ pose = 'idle', size = 44, className, bare = false }: TakProps) {
  const p = POSES[pose];
  const height = Math.round(size * 1.2);
  const floatDur = p.floatDur ?? '2.6s';
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
      <g style={{ animation: `tak-float ${floatDur} ease-in-out infinite` }}>
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
      </g>
    </svg>
  );
}
