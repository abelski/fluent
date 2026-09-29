'use client';

// #56 — «Куда уходят усилия»: leaderboard points split by section (words / phrases /
// grammar), this week vs all time, as shares on a 3-axis radar. Sits under
// <Leaderboard /> on the signed-in home. See documentation/effort-radar.md.

import { Fragment, useEffect, useState } from 'react';
import { getEffort, getToken, type EffortBreakdown, type EffortPoints } from '../lib/api';
import { useT } from '../lib/useT';

const AXES = [
  { key: 'words', href: '/dashboard/lists' },
  { key: 'phrases', href: '/dashboard/phrases' },
  { key: 'grammar', href: '/dashboard/grammar' },
] as const;
type AxisKey = (typeof AXES)[number]['key'];

// Series colours: tokens emerald-700 (this week) and effort-all (all time), via classes.
const WEEK = { fill: 'fill-emerald-700', stroke: 'stroke-emerald-700', bg: 'bg-emerald-700', text: 'text-emerald-700' };
const ALL = { fill: 'fill-effort-all', stroke: 'stroke-effort-all', bg: 'bg-effort-all' };

const R = 110;
const RINGS = [10, 25, 50, 100];
const angle = (i: number) => ((-90 + i * 120) * Math.PI) / 180;
// Square-root radius: word points dominate, so a linear scale squashes the other axes
// into the centre. Order is kept, small shares stay readable.
const radius = (share: number) => R * Math.sqrt(Math.max(0, share) / 100);
const point = (i: number, share: number): [number, number] =>
  [Math.cos(angle(i)) * radius(share), Math.sin(angle(i)) * radius(share)];
const poly = (shares: number[]) => shares.map((v, i) => point(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');

const values = (p: EffortPoints) => AXES.map((a) => p[a.key]);
const sum = (vs: number[]) => vs.reduce((x, y) => x + y, 0);
const shares = (vs: number[]) => { const s = sum(vs); return vs.map((v) => (s ? Math.round((v / s) * 100) : 0)); };
const top = (vs: number[]) => vs.indexOf(Math.max(...vs));

/** "**x**" → bold, for the insight templates. */
function Bold({ text }: { text: string }) {
  return <>{text.split('**').map((part, i) => (i % 2 ? <b key={i} className="font-bold">{part}</b> : <Fragment key={i}>{part}</Fragment>))}</>;
}

export default function EffortRadar() {
  const { tr } = useT();
  const t = tr.landing;
  const [data, setData] = useState<EffortBreakdown | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    getEffort().then(setData).catch(() => setData(null));
  }, []);

  if (!getToken() || !data) return null;
  const weekPts = values(data.week);
  const allPts = values(data.all);
  if (sum(allPts) === 0) return null;

  const noWeek = sum(weekPts) === 0;
  const W = shares(weekPts);
  const A = shares(allPts);
  const name = (i: number) => t.effortAxes[AXES[i].key as AxisKey];
  const fill = (tpl: string, vals: Record<string, string | number>) =>
    Object.entries(vals).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl);

  const insight = noWeek
    ? fill(t.effortAllOnly, { a: name(top(A)), p: A[top(A)] })
    : top(W) === top(A)
      ? fill(t.effortSame, { a: name(top(W)), p: W[top(W)] })
      : fill(t.effortShift, { a: name(top(W)), p: W[top(W)], b: name(top(A)), q: A[top(A)] });
  const summary = `${t.effortTitle}: ` + AXES.map((_, i) => `${name(i)} ${noWeek ? '' : `${W[i]}% / `}${A[i]}%`).join(', ');
  const cell = (share: number, pts: number) => `${share}% · ${pts} ${t.effortPts}`;

  // Label placement per axis: top, bottom-right, bottom-left.
  const anchors = ['middle', 'start', 'end'] as const;
  const offsets = [[0, -14], [8, 16], [-8, 16]];
  const tip = active === null ? null : point(active, Math.max(W[active], A[active]));

  return (
    <section data-testid="effort-radar" className="relative bg-white rounded-[14px] border border-line p-5 flex flex-col gap-3" aria-labelledby="effort-title">
      <p id="effort-title" className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.effortTitle}</p>
      <p data-testid="effort-insight" className="text-sm leading-snug text-ink"><Bold text={insight} /></p>
      {noWeek && (
        <p data-testid="effort-empty-week" className="text-[13px] text-muted bg-[#f2f3f3] rounded-[10px] px-3 py-2">{t.effortEmptyWeek}</p>
      )}

      <div className="relative w-full max-w-[340px] mx-auto">
        <svg viewBox="-170 -140 340 250" role="img" aria-label={summary} className="w-full h-auto overflow-visible block">
          {RINGS.map((v) => <polygon key={v} points={poly([v, v, v])} className="fill-none stroke-line-strong" strokeWidth={1} />)}
          {AXES.map((_, i) => { const [x, y] = point(i, 100); return <line key={i} x1={0} y1={0} x2={x} y2={y} className="stroke-line-strong" />; })}
          {[25, 50, 100].map((v) => { const [x, y] = point(0, v); return <text key={v} x={x + 5} y={y + 3} fontSize={9.5} className="fill-faint">{v}%</text>; })}
          <polygon points={poly(A)} className={`${ALL.fill} ${ALL.stroke}`} fillOpacity={0.28} strokeWidth={2} strokeLinejoin="round" />
          {!noWeek && <polygon points={poly(W)} className={`${WEEK.fill} ${WEEK.stroke}`} fillOpacity={0.22} strokeWidth={2} strokeLinejoin="round" />}
          {A.map((v, i) => { const [x, y] = point(i, v); return <circle key={`a${i}`} cx={x} cy={y} r={4.5} className={`${ALL.fill} stroke-white`} strokeWidth={2} />; })}
          {!noWeek && W.map((v, i) => { const [x, y] = point(i, v); return <circle key={`w${i}`} cx={x} cy={y} r={4.5} className={`${WEEK.fill} stroke-white`} strokeWidth={2} />; })}
          {AXES.map((a, i) => {
            const a1 = angle(i) - Math.PI / 3, a2 = angle(i) + Math.PI / 3, r = R + 30;
            return (
              <path
                key={`s${i}`}
                d={`M0,0 L${Math.cos(a1) * r},${Math.sin(a1) * r} A${r},${r} 0 0 1 ${Math.cos(a2) * r},${Math.sin(a2) * r} Z`}
                fill="transparent"
                tabIndex={0}
                aria-label={`${name(i)}: ${noWeek ? '' : `${t.effortWeek} ${cell(W[i], weekPts[i])}; `}${t.effortAll} ${cell(A[i], allPts[i])}`}
                data-testid={`effort-sector-${a.key}`}
                className="outline-none focus-visible:stroke-emerald-600"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
              />
            );
          })}
          {AXES.map((a, i) => {
            const [x, y] = point(i, 100);
            return (
              <a key={`l${i}`} href={a.href} data-testid={`effort-axis-${a.key}`}>
                <text x={x + offsets[i][0]} y={y + offsets[i][1]} textAnchor={anchors[i]} fontSize={12.5} fontWeight={600} className="fill-[#5b6067] hover:fill-emerald-700">
                  {name(i)}
                </text>
              </a>
            );
          })}
        </svg>
        {tip && active !== null && (
          <div
            data-testid="effort-tooltip"
            role="status"
            className="absolute pointer-events-none bg-ink text-white rounded-[10px] px-2.5 py-2 text-xs leading-normal whitespace-nowrap -translate-x-1/2 -translate-y-[110%] z-10"
            style={{ left: `${((tip[0] + 170) / 340) * 100}%`, top: `${((tip[1] + 140) / 250) * 100}%` }}
          >
            <b className="font-semibold">{name(active)}</b>
            {!noWeek && <div className="text-emerald-200">{t.effortWeek}: {cell(W[active], weekPts[active])}</div>}
            <div className="text-white/80">{t.effortAll}: {cell(A[active], allPts[active])}</div>
          </div>
        )}
      </div>

      <div className="flex gap-[18px] justify-center flex-wrap text-[12.5px] text-[#5b6067]" data-testid="effort-legend">
        {!noWeek && <span className="inline-flex items-center gap-1.5" data-testid="effort-legend-item"><i className={`w-3 h-3 rounded-[3px] ${WEEK.bg}`} />{t.effortWeek}</span>}
        <span className="inline-flex items-center gap-1.5" data-testid="effort-legend-item"><i className={`w-3 h-3 rounded-[3px] ${ALL.bg}`} />{t.effortAll}</span>
      </div>

      <table data-testid="effort-table" className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className="border-b border-line-strong">
            <th className="font-medium text-muted text-left py-1.5">{t.effortColArea}</th>
            {!noWeek && <th className="font-medium text-muted text-right py-1.5">{t.effortWeek}</th>}
            <th className="font-medium text-muted text-right py-1.5">{t.effortAll}</th>
          </tr>
        </thead>
        <tbody>
          {AXES.map((a, i) => (
            <tr key={a.key} className="border-b border-line-soft">
              <td className="text-left py-1.5"><a href={a.href} className="text-ink hover:text-emerald-700">{name(i)}</a></td>
              {!noWeek && <td className={`text-right py-1.5 font-semibold ${WEEK.text}`}>{cell(W[i], weekPts[i])}</td>}
              <td className="text-right py-1.5 text-[#5b6067]">{cell(A[i], allPts[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
